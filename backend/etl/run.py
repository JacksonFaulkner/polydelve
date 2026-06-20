"""CLI entrypoint for ETL jobs.

Usage:
    python -m etl.run news [--days-back N]
    python -m etl.run epss
    python -m etl.run mal
    python -m etl.run packages
    python -m etl.run hourly
    python -m etl.run seed
"""
import argparse
import asyncio
import time
from etl.jobs import epss, mal, news, packages
from features.db import DATABASE_URL, get_db_conn


def _timed(label: str):
    """Context manager that prints elapsed time for a step."""
    class _T:
        def __enter__(self):
            self._t = time.monotonic()
            print(f"[hourly] >> {label}", flush=True)
            return self
        def __exit__(self, *_):
            print(f"[hourly] << {label} ({time.monotonic() - self._t:.1f}s)", flush=True)
    return _T()


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Polydelve ETL job.")
    parser.add_argument("job", choices=["news", "epss", "mal", "packages", "hourly", "seed", "epss-history"])
    parser.add_argument("--days-back", type=int, default=1, help="news only: days of history to fetch")
    parser.add_argument("--skip-download", action="store_true", help="mal only: use cached zips")
    args = parser.parse_args()

    print(f"[etl] job={args.job} db={DATABASE_URL}", flush=True)
    conn = get_db_conn(autocommit=True)
    try:
        if args.job == "news":
            await news.run(conn, days_back=args.days_back)
        elif args.job == "epss":
            await epss.run(conn)
        elif args.job == "mal":
            await mal.run(conn, skip_download=args.skip_download)
        elif args.job == "packages":
            await packages.run(conn)
        elif args.job == "seed":
            t0 = time.monotonic()
            with _timed("seed: packages from cve_history + epss_history"):
                await packages.run_seed(conn)
            with _timed("seed: downloads"):
                await packages._pass_downloads(conn)
            with _timed("seed: risk_score"):
                cur = conn.cursor()
                cur.execute("""
                    UPDATE packages
                    SET risk_score = CASE
                        WHEN weekly_downloads > 0 AND epss_score IS NOT NULL
                            THEN weekly_downloads * epss_score
                        ELSE NULL
                    END
                    WHERE ecosystem IN ('npm', 'PyPI')
                """)
                cur.execute("SELECT COUNT(*) FROM packages WHERE risk_score > 0")
                print(f"[seed] risk_score set for {cur.fetchone()[0]} packages", flush=True)
            print(f"[seed] total={time.monotonic() - t0:.1f}s", flush=True)
        elif args.job == "epss-history":
            import subprocess
            import sys as _sys
            result = subprocess.run(
                [_sys.executable, "/app/scripts/ingest_epss_history.py", "--start", "2021-04-14"],
            )
            if result.returncode != 0:
                raise SystemExit(result.returncode)
        elif args.job == "hourly":
            t0 = time.monotonic()
            with _timed("epss"):
                await epss.run(conn)
            with _timed("news"):
                await news.run(conn, days_back=args.days_back)
            with _timed("mal"):
                await mal.run(conn, skip_download=args.skip_download)
            print(f"[hourly] total={time.monotonic() - t0:.1f}s", flush=True)
    finally:
        conn.close()


if __name__ == "__main__":
    asyncio.run(main())
