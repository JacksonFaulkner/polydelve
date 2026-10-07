"""CLI entrypoint for ETL jobs.

Usage:
    python -m etl.run cve
    python -m etl.run news [--days-back N]
    python -m etl.run epss
    python -m etl.run mal
    python -m etl.run packages
    python -m etl.run refresh
    python -m etl.run seed
"""
import argparse
import asyncio
import subprocess
import sys
import time
from urllib.parse import urlsplit

from etl.jobs import cve, epss, mal, news, packages
from features import settlement
from features.db import DATABASE_URL, get_db_conn


def _resolve_contracts() -> None:
    # Own connection: settlement relies on transactions (won contract + payout
    # commit together), which the autocommit ETL connection would break.
    conn = get_db_conn()
    try:
        settlement.run(conn)
    finally:
        conn.close()


def _timed(label: str):
    """Context manager that prints elapsed time for a step."""
    class _T:
        def __enter__(self):
            self._t = time.monotonic()
            print(f"[refresh] >> {label}", flush=True)
            return self
        def __exit__(self, *_):
            print(f"[refresh] << {label} ({time.monotonic() - self._t:.1f}s)", flush=True)
    return _T()


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Polydelve ETL job.")
    parser.add_argument("job", choices=["news", "epss", "mal", "packages", "refresh", "seed", "epss-history", "cve", "resolve"])
    parser.add_argument("--days-back", type=int, default=1, help="news only: days of history to fetch")
    parser.add_argument("--skip-download", action="store_true", help="mal only: use cached zips")
    args = parser.parse_args()

    db = urlsplit(DATABASE_URL)
    print(f"[etl] job={args.job} db={db.hostname}{db.path}", flush=True)
    conn = get_db_conn(autocommit=True)
    try:
        if args.job == "cve":
            await cve.run(conn)
        elif args.job == "resolve":
            _resolve_contracts()
        elif args.job == "news":
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
            result = subprocess.run(
                [sys.executable, "scripts/ingest_epss_history.py", "--start", "2021-04-14"],
            )
            if result.returncode != 0:
                raise SystemExit(result.returncode)
        elif args.job == "refresh":
            t0 = time.monotonic()
            with _timed("epss"):
                await epss.run(conn)
            with _timed("news"):
                await news.run(conn, days_back=args.days_back)
            with _timed("mal"):
                await mal.run(conn, skip_download=args.skip_download)
            with _timed("cve"):
                await cve.run(conn)
            # Contracts settle automatically: any leg that fired in the data
            # just ingested pays out now, no manual sell step.
            with _timed("resolve"):
                _resolve_contracts()
            print(f"[refresh] total={time.monotonic() - t0:.1f}s", flush=True)
    finally:
        conn.close()


if __name__ == "__main__":
    asyncio.run(main())
