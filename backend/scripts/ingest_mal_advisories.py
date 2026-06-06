"""
Bulk-ingest OSV MAL-* advisories for npm and PyPI.

Downloads all.zip from GCS for each ecosystem, extracts MAL-* JSON files,
and upserts into mal_advisories table. Stores published/modified timestamps
for historical backtest resolution.

Usage:
  uv run python scripts/ingest_mal_advisories.py
  uv run python scripts/ingest_mal_advisories.py --skip-download
"""
import argparse
import json
import sys
import zipfile
from datetime import datetime
from pathlib import Path

import duckdb
import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))
from features.db import get_db_conn

BULK_URLS = {
    "npm":  "https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip",
    "PyPI": "https://osv-vulnerabilities.storage.googleapis.com/PyPI/all.zip",
}
CACHE_DIR = Path("/tmp/osv_mal_zips")


def _parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _ecosystem_for_pkg(pkg: dict) -> str | None:
    """Return normalised ecosystem string from OSV package object."""
    eco = (pkg.get("ecosystem") or "").lower()
    if eco == "npm":
        return "npm"
    if eco == "pypi":
        return "PyPI"
    return None


def download_zip(ecosystem: str, dest: Path, client: httpx.Client) -> None:
    url = BULK_URLS[ecosystem]
    print(f"  downloading {url} ...", flush=True)
    with client.stream("GET", url, follow_redirects=True, timeout=120) as r:
        r.raise_for_status()
        dest.write_bytes(r.read())
    print(f"  saved {dest.stat().st_size // 1_000_000} MB", flush=True)


def parse_zip(zip_path: Path, ecosystem: str) -> list[dict]:
    """Return list of dicts for all MAL-* advisories in the zip."""
    records = []
    with zipfile.ZipFile(zip_path) as zf:
        names = [n for n in zf.namelist() if n.endswith(".json")]
        print(f"  {ecosystem}: {len(names)} total JSON files in zip", flush=True)
        for name in names:
            try:
                data = json.loads(zf.read(name))
            except Exception:
                continue
            osv_id = data.get("id", "")
            if not osv_id.startswith("MAL-"):
                continue
            published_at = _parse_ts(data.get("published"))
            modified_at  = _parse_ts(data.get("modified"))
            withdrawn    = data.get("withdrawn") is not None

            # Collect all affected package names for this ecosystem
            for affected in data.get("affected", []):
                pkg = affected.get("package", {})
                eco = _ecosystem_for_pkg(pkg)
                if eco != ecosystem:
                    continue
                pkg_name = pkg.get("name", "").strip()
                if not pkg_name:
                    continue
                records.append({
                    "osv_id":       osv_id,
                    "name":         pkg_name,
                    "ecosystem":    ecosystem,
                    "published_at": published_at,
                    "modified_at":  modified_at,
                    "withdrawn":    withdrawn,
                    "summary":      (data.get("summary") or "")[:500],
                })
    return records


def upsert(conn: duckdb.DuckDBPyConnection, records: list[dict]) -> int:
    if not records:
        return 0
    tmp = Path("/tmp/osv_mal_zips/_staging.ndjson")
    with tmp.open("w") as f:
        for r in records:
            f.write(json.dumps({
                "osv_id":       r["osv_id"],
                "name":         r["name"],
                "ecosystem":    r["ecosystem"],
                "published_at": r["published_at"].isoformat() if r["published_at"] else None,
                "modified_at":  r["modified_at"].isoformat() if r["modified_at"] else None,
                "withdrawn":    r["withdrawn"],
                "summary":      r["summary"],
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
    # Sync has_mal_advisory + earliest published_at back to packages table
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



def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-download", action="store_true",
                        help="Use cached zip files in /tmp/osv_mal_zips/")
    parser.add_argument("--ecosystem", choices=["npm", "PyPI"],
                        help="Only ingest one ecosystem")
    args = parser.parse_args()

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    conn = get_db_conn()

    ecosystems = [args.ecosystem] if args.ecosystem else list(BULK_URLS)

    total = 0
    with httpx.Client(timeout=120) as client:
        for eco in ecosystems:
            dest = CACHE_DIR / f"osv_{eco.lower()}_all.zip"
            if not args.skip_download or not dest.exists():
                download_zip(eco, dest, client)
            else:
                print(f"  {eco}: using cached {dest}", flush=True)

            print(f"\n[{eco}] parsing MAL advisories...", flush=True)
            records = parse_zip(dest, eco)
            print(f"  {eco}: {len(records)} MAL package-advisory records", flush=True)

            print(f"  {eco}: upserting...", flush=True)
            n = upsert(conn, records)
            total += n
            print(f"  {eco}: done ({n} rows)", flush=True)

    # Summary
    mal_count = conn.execute("SELECT COUNT(*) FROM mal_advisories WHERE NOT withdrawn").fetchone()[0]
    pkg_count = conn.execute("SELECT COUNT(*) FROM packages WHERE has_mal_advisory").fetchone()[0]
    print(f"\ndone. total_upserted={total} active_advisories={mal_count} packages_flagged={pkg_count}")

    conn.close()


if __name__ == "__main__":
    main()
