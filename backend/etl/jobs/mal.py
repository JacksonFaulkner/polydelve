"""Daily MAL advisory ingest job."""
import json
from pathlib import Path

import duckdb
import httpx

from etl.fetch.mal import BULK_URLS, download_zip, parse_zip

CACHE_DIR = Path("/tmp/osv_mal_zips")


def _upsert(conn: duckdb.DuckDBPyConnection, records: list) -> int:
    if not records:
        return 0
    tmp = CACHE_DIR / "_staging.ndjson"
    with tmp.open("w") as f:
        for r in records:
            f.write(json.dumps({
                "osv_id":       r.osv_id,
                "name":         r.name,
                "ecosystem":    r.ecosystem,
                "published_at": r.published_at.isoformat() if r.published_at else None,
                "modified_at":  r.modified_at.isoformat() if r.modified_at else None,
                "withdrawn":    r.withdrawn,
                "summary":      r.summary,
            }) + "\n")
    conn.execute(f"""
        INSERT INTO mal_advisories
            (osv_id, name, ecosystem, published_at, modified_at, withdrawn, summary)
        SELECT osv_id, name, ecosystem,
               published_at::TIMESTAMPTZ, modified_at::TIMESTAMPTZ,
               withdrawn, summary
        FROM read_json('{tmp}', auto_detect=true)
        ON CONFLICT (osv_id, name, ecosystem) DO UPDATE SET
            modified_at = excluded.modified_at,
            withdrawn   = excluded.withdrawn,
            summary     = excluded.summary
    """)
    conn.execute("""
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
    conn: duckdb.DuckDBPyConnection,
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

    mal_count = conn.execute("SELECT COUNT(*) FROM mal_advisories WHERE NOT withdrawn").fetchone()[0]
    pkg_count = conn.execute("SELECT COUNT(*) FROM packages WHERE has_mal_advisory").fetchone()[0]
    print(f"\n[mal] done. total={total} active={mal_count} packages_flagged={pkg_count}", flush=True)
