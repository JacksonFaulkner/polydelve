"""Download and process EPSS scores from FIRST daily CSV dumps."""
from datetime import date
from pathlib import Path

import duckdb
import httpx

BULK_URL = "https://epss.empiricalsecurity.com/epss_scores-{date}.csv.gz"
CACHE_DIR = Path("/tmp/epss_csv")


def download_day(day: date, cache_dir: Path = CACHE_DIR) -> Path:
    """Download EPSS CSV.gz for a given date. Returns path to file (cached if exists)."""
    dest = cache_dir / f"epss_{day.isoformat()}.csv.gz"
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    r = httpx.get(BULK_URL.format(date=day.isoformat()), timeout=60, follow_redirects=True)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def load_epss_for_packages(
    conn: duckdb.DuckDBPyConnection,
    csv_path: Path,
    today: date,
) -> int:
    """
    Join today's EPSS CSV against tracked packages via cve_history.
    Updates packages.epss_score and snapshots to epss_history where score changed or 10+ days stale.
    Returns number of packages updated.
    """
    conn.execute("""
        CREATE TEMP TABLE IF NOT EXISTS _pkg_cves AS
        SELECT name, ecosystem, cve_id
        FROM cve_history
        WHERE cve_id LIKE 'CVE-%'
    """)

    conn.execute(f"""
        CREATE TEMP TABLE IF NOT EXISTS _today_epss AS
        SELECT
            pc.name,
            pc.ecosystem,
            MAX(CAST(e.epss AS FLOAT)) AS epss_score
        FROM read_csv(
            '{csv_path}',
            skip=1,
            header=true,
            columns={{'cve':'VARCHAR','epss':'VARCHAR','percentile':'VARCHAR'}}
        ) AS e
        JOIN _pkg_cves pc ON pc.cve_id = e.cve
        GROUP BY pc.name, pc.ecosystem
    """)

    n_pkgs = conn.execute("SELECT COUNT(*) FROM _today_epss").fetchone()[0]

    conn.execute("""
        UPDATE packages p
        SET epss_score = t.epss_score
        FROM _today_epss t
        WHERE p.name = t.name AND p.ecosystem = t.ecosystem
    """)

    conn.execute(f"""
        INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)
        SELECT t.name, t.ecosystem, t.epss_score, DATE '{today.isoformat()}'
        FROM _today_epss t
        WHERE NOT EXISTS (
            SELECT 1 FROM epss_history h
            WHERE h.name = t.name AND h.ecosystem = t.ecosystem
              AND h.recorded_at = DATE '{today.isoformat()}'
        )
        AND (
            NOT EXISTS (
                SELECT 1 FROM epss_history h2
                WHERE h2.name = t.name AND h2.ecosystem = t.ecosystem
            )
            OR (
                SELECT ROUND(h3.epss_score, 6)
                FROM epss_history h3
                WHERE h3.name = t.name AND h3.ecosystem = t.ecosystem
                ORDER BY h3.recorded_at DESC LIMIT 1
            ) != ROUND(t.epss_score, 6)
            OR (
                SELECT (DATE '{today.isoformat()}' - MAX(h4.recorded_at))
                FROM epss_history h4
                WHERE h4.name = t.name AND h4.ecosystem = t.ecosystem
            ) >= 10
        )
        ON CONFLICT (name, ecosystem, recorded_at) DO NOTHING
    """)

    conn.execute("DROP TABLE IF EXISTS _pkg_cves")
    conn.execute("DROP TABLE IF EXISTS _today_epss")

    return n_pkgs
