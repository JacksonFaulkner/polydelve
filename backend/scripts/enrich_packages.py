import asyncio
import sys
from pathlib import Path

import duckdb
import httpx
from tqdm.asyncio import tqdm

sys.path.insert(0, str(Path(__file__).parent.parent))

from features.db import DB_PATH, init_db
from features.package_enrichment import (
    fetch_downloads_bulk,
    _fetch_cve_ids,
    _fetch_epss,
    _fetch_mal_advisory,
    _fetch_github_org,
    _fetch_github_avatar,
)


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


async def _pass_epss(
    conn: duckdb.DuckDBPyConnection, client: httpx.AsyncClient
) -> int:
    rows = conn.execute("""
        SELECT name, ecosystem, cve_ids FROM packages
        WHERE ecosystem IN ('npm', 'PyPI')
        AND epss_score IS NULL
    """).fetchall()
    if not rows:
        print("  epss: nothing to fetch")
        return 0
    print(f"  epss: fetching for {len(rows)} packages...")

    sem = asyncio.Semaphore(20)

    async def fetch_one(
        name: str, eco: str, existing_cve_ids: list[str]
    ) -> tuple[str, str, list[str], float | None, bool]:
        async with sem:
            cve_ids = existing_cve_ids or await _fetch_cve_ids(client, name, eco)
            epss = await _fetch_epss(client, cve_ids)
            has_mal = await _fetch_mal_advisory(client, name, eco)
            return name, eco, cve_ids, epss, has_mal

    tasks = [fetch_one(name, eco, list(cve_ids or [])) for name, eco, cve_ids in rows]
    results = await tqdm.gather(*tasks, desc="  fetching epss", unit="pkg")

    updated = 0
    for name, eco, cve_ids, epss, has_mal in results:
        if epss is not None or cve_ids:
            conn.execute(
                """UPDATE packages SET epss_score = COALESCE(?, epss_score),
                   cve_ids = COALESCE(CASE WHEN len(?) > 0 THEN ? END, cve_ids),
                   has_mal_advisory = CASE WHEN ? THEN TRUE ELSE has_mal_advisory END
                   WHERE name = ? AND ecosystem = ?""",
                [epss, cve_ids, cve_ids, has_mal, name, eco],
            )
            updated += 1
    return updated


async def _pass_logos(
    conn: duckdb.DuckDBPyConnection, client: httpx.AsyncClient
) -> int:
    rows = conn.execute("""
        SELECT name, ecosystem FROM packages
        WHERE ecosystem IN ('npm', 'PyPI')
        AND logo_url IS NULL
    """).fetchall()
    if not rows:
        print("  logos: nothing to fetch")
        return 0
    print(f"  logos: fetching {len(rows)} packages...")

    sem = asyncio.Semaphore(20)

    async def fetch_one(name: str, eco: str) -> tuple[str, str, str | None]:
        async with sem:
            org = await _fetch_github_org(client, name, eco)
            avatar = await _fetch_github_avatar(client, org) if org else None
            return name, eco, avatar

    tasks = [fetch_one(name, eco) for name, eco in rows]
    results = await tqdm.gather(*tasks, desc="  fetching logos", unit="pkg")

    updated = 0
    for name, eco, logo in results:
        if logo:
            conn.execute(
                "UPDATE packages SET logo_url = ? WHERE name = ? AND ecosystem = ?",
                [logo, name, eco],
            )
            updated += 1
    return updated


async def main() -> None:
    conn = duckdb.connect(DB_PATH)
    init_db(conn)

    async with httpx.AsyncClient(timeout=10) as client:
        print("[1/3] downloads")
        dl_updated = await _pass_downloads(conn)

        print("[2/3] epss + cves + mal")
        epss_updated = await _pass_epss(conn, client)

        logo_updated = 0
        # logo pass disabled — run manually when needed

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
    print(
        f"\ndone. downloads={dl_updated} epss={epss_updated} logos={logo_updated} risk_score={risk_count}"
    )


if __name__ == "__main__":
    asyncio.run(main())

