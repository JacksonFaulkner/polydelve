"""Download and process EPSS scores from FIRST daily CSV dumps."""
import csv
import gzip
from datetime import date
from pathlib import Path
from typing import Any

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


def load_epss_for_packages(conn: Any, csv_path: Path, today: date) -> int:
    """
    Join today's EPSS CSV against tracked packages via cve_history.
    Updates packages.epss_score and snapshots to epss_history where score changed or 10+ days stale.
    Returns number of packages updated.
    """
    # Load CVE → EPSS score map from gzipped CSV.
    # File format: first line is a comment (#model_version:...), second is header cve,epss,percentile
    epss_map: dict[str, float] = {}
    with gzip.open(csv_path, "rt") as f:
        next(f)  # skip comment line
        reader = csv.DictReader(f)
        for row in reader:
            try:
                epss_map[row["cve"]] = float(row["epss"])
            except (KeyError, ValueError):
                pass

    cur = conn.cursor()

    # Get all CVE IDs for tracked packages
    cur.execute("SELECT name, ecosystem, cve_id FROM cve_history WHERE cve_id LIKE 'CVE-%'")
    rows = cur.fetchall()

    # Compute max EPSS per package
    pkg_epss: dict[tuple[str, str], float] = {}
    for name, ecosystem, cve_id in rows:
        score = epss_map.get(cve_id)
        if score is not None:
            key = (name, ecosystem)
            if score > pkg_epss.get(key, 0.0):
                pkg_epss[key] = score

    if not pkg_epss:
        return 0

    # Update packages.epss_score
    for (name, ecosystem), score in pkg_epss.items():
        cur.execute(
            "UPDATE packages SET epss_score = %s WHERE name = %s AND ecosystem = %s",
            [score, name, ecosystem],
        )

    # Snapshot to epss_history if score changed or 10+ days stale
    for (name, ecosystem), score in pkg_epss.items():
        cur.execute(
            """
            SELECT epss_score, recorded_at FROM epss_history
            WHERE name = %s AND ecosystem = %s
            ORDER BY recorded_at DESC LIMIT 1
            """,
            [name, ecosystem],
        )
        last = cur.fetchone()
        should_insert = (
            last is None
            or abs(last[0] - score) > 1e-6
            or (today - last[1]).days >= 10
        )
        if should_insert:
            cur.execute(
                """
                INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (name, ecosystem, recorded_at) DO NOTHING
                """,
                [name, ecosystem, score, today],
            )

    return len(pkg_epss)