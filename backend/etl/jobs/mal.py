"""Daily MAL advisory ingest job."""
from pathlib import Path
from typing import Any

import httpx

from etl.fetch.mal import BULK_URLS, download_zip, parse_zip

CACHE_DIR = Path("/tmp/osv_mal_zips")


def _upsert(conn: Any, records: list) -> int:
    if not records:
        return 0
    cur = conn.cursor()
    cur.executemany(
        """
        INSERT INTO mal_advisories
            (osv_id, name, ecosystem, published_at, modified_at, withdrawn, summary)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (osv_id, name, ecosystem) DO UPDATE SET
            modified_at = EXCLUDED.modified_at,
            withdrawn   = EXCLUDED.withdrawn,
            summary     = EXCLUDED.summary
        """,
        [
            (
                r.osv_id,
                r.name,
                r.ecosystem,
                r.published_at,
                r.modified_at,
                r.withdrawn,
                r.summary,
            )
            for r in records
        ],
    )
    cur.execute("""
        UPDATE packages p
        SET has_mal_advisory = true,
            mal_advisory_published_at = (
                SELECT MIN(m.published_at)
                FROM mal_advisories m
                WHERE m.name = p.name AND m.ecosystem = p.ecosystem AND NOT m.withdrawn
            )
        WHERE EXISTS (
            SELECT 1 FROM mal_advisories m
            WHERE m.name = p.name AND m.ecosystem = p.ecosystem AND NOT m.withdrawn
        )
    """)
    return len(records)


async def run(
    conn: Any,
    skip_download: bool = False,
    ecosystem: str | None = None,
) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ecosystems = [ecosystem] if ecosystem else list(BULK_URLS)
    total = 0
    with httpx.Client(timeout=120) as client:
        for eco in ecosystems:
            dest = CACHE_DIR / f"osv_{eco.lower()}_all.zip"
            if not skip_download or not dest.exists():
                download_zip(eco, dest, client)
            else:
                print(f"  {eco}: using cached {dest}", flush=True)
            print(f"\n[{eco}] parsing MAL advisories...", flush=True)
            records = parse_zip(dest, eco)
            print(f"  {eco}: {len(records)} records", flush=True)
            n = _upsert(conn, records)
            total += n
            print(f"  {eco}: upserted {n}", flush=True)

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM mal_advisories WHERE NOT withdrawn")
    mal_count = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM packages WHERE has_mal_advisory")
    pkg_count = cur.fetchone()[0]
    print(f"\n[mal] done. total={total} active={mal_count} packages_flagged={pkg_count}", flush=True)