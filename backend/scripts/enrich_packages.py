import asyncio
import sys
from pathlib import Path

import duckdb
from tqdm.asyncio import tqdm

sys.path.insert(0, str(Path(__file__).parent.parent))

from features.db import DB_PATH, init_db
from features.package_enrichment import fetch_downloads_bulk


async def _pass_downloads(conn: duckdb.DuckDBPyConnection) -> int:
    rows = conn.execute("""
        SELECT name, ecosystem FROM packages
        WHERE ecosystem IN ('npm', 'PyPI')
        AND (weekly_downloads IS NULL OR weekly_downloads = 0)
    """).fetchall()
    if not rows:
        print("  downloads: nothing to fetch")
        return 0
    print(f"  downloads: fetching {len(rows)} packages...")
    result = await fetch_downloads_bulk(rows, npm_concurrency=20)
    updated = 0
    for (name, eco), dl in tqdm(result.items(), desc="  writing downloads", unit="pkg"):
        if dl > 0:
            conn.execute(
                "UPDATE packages SET weekly_downloads = ? WHERE name = ? AND ecosystem = ?",
                [dl, name, eco],
            )
            updated += 1
    return updated


async def main() -> None:
    conn = duckdb.connect(DB_PATH)
    init_db(conn)

    print("[1/1] downloads")
    dl_updated = await _pass_downloads(conn)

    conn.execute("""
        UPDATE packages
        SET risk_score = CASE
            WHEN weekly_downloads > 0 AND epss_score IS NOT NULL
                THEN weekly_downloads * epss_score
            ELSE NULL
        END
        WHERE ecosystem IN ('npm', 'PyPI')
    """)
    risk_count = conn.execute(
        "SELECT COUNT(*) FROM packages WHERE risk_score > 0"
    ).fetchone()[0]

    conn.close()
    print(f"\ndone. downloads={dl_updated} risk_score={risk_count}")


if __name__ == "__main__":
    asyncio.run(main())

