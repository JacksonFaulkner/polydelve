import asyncio
import sys
from pathlib import Path

import duckdb
import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))

from features.db import DB_PATH, init_db
from features.package_sectors import fetch_package_sectors

_CONCURRENCY = 30


async def main() -> None:
    conn = duckdb.connect(DB_PATH)
    init_db(conn)

    rows = conn.execute("""
        SELECT name, ecosystem FROM packages
        WHERE sectors IS NULL AND ecosystem IN ('npm', 'PyPI')
    """).fetchall()

    if not rows:
        print("nothing to enrich")
        return

    print(f"enriching {len(rows)} packages...")

    sem = asyncio.Semaphore(_CONCURRENCY)

    async def enrich_one(
        client: httpx.AsyncClient, name: str, ecosystem: str
    ) -> tuple[str, str, list[str]]:
        async with sem:
            sectors = await fetch_package_sectors(client, name, ecosystem)
            return name, ecosystem, sectors

    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        results = await asyncio.gather(
            *[enrich_one(client, name, eco) for name, eco in rows]
        )

    matched = [(sectors, name, ecosystem) for name, ecosystem, sectors in results if sectors]
    no_match_rows = [([], name, ecosystem) for name, ecosystem, sectors in results if not sectors]

    conn.executemany(
        "UPDATE packages SET sectors = ? WHERE name = ? AND ecosystem = ?",
        matched + no_match_rows,
    )

    conn.close()
    print(f"\nupdated {len(matched)}, no match {len(no_match_rows)}/{len(rows)}")


if __name__ == "__main__":
    asyncio.run(main())
