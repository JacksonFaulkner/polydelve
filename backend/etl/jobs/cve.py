"""CVE history seed job — builds the tracked package universe from OSV bulk data."""
from typing import Any

from etl.fetch.cve import build_cve_history, fetch_top_npm, fetch_top_pypi, upsert_cve_records


async def run(conn: Any, top_n: int = 99_999) -> None:
    npm_names = await fetch_top_npm(top_n)
    pypi_names = await fetch_top_pypi(top_n)
    print(f"[cve] candidates: npm={len(npm_names)} pypi={len(pypi_names)}", flush=True)

    packages = [(n, "npm") for n in npm_names] + [(n, "PyPI") for n in pypi_names]
    records = await build_cve_history(packages)
    n = upsert_cve_records(conn, records)
    print(f"[cve] upserted {n} cve_history rows", flush=True)
