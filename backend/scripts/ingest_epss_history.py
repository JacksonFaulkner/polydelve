"""
Bulk-ingest historical EPSS scores into Postgres.

Downloads daily CSV.GZ files from empiricalsecurity.com, joins against
cve_history to find tracked packages, upserts into epss_history.

Earliest available date: 2021-04-14

Usage:
  uv run python scripts/ingest_epss_history.py --start 2021-04-14
  uv run python scripts/ingest_epss_history.py --start 2021-04-14 --end 2026-03-01
  uv run python scripts/ingest_epss_history.py --skip-download
"""
import argparse
import csv
import gzip
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))
from features.db import get_db_conn  # noqa: E402

BULK_URL = "https://epss.empiricalsecurity.com/epss_scores-{date}.csv.gz"
CACHE_DIR = Path("/tmp/epss_csv")
DOWNLOAD_WORKERS = 30


def download_day(day: date) -> tuple[date, bool]:
    dest = CACHE_DIR / f"epss_{day.isoformat()}.csv.gz"
    if dest.exists() and dest.stat().st_size > 1000:
        return day, True
    try:
        r = httpx.get(BULK_URL.format(date=day.isoformat()), timeout=30, follow_redirects=True)
        r.raise_for_status()
        dest.write_bytes(r.content)
        return day, True
    except Exception as e:
        print(f"  WARN {day}: {e}", flush=True)
        return day, False


def load_epss_csv(path: Path) -> dict[str, float]:
    """Parse EPSS CSV.GZ → {cve_id: epss_score}."""
    scores: dict[str, float] = {}
    with gzip.open(path, "rt") as f:
        next(f)  # skip comment line (#model_version:...)
        reader = csv.DictReader(f)
        for row in reader:
            try:
                scores[row["cve"]] = float(row["epss"])
            except (KeyError, ValueError):
                pass
    return scores


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--start", help="YYYY-MM-DD (earliest: 2021-04-14)")
    parser.add_argument("--end", help="YYYY-MM-DD (default: yesterday)")
    parser.add_argument("--workers", type=int, default=DOWNLOAD_WORKERS)
    parser.add_argument("--skip-download", action="store_true")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    end_date = date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=1)
    start_date = date.fromisoformat(args.start) if args.start else end_date - timedelta(days=args.days - 1)
    all_days = [start_date + timedelta(days=i) for i in range((end_date - start_date).days + 1)]
    print(f"Date range: {start_date} → {end_date} ({len(all_days)} days)", flush=True)

    # Phase 1: download missing files
    if not args.skip_download:
        missing = [d for d in all_days if not (CACHE_DIR / f"epss_{d.isoformat()}.csv.gz").exists()]
        if missing:
            print(f"\nPhase 1: downloading {len(missing)} missing files...", flush=True)
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futures = {pool.submit(download_day, d): d for d in missing}
                done = 0
                for fut in as_completed(futures):
                    done += 1
                    if done % 100 == 0 or done == len(missing):
                        print(f"  {done}/{len(missing)}", flush=True)
        else:
            print("Phase 1: all files cached.", flush=True)

    # Phase 2: load CVE → package mapping from DB
    print("\nPhase 2: loading CVE → package map from DB...", flush=True)
    conn = get_db_conn(autocommit=True)
    cur = conn.cursor()

    cur.execute("SELECT name, ecosystem, cve_id FROM cve_history WHERE cve_id LIKE 'CVE-%'")
    rows = cur.fetchall()
    # cve_id → list of (name, ecosystem)
    cve_to_pkgs: dict[str, list[tuple[str, str]]] = {}
    for name, ecosystem, cve_id in rows:
        cve_to_pkgs.setdefault(cve_id, []).append((name, ecosystem))
    print(f"Tracked CVEs: {len(cve_to_pkgs)}  packages: {len({(n,e) for v in cve_to_pkgs.values() for n,e in v})}", flush=True)

    # Phase 3: process each day
    print("\nPhase 3: upserting epss_history...", flush=True)
    total_rows = 0
    for i, day in enumerate(all_days, 1):
        path = CACHE_DIR / f"epss_{day.isoformat()}.csv.gz"
        if not path.exists() or path.stat().st_size < 1000:
            continue
        try:
            epss_map = load_epss_csv(path)

            # Compute max EPSS per package for this day
            pkg_epss: dict[tuple[str, str], float] = {}
            for cve_id, score in epss_map.items():
                for name, ecosystem in cve_to_pkgs.get(cve_id, []):
                    key = (name, ecosystem)
                    if score > pkg_epss.get(key, 0.0):
                        pkg_epss[key] = score

            if pkg_epss:
                cur.executemany(
                    """
                    INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (name, ecosystem, recorded_at) DO UPDATE
                        SET epss_score = EXCLUDED.epss_score
                    """,
                    [(name, eco, score, day) for (name, eco), score in pkg_epss.items()],
                )
            n = len(pkg_epss)
        except Exception as ex:
            print(f"  WARN {day}: {ex}", flush=True)
            n = 0

        total_rows += n
        if i % 50 == 0 or i == len(all_days):
            print(f"  [{i}/{len(all_days)}] {day}: {n} pkgs | total={total_rows}", flush=True)

    conn.close()
    print(f"\nDone. Total rows upserted: {total_rows}", flush=True)


if __name__ == "__main__":
    main()