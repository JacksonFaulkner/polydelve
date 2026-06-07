"""
Bulk-ingest historical EPSS scores into DuckDB (uses DB_PATH env var, default: polydelve.dev.duckdb).

Reads pre-downloaded CSV.GZ files from /tmp/epss_csv/ via DuckDB read_csv (vectorized).
Downloads any missing files first.

Earliest available date from empiricalsecurity.com: 2021-04-14

Usage:
  uv run python scripts/ingest_epss_history.py --start 2021-04-14
  uv run python scripts/ingest_epss_history.py --start 2021-04-14 --end 2026-03-01
  uv run python scripts/ingest_epss_history.py --skip-download  # use cached files only
"""
import argparse
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--start", help="YYYY-MM-DD")
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
            print(f"\nPhase 1: downloading {len(missing)} missing files…", flush=True)
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futures = {pool.submit(download_day, d): d for d in missing}
                done = 0
                for fut in as_completed(futures):
                    done += 1
                    if done % 100 == 0 or done == len(missing):
                        print(f"  {done}/{len(missing)}", flush=True)
        else:
            print("Phase 1: all files cached, skipping download.", flush=True)

    # Phase 2: DuckDB vectorized load
    print("\nPhase 2: loading via DuckDB read_csv…", flush=True)
    conn = get_db_conn()

    # Build temp CVE→package mapping table
    conn.execute("""
        CREATE TEMP TABLE _pkg_cves AS
        SELECT name, ecosystem, cve_id
        FROM cve_history
        WHERE cve_id LIKE 'CVE-%'
    """)
    n_cves = conn.execute("SELECT COUNT(DISTINCT cve_id) FROM _pkg_cves").fetchone()[0]
    print(f"Tracked CVEs: {n_cves}", flush=True)

    total_rows = 0
    for i, day in enumerate(all_days, 1):
        path = CACHE_DIR / f"epss_{day.isoformat()}.csv.gz"
        if not path.exists() or path.stat().st_size < 1000:
            continue
        try:
            rows = conn.execute(
                f"""
                INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)
                SELECT
                    pc.name,
                    pc.ecosystem,
                    MAX(CAST(e.epss AS FLOAT)),
                    DATE '{day.isoformat()}'
                FROM read_csv(
                    '{path}',
                    skip=1,
                    header=true,
                    columns={{'cve':'VARCHAR','epss':'VARCHAR','percentile':'VARCHAR'}}
                ) AS e
                JOIN _pkg_cves pc ON pc.cve_id = e.cve
                GROUP BY pc.name, pc.ecosystem
                ON CONFLICT (name, ecosystem, recorded_at)
                    DO UPDATE SET epss_score = excluded.epss_score
                RETURNING 1
                """
            ).fetchall()
            n = len(rows)
        except Exception as ex:
            print(f"  WARN {day}: {ex}", flush=True)
            n = 0

        total_rows += n
        if i % 50 == 0 or i == len(all_days):
            print(f"  [{i}/{len(all_days)}] {day}: {n} pkgs | total: {total_rows}", flush=True)

    conn.close()
    print(f"\nDone. Total rows upserted: {total_rows}", flush=True)


if __name__ == "__main__":
    main()
