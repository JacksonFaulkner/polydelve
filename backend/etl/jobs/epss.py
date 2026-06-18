"""Daily/frequent EPSS refresh job."""
from datetime import date
from typing import Any

from etl.fetch.epss import CACHE_DIR, download_day, load_epss_for_packages


async def run(conn: Any) -> None:
    from datetime import timedelta
    import httpx as _httpx
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # FIRST publishes T+1; fall back to yesterday if today's file isn't up yet
    for delta in (0, 1):
        day = date.today() - timedelta(days=delta)
        try:
            csv_path = download_day(day)
            break
        except _httpx.HTTPStatusError as e:
            if e.response.status_code in (403, 404) and delta == 0:
                print(f"[epss] today's file not ready, trying yesterday...", flush=True)
                continue
            raise
    print(f"[epss] refreshing for {day}...", flush=True)
    n = load_epss_for_packages(conn, csv_path, day)
    print(f"[epss] done. packages updated: {n}", flush=True)
