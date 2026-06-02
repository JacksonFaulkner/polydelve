import asyncio
import sys
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).parent.parent))

from features.cve_history import build_cve_history, fetch_top_npm, fetch_top_pypi
from features.db import DB_PATH, init_db


async def main() -> None:
    conn = duckdb.connect(DB_PATH)
    init_db(conn)

    print("Fetching top packages...")
    npm_names, pypi_names = await asyncio.gather(
        fetch_top_npm(500),
        fetch_top_pypi(500),
    )
    print(f"  npm: {len(npm_names)}, pypi: {len(pypi_names)}")

    existing = conn.execute(
        "SELECT name, ecosystem FROM packages WHERE ecosystem IN ('npm', 'PyPI')"
    ).fetchall()

    packages = list({
        *[(n, "npm") for n in npm_names],
        *[(n, "PyPI") for n in pypi_names],
        *existing,
    })
    print(f"  total unique packages: {len(packages)}")

    # Upsert so all packages have a record in the packages table
    conn.executemany(
        "INSERT INTO packages (name, ecosystem) VALUES (?, ?) ON CONFLICT (name, ecosystem) DO NOTHING",
        packages,
    )

    print("Building CVE history...")
    records = await build_cve_history(packages)
    print(f"  {len(records)} records found")

    conn.executemany(
        """
        INSERT INTO cve_history
            (osv_id, cve_id, name, ecosystem, published_date, modified_date, severity, cvss_vector, cvss_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (osv_id, name, ecosystem) DO UPDATE SET
            cvss_score   = excluded.cvss_score,
            cvss_vector  = excluded.cvss_vector,
            severity     = excluded.severity,
            modified_date = excluded.modified_date
        """,
        [
            (r.osv_id, r.cve_id, r.name, r.ecosystem,
             r.published_date, r.modified_date, r.severity, r.cvss_vector, r.cvss_score)
            for r in records
        ],
    )
    conn.close()

    pkgs_with_vulns = len({(r.name, r.ecosystem) for r in records})
    with_cve_id = sum(1 for r in records if r.cve_id)
    sev_counts = {}
    for r in records:
        sev_counts[r.severity or "unknown"] = sev_counts.get(r.severity or "unknown", 0) + 1

    print(f"\nDone:")
    print(f"  {pkgs_with_vulns} packages with vulnerabilities")
    print(f"  {len(records)} total records ({with_cve_id} with CVE IDs)")
    print(f"  severity breakdown: {dict(sorted(sev_counts.items()))}")


if __name__ == "__main__":
    asyncio.run(main())
