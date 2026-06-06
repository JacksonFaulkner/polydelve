"""Package enrichment jobs: downloads, CVEs, sectors, seeding."""
import asyncio

import duckdb
import httpx
from tqdm.asyncio import tqdm

from etl.fetch.cve import build_cve_history, fetch_top_npm, fetch_top_pypi, upsert_cve_records
from etl.fetch.enrichment import (
    fetch_cve_ids,
    fetch_downloads_bulk,
    fetch_github_avatar,
    fetch_github_org,
    fetch_mal_advisory,
)
from etl.fetch.sectors import classify_sectors_llm, fetch_package_sectors
from etl.utils import bounded_gather


async def run(conn: duckdb.DuckDBPyConnection) -> None:
    """Fill NULL package fields: downloads, CVEs, MAL, logos, risk_score."""
    async with httpx.AsyncClient(timeout=10) as client:
        await _pass_downloads(conn)
        await _pass_cves_and_mal(conn, client)
        await _pass_logos(conn, client)

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
    print(f"[packages] risk_score computed for {risk_count} packages", flush=True)


async def _pass_downloads(conn: duckdb.DuckDBPyConnection) -> None:
    rows = conn.execute("""
        SELECT name, ecosystem FROM packages
        WHERE ecosystem IN ('npm', 'PyPI')
          AND (weekly_downloads IS NULL OR weekly_downloads = 0)
    """).fetchall()
    if not rows:
        print("  downloads: nothing to fetch", flush=True)
        return
    print(f"  downloads: fetching {len(rows)} packages...", flush=True)
    result = await fetch_downloads_bulk(rows, npm_concurrency=40)
    updated = 0
    for (name, eco), dl in tqdm(result.items(), desc="  writing downloads", unit="pkg"):
        if dl > 0:
            conn.execute(
                "UPDATE packages SET weekly_downloads = ? WHERE name = ? AND ecosystem = ?",
                [dl, name, eco],
            )
            updated += 1
    print(f"  downloads: updated {updated}", flush=True)


async def _pass_cves_and_mal(
    conn: duckdb.DuckDBPyConnection, client: httpx.AsyncClient
) -> None:
    rows = conn.execute("""
        SELECT name, ecosystem, cve_ids FROM packages
        WHERE ecosystem IN ('npm', 'PyPI') AND epss_score IS NULL
    """).fetchall()
    if not rows:
        print("  cves/mal: nothing to fetch", flush=True)
        return
    print(f"  cves/mal: fetching for {len(rows)} packages...", flush=True)

    async def fetch_one(
        name: str, eco: str, existing: list[str]
    ) -> tuple[str, str, list[str], bool]:
        cve_ids = existing or await fetch_cve_ids(client, name, eco)
        has_mal = await fetch_mal_advisory(client, name, eco)
        return name, eco, cve_ids, has_mal

    results = await bounded_gather(
        [fetch_one(name, eco, list(cves or [])) for name, eco, cves in rows],
        concurrency=20,
        desc="  fetching cves/mal",
    )
    for name, eco, cve_ids, has_mal in results:
        conn.execute(
            """UPDATE packages SET
               cve_ids = COALESCE(CASE WHEN len(?) > 0 THEN ? END, cve_ids),
               has_mal_advisory = CASE WHEN ? THEN TRUE ELSE has_mal_advisory END
               WHERE name = ? AND ecosystem = ?""",
            [cve_ids, cve_ids, has_mal, name, eco],
        )


async def _pass_logos(
    conn: duckdb.DuckDBPyConnection, client: httpx.AsyncClient
) -> None:
    rows = conn.execute("""
        SELECT name, ecosystem FROM packages
        WHERE ecosystem IN ('npm', 'PyPI') AND logo_url IS NULL
    """).fetchall()
    if not rows:
        print("  logos: nothing to fetch", flush=True)
        return
    print(f"  logos: fetching {len(rows)} packages...", flush=True)

    async def fetch_one(name: str, eco: str) -> tuple[str, str, str | None]:
        org = await fetch_github_org(client, name, eco)
        avatar = await fetch_github_avatar(client, org) if org else None
        return name, eco, avatar

    results = await bounded_gather(
        [fetch_one(name, eco) for name, eco in rows],
        concurrency=20,
        desc="  fetching logos",
    )
    updated = 0
    for name, eco, logo in results:
        if logo:
            conn.execute(
                "UPDATE packages SET logo_url = ? WHERE name = ? AND ecosystem = ?",
                [logo, name, eco],
            )
            updated += 1
    print(f"  logos: updated {updated}", flush=True)


async def run_sectors(conn: duckdb.DuckDBPyConnection) -> None:
    """Heuristic sector classification for packages missing sectors."""
    rows = conn.execute("""
        SELECT name, ecosystem FROM packages
        WHERE sectors IS NULL AND ecosystem IN ('npm', 'PyPI')
    """).fetchall()
    if not rows:
        print("[sectors] nothing to classify", flush=True)
        return
    print(f"[sectors] classifying {len(rows)} packages...", flush=True)

    async def enrich_one(
        client: httpx.AsyncClient, name: str, eco: str
    ) -> tuple[str, str, list[str]]:
        return name, eco, await fetch_package_sectors(client, name, eco)

    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        results = await bounded_gather(
            [enrich_one(client, name, eco) for name, eco in rows],
            concurrency=30,
            desc="  classifying sectors",
        )

    updated = no_match = 0
    for name, eco, sectors in sorted(results, key=lambda r: (not r[2], r[0])):
        if sectors:
            conn.execute(
                "UPDATE packages SET sectors = ? WHERE name = ? AND ecosystem = ?",
                [sectors, name, eco],
            )
            updated += 1
        else:
            no_match += 1
    print(f"[sectors] updated={updated} no_match={no_match}", flush=True)


async def run_sectors_llm(conn: duckdb.DuckDBPyConnection) -> None:
    """LLM sector classification. Onboarding only — slow and costs money."""
    rows = conn.execute("""
        SELECT name, ecosystem FROM packages
        WHERE (sectors IS NULL OR sectors = '{}') AND ecosystem IN ('npm', 'PyPI')
    """).fetchall()
    if not rows:
        print("[sectors-llm] nothing to classify", flush=True)
        return
    print(f"[sectors-llm] classifying {len(rows)} packages via LLM...", flush=True)

    async def classify_one(
        client: httpx.AsyncClient, name: str, eco: str
    ) -> tuple[str, str, list[str]]:
        return name, eco, await classify_sectors_llm(client, name, eco)

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        results = await bounded_gather(
            [classify_one(client, name, eco) for name, eco in rows],
            concurrency=5,
            desc="  LLM classify",
        )

    updated = 0
    for name, eco, sectors in results:
        if sectors:
            conn.execute(
                "UPDATE packages SET sectors = ? WHERE name = ? AND ecosystem = ?",
                [sectors, name, eco],
            )
            updated += 1
    print(f"[sectors-llm] updated={updated}/{len(rows)}", flush=True)


async def run_seed(conn: duckdb.DuckDBPyConnection, top_n: int = 99_999) -> None:
    """Bulk seed packages from top PyPI + npm lists with CVEs and EPSS."""
    print(f"[seed] fetching top {top_n} npm + PyPI packages...", flush=True)
    npm_names, pypi_names = await asyncio.gather(
        fetch_top_npm(top_n),
        fetch_top_pypi(top_n),
    )
    print(f"[seed] npm={len(npm_names)} pypi={len(pypi_names)}", flush=True)

    packages = [(n, "npm") for n in npm_names] + [(n, "PyPI") for n in pypi_names]

    # Upsert package stubs
    conn.executemany(
        "INSERT INTO packages (name, ecosystem) VALUES (?, ?) ON CONFLICT DO NOTHING",
        packages,
    )
    print(f"[seed] {len(packages)} package stubs inserted", flush=True)

    # Build CVE history
    print("[seed] fetching CVE history from OSV...", flush=True)
    records = await build_cve_history(packages, progress=True)
    upsert_cve_records(conn, records)
    print(f"[seed] {len(records)} CVE records upserted", flush=True)
