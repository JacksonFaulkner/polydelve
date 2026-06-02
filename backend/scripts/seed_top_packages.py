"""
Seed packages table with top 500 PyPI + npm packages.
No LLM enrichment — downloads, CVEs, EPSS only.

Flow:
  1. Fetch package name candidates (PyPI list is pre-sorted; npm candidates are re-ranked)
  2. Fetch actual weekly download counts for all candidates
  3. Re-sort npm by downloads, trim to top 500
  4. Batch-fetch CVE IDs via OSV querybatch (via build_cve_history)
  5. Bulk-fetch EPSS scores for all found CVEs
  6. Compute risk_score = weekly_downloads * epss_score
  7. Upsert into packages table
"""
import asyncio
import sys
from collections import defaultdict
from pathlib import Path

import duckdb
import httpx

sys.path.insert(0, str(Path(__file__).parent.parent))

from features.cve_history import build_cve_history, fetch_top_npm, fetch_top_pypi
from features.db import DB_PATH, init_db
from features.package_enrichment import fetch_downloads_bulk

_TOP_N = 99_999  # fetch full lists from each source
_EPSS_CHUNK = 100


# --- EPSS bulk fetcher ---

async def bulk_epss(cve_ids: list[str]) -> dict[str, float]:
    """Returns {cve_id: epss_score} for all queried CVEs."""
    scores: dict[str, float] = {}
    async with httpx.AsyncClient(timeout=15) as client:
        for i in range(0, len(cve_ids), _EPSS_CHUNK):
            chunk = cve_ids[i : i + _EPSS_CHUNK]
            try:
                r = await client.get(
                    "https://api.first.org/data/v1/epss",
                    params={"cve": ",".join(chunk)},
                )
                if r.status_code == 200:
                    for entry in r.json().get("data", []):
                        scores[entry["cve"]] = float(entry["epss"])
            except Exception:
                pass
    return scores


# --- Main ---

async def main() -> None:
    print("=== seed_top_packages ===")

    # 1. Fetch name candidates
    print("\n[1/5] fetching package name lists...")
    pypi_names, npm_candidates = await asyncio.gather(
        fetch_top_pypi(_TOP_N),
        fetch_top_npm(_TOP_N),  # returns up to 1000 candidates for re-sort
    )
    print(f"  pypi candidates={len(pypi_names)}  npm candidates={len(npm_candidates)}")

    # 2. Fetch downloads for all candidates
    print("\n[2/5] fetching weekly download counts...")
    pypi_candidates = [(n, "PyPI") for n in pypi_names]
    npm_candidates_list = [(n, "npm") for n in npm_candidates]
    all_candidates = pypi_candidates + npm_candidates_list

    print(f"  querying BigQuery for {len(pypi_candidates)} PyPI packages...")
    import time as _time
    _t = _time.time()
    downloads = await fetch_downloads_bulk(all_candidates, npm_concurrency=40)
    print(f"  done in {_time.time()-_t:.1f}s  pypi={sum(1 for (n,e),v in downloads.items() if e=='PyPI' and v>0)}  npm={sum(1 for (n,e),v in downloads.items() if e=='npm' and v>0)}")

    # 3. Re-sort npm by actual downloads, trim to _TOP_N
    npm_ranked = sorted(
        [(n, "npm") for n in npm_candidates],
        key=lambda p: downloads.get(p, 0),
        reverse=True,
    )[:_TOP_N]

    # PyPI list is already sorted by hugovk (30-day download rank); keep order
    pypi_final = [(n, "PyPI") for n in pypi_names[:_TOP_N]]

    packages = pypi_final + npm_ranked
    print(f"  final: pypi={len(pypi_final)} npm={len(npm_ranked)} total={len(packages)}")
    top5_pypi = sorted(pypi_final, key=lambda p: downloads.get(p, 0), reverse=True)[:5]
    top5_npm  = sorted(npm_ranked,  key=lambda p: downloads.get(p, 0), reverse=True)[:5]
    print(f"  top PyPI: {[n for n,_ in top5_pypi]}")
    print(f"  top npm:  {[n for n,_ in top5_npm]}")

    # 4. CVE history via OSV
    print(f"\n[3/5] fetching CVE history ({len(packages)} packages via OSV)...")
    records = await build_cve_history(packages, progress=True)

    cve_ids_by_pkg: dict[tuple[str, str], list[str]] = defaultdict(list)
    for r in records:
        if r.cve_id:
            cve_ids_by_pkg[(r.name, r.ecosystem)].append(r.cve_id)

    all_cves = list({cve for cves in cve_ids_by_pkg.values() for cve in cves})
    print(f"  {len(records)} vuln records, {len(all_cves)} unique CVEs across {len(cve_ids_by_pkg)} packages")

    # upsert cve_history with CVSS data
    conn = duckdb.connect(DB_PATH)
    init_db(conn)
    conn.executemany(
        """
        INSERT INTO cve_history
            (osv_id, cve_id, name, ecosystem, published_date, modified_date, severity, cvss_vector, cvss_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (osv_id, name, ecosystem) DO UPDATE SET
            cvss_score    = excluded.cvss_score,
            cvss_vector   = excluded.cvss_vector,
            severity      = excluded.severity,
            modified_date = excluded.modified_date
        """,
        [(r.osv_id, r.cve_id, r.name, r.ecosystem,
          r.published_date, r.modified_date, r.severity, r.cvss_vector, r.cvss_score)
         for r in records],
    )
    print(f"  cve_history upserted={len(records)}")

    # 5. EPSS
    print("\n[4/5] fetching EPSS scores...")
    epss_scores = await bulk_epss(all_cves)
    print(f"  EPSS scores fetched={len(epss_scores)}")

    # 6. Upsert
    print("\n[5/5] upserting to DB...")
    inserted = updated = 0
    for pkg in packages:
        name, ecosystem = pkg
        weekly_dl = downloads.get(pkg, 0) or 0
        cve_ids   = cve_ids_by_pkg.get(pkg, [])
        pkg_epss  = max((epss_scores.get(c, 0.0) for c in cve_ids), default=None) if cve_ids else None
        risk      = weekly_dl * (pkg_epss or 0.0)

        existing = conn.execute(
            "SELECT 1 FROM packages WHERE name = ? AND ecosystem = ?",
            [name, ecosystem],
        ).fetchone()

        if existing:
            conn.execute(
                """
                UPDATE packages
                SET weekly_downloads  = ?,
                    cve_ids           = ?,
                    epss_score        = ?,
                    risk_score        = ?,
                    last_enriched_at  = now()
                WHERE name = ? AND ecosystem = ?
                """,
                [weekly_dl, cve_ids, pkg_epss, risk, name, ecosystem],
            )
            updated += 1
        else:
            conn.execute(
                """
                INSERT INTO packages
                    (name, ecosystem, weekly_downloads, cve_ids, epss_score, risk_score)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [name, ecosystem, weekly_dl, cve_ids, pkg_epss, risk],
            )
            inserted += 1

    conn.close()

    print(f"\ndone. inserted={inserted} updated={updated}")
    print("top risk packages:")
    top_risk = sorted(
        packages,
        key=lambda p: downloads.get(p, 0) * (
            max((epss_scores.get(c, 0.0) for c in cve_ids_by_pkg.get(p, [])), default=0.0)
        ),
        reverse=True,
    )[:10]
    for pkg in top_risk:
        name, eco = pkg
        dl = downloads.get(pkg, 0)
        epss = max((epss_scores.get(c, 0.0) for c in cve_ids_by_pkg.get(pkg, [])), default=0.0)
        print(f"  {eco:6} {name:40} dl={dl:>12,}  epss={epss:.4f}  risk={dl*epss:,.0f}")


if __name__ == "__main__":
    asyncio.run(main())
