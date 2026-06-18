"""CLI entrypoint for ETL jobs.

Usage:
    python -m etl.run news [--days-back N]
    python -m etl.run epss
    python -m etl.run mal
    python -m etl.run packages
"""
import argparse
import asyncio

from etl.jobs import epss, mal, news, packages
from features.db import DATABASE_URL, get_db_conn


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Polydelve ETL job.")
    parser.add_argument("job", choices=["news", "epss", "mal", "packages"])
    parser.add_argument("--days-back", type=int, default=1, help="news only: days of history to fetch")
    parser.add_argument("--skip-download", action="store_true", help="mal only: use cached zips")
    args = parser.parse_args()

    print(f"[etl] job={args.job} db={DATABASE_URL}", flush=True)
    conn = get_db_conn()
    conn.autocommit = True
    try:
        if args.job == "news":
            await news.run(conn, days_back=args.days_back)
        elif args.job == "epss":
            await epss.run(conn)
        elif args.job == "mal":
            await mal.run(conn, skip_download=args.skip_download)
        elif args.job == "packages":
            await packages.run(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    asyncio.run(main())
