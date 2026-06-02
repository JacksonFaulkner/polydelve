import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).parent.parent))

from features.db import DB_PATH, init_db
from features.news_repository import ingest_many
from features.recent_news import fetch_news_gpt_structured

_DAYS_BACK = int(sys.argv[1]) if len(sys.argv) > 1 else 7


async def main() -> None:
    conn = duckdb.connect(DB_PATH)
    init_db(conn)

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    totals: dict[str, int] = {"inserted": 0, "url_duplicate": 0, "semantic_duplicate": 0}

    for offset in range(_DAYS_BACK, 0, -1):
        start = today - timedelta(days=offset)
        end = start + timedelta(days=1)

        print(f"[{start.date()}] fetching...", end=" ", flush=True)
        articles = await fetch_news_gpt_structured(start_date=start, end_date=end)

        counts = await ingest_many(conn, articles)
        for k, v in counts.items():
            totals[k] += v

        print(f"inserted={counts['inserted']} url_dup={counts['url_duplicate']} sem_dup={counts['semantic_duplicate']}")

    conn.close()
    print(f"\ntotals: {totals}")
    print(f"news rows: {duckdb.connect(DB_PATH).execute('SELECT count(*) FROM news').fetchone()[0]}")


if __name__ == "__main__":
    asyncio.run(main())
