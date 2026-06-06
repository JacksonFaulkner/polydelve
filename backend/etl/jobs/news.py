"""Daily news ingest job."""
from datetime import datetime, timedelta, timezone

import duckdb

from etl.fetch.news import fetch_news_gpt_structured
from features.news_repository import ingest_many


async def run(conn: duckdb.DuckDBPyConnection, days_back: int = 1) -> None:
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    totals: dict[str, int] = {"inserted": 0, "url_duplicate": 0, "semantic_duplicate": 0}

    for offset in range(days_back, 0, -1):
        start = today - timedelta(days=offset)
        end = start + timedelta(days=1)
        existing = conn.execute(
            "SELECT COUNT(*) FROM news WHERE published_date::DATE = ?", [start.date()]
        ).fetchone()[0]
        if existing >= 5:
            print(f"[news] {start.date()} skipping — {existing} articles already ingested", flush=True)
            continue
        print(f"[news] {start.date()} fetching...", end=" ", flush=True)
        articles = await fetch_news_gpt_structured(start_date=start, end_date=end)
        counts = await ingest_many(conn, articles)
        for k, v in counts.items():
            totals[k] += v
        print(
            f"inserted={counts['inserted']} "
            f"url_dup={counts['url_duplicate']} "
            f"sem_dup={counts['semantic_duplicate']}",
            flush=True,
        )

    print(f"\n[news] done. totals={totals}", flush=True)
