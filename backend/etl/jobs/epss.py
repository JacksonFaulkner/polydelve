"""Daily/frequent EPSS refresh job."""
from datetime import date

import duckdb

from etl.fetch.epss import CACHE_DIR, download_day, load_epss_for_packages


async def run(conn: duckdb.DuckDBPyConnection) -> None:
    today = date.today()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[epss] refreshing for {today}...", flush=True)
    csv_path = download_day(today)
    n = load_epss_for_packages(conn, csv_path, today)
    print(f"[epss] done. packages updated: {n}", flush=True)
