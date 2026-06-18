"""Daily news ingest job."""
from datetime import datetime, timedelta, timezone
from typing import Any

from etl.fetch.news import fetch_news_gpt_structured
from features.featured_contracts import generate_featured_contracts, rerank_featured_contracts
from features.news_repository import ingest_many


async def run(conn: Any, days_back: int = 1) -> None:
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    totals: dict[str, int] = {"inserted": 0, "url_duplicate": 0, "semantic_duplicate": 0}

    for offset in range(days_back, 0, -1):
        start = today - timedelta(days=offset)
        end = start + timedelta(days=1)
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM news WHERE published_date::DATE = %s", [start.date()]
        )
        existing = cur.fetchone()[0]
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

    featured = generate_featured_contracts(conn)
    reranked = await rerank_featured_contracts(conn)
    print(f"\n[news] done. totals={totals} featured={featured} reranked={reranked}", flush=True)
