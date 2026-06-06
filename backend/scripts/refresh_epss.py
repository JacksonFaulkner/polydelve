"""
Refresh EPSS scores for all tracked packages.

Strategy:
  1. Download today's EPSS CSV.gz (single request, ~220k CVEs).
  2. Join against cve_history to find scores for tracked packages.
  3. MAX(epss) per package — most dangerous signal wins.
  4. Update packages.epss_score, snapshot to epss_history if changed or 10+ days stale.

Run daily/frequently: uv run python scripts/refresh_epss.py
"""
import argparse
import sys
from datetime import date
from pathlib import Path

import duckdb
import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))
from features.db import get_db_conn  # noqa: E402

BULK_URL = "https://epss.empiricalsecurity.com/epss_scores-{date}.csv.gz"
CACHE_DIR = Path("/tmp/epss_csv")


def download_today(today: date) -> Path:
    dest = CACHE_DIR / f"epss_{today.isoformat()}.csv.gz"
    if dest.exists() and dest.stat().st_size > 1000:
        print(f"  using cached {dest.name}", flush=True)
        return dest
    print(f"  downloading {BULK_URL.format(date=today.isoformat())} …", flush=True)
    r = httpx.get(BULK_URL.format(date=today.isoformat()), timeout=60, follow_redirects=True)
    r.raise_for_status()
    dest.write_bytes(r.content)
    print(f"  saved {dest.stat().st_size // 1_000} KB", flush=True)
    return dest


def _latest_cached() -> date | None:
    files = sorted(CACHE_DIR.glob("epss_*.csv.gz"))
    return date.fromisoformat(files[-1].name.removeprefix("epss_").removesuffix(".csv.gz")) if files else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="YYYY-MM-DD — use specific cached file (default: today)")
    parser.add_argument("--latest-cached", action="store_true", help="Use most recent cached file, no download")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if args.latest_cached:
        cached = _latest_cached()
        if not cached:
            print("No cached files found in", CACHE_DIR)
            return
        today = cached
        print(f"  using latest cached: {today}", flush=True)
    elif args.date:
        today = date.fromisoformat(args.date)
    else:
        today = date.today()

    csv_path = download_today(today)

    conn = get_db_conn()

    # Build temp CVE→package mapping
    conn.execute("""
        CREATE TEMP TABLE _pkg_cves AS
        SELECT name, ecosystem, cve_id
        FROM cve_history
        WHERE cve_id LIKE 'CVE-%'
    """)
    n_cves = conn.execute("SELECT COUNT(DISTINCT cve_id) FROM _pkg_cves").fetchone()[0]
    print(f"  tracked CVEs: {n_cves}", flush=True)

    # Compute max EPSS per package via vectorized join
    conn.execute(f"""
        CREATE TEMP TABLE _today_epss AS
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
    print(f"  packages with EPSS data: {n_pkgs}", flush=True)

    # Update packages.epss_score
    conn.execute("""
        UPDATE packages p
        SET epss_score = t.epss_score
        FROM _today_epss t
        WHERE p.name = t.name AND p.ecosystem = t.ecosystem
    """)
    print(f"  packages.epss_score updated: {n_pkgs}", flush=True)

    # Snapshot to epss_history — only if score changed or 10+ days since last record
    snapshotted = conn.execute(f"""
        INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)
        SELECT t.name, t.ecosystem, t.epss_score, DATE '{today.isoformat()}'
        FROM _today_epss t
        WHERE NOT EXISTS (
            SELECT 1 FROM epss_history h
            WHERE h.name = t.name
              AND h.ecosystem = t.ecosystem
              AND h.recorded_at = DATE '{today.isoformat()}'
        )
        AND (
            -- no history yet
            NOT EXISTS (
                SELECT 1 FROM epss_history h2
                WHERE h2.name = t.name AND h2.ecosystem = t.ecosystem
            )
            OR
            -- score changed
            (
                SELECT ROUND(h3.epss_score, 6)
                FROM epss_history h3
                WHERE h3.name = t.name AND h3.ecosystem = t.ecosystem
                ORDER BY h3.recorded_at DESC LIMIT 1
            ) != ROUND(t.epss_score, 6)
            OR
            -- 10+ days since last snapshot
            (
                SELECT (DATE '{today.isoformat()}' - MAX(h4.recorded_at))
                FROM epss_history h4
                WHERE h4.name = t.name AND h4.ecosystem = t.ecosystem
            ) >= 10
        )
        ON CONFLICT (name, ecosystem, recorded_at) DO NOTHING
        RETURNING 1
    """).fetchall()

    print(f"  epss_history rows added: {len(snapshotted)}")
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
