"""CLI entrypoint for ETL jobs.

Usage:
    python -m etl.run news [--days-back N]
    python -m etl.run epss
    python -m etl.run mal
    python -m etl.run packages

Target DB comes from DB_PATH (e.g. polydelve.test.duckdb or md:polydelve).
"""
import argparse
import asyncio
import os

import duckdb

# MotherDuck's duckdb extension reads `motherduck_token` from the environment
if os.getenv("MOTHERDUCK_ACCESS_TOKEN") and not os.getenv("motherduck_token"):
    os.environ["motherduck_token"] = os.environ["MOTHERDUCK_ACCESS_TOKEN"]

from etl.jobs import epss, mal, news, packages  # noqa: E402
from features.db import DB_PATH, init_db  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Run a Polydelve ETL job.")
    parser.add_argument("job", choices=["news", "epss", "mal", "packages"])
    parser.add_argument("--days-back", type=int, default=1, help="news only: days of history to fetch")
    args = parser.parse_args()

    print(f"[etl] job={args.job} db={DB_PATH}", flush=True)
    conn = duckdb.connect(DB_PATH)
    init_db(conn)
    try:
        if args.job == "news":
            await news.run(conn, days_back=args.days_back)
        elif args.job == "epss":
            await epss.run(conn)
        elif args.job == "mal":
            await mal.run(conn)
        elif args.job == "packages":
            await packages.run(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    asyncio.run(main())
