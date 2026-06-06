"""Fetch package metadata: downloads, CVEs, EPSS, MAL advisory, GitHub org/avatar."""
import asyncio
import json
import os
import re
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import httpx

_LOCAL_BQ_SA_PATH = Path(__file__).parent.parent.parent / "secrets" / "polydelve-bq-sa.json"


def _bq_client():
    from google.cloud import bigquery
    from google.oauth2 import service_account

    bq_sa_json = os.getenv("BQ_SA_JSON")
    if bq_sa_json:
        info = json.loads(bq_sa_json)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
    elif _LOCAL_BQ_SA_PATH.exists():
        creds = service_account.Credentials.from_service_account_file(
            str(_LOCAL_BQ_SA_PATH),
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
    else:
        raise RuntimeError(
            "No BQ credentials: set BQ_SA_JSON env var or provide secrets/polydelve-bq-sa.json"
        )
    return bigquery.Client(credentials=creds, project="polydelve")


def fetch_pypi_downloads_bulk_bq(names: list[str]) -> dict[str, int]:
    """Single BigQuery query for all PyPI packages. Returns {name: weekly_downloads}."""
    if not names:
        return {}
    import time
    print(f"  [BQ] scanning pypi.file_downloads for {len(names)} packages...", flush=True)
    t = time.time()
    client = _bq_client()
    placeholders = ", ".join(f"'{n}'" for n in names)
    query = f"""
        SELECT project AS package, COUNT(*) AS weekly_downloads
        FROM `bigquery-public-data.pypi.file_downloads`
        WHERE DATE(timestamp) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
          AND project IN ({placeholders})
        GROUP BY package
    """
    result = {r.package: r.weekly_downloads for r in client.query(query).result()}
    print(
        f"  [BQ] done in {time.time() - t:.1f}s  matched={len(result)}/{len(names)}",
        flush=True,
    )
    return result


@dataclass
class PackageEnrichment:
    weekly_downloads: int | None
    cve_ids: list[str]
    epss_score: float | None
    has_mal_advisory: bool = False
    github_org: str | None = None
    logo_url: str | None = None


async def fetch_npm_downloads(
    client: httpx.AsyncClient, name: str, sem: asyncio.Semaphore | None = None
) -> int:
    async def _do() -> int:
        for attempt in range(4):
            try:
                r = await client.get(
                    f"https://api.npmjs.org/downloads/point/last-week/{name}", timeout=10
                )
                if r.status_code == 200:
                    return r.json().get("downloads") or 0
                if r.status_code == 429:
                    await asyncio.sleep(2**attempt)
                    continue
            except Exception:
                pass
        return 0

    if sem:
        async with sem:
            return await _do()
    return await _do()


async def fetch_pypi_downloads(
    client: httpx.AsyncClient, name: str, sem: asyncio.Semaphore | None = None
) -> int:
    async def _do() -> int:
        for attempt in range(4):
            try:
                r = await client.get(
                    f"https://pypistats.org/api/packages/{name.lower()}/recent", timeout=10
                )
                if r.status_code == 200:
                    return r.json().get("data", {}).get("last_week") or 0
                if r.status_code == 429:
                    await asyncio.sleep(2**attempt)
                    continue
            except Exception:
                pass
        return 0

    if sem:
        async with sem:
            return await _do()
    return await _do()


async def fetch_downloads_bulk(
    packages: list[tuple[str, str]],
    npm_concurrency: int = 40,
) -> dict[tuple[str, str], int]:
    """Fetch weekly download counts for a mixed list of npm + PyPI packages."""
    npm_pkgs = [(n, e) for n, e in packages if e == "npm"]
    pypi_pkgs = [(n, e) for n, e in packages if e == "PyPI"]
    results: dict[tuple[str, str], int] = {}

    if pypi_pkgs:
        pypi_names = [n for n, _ in pypi_pkgs]
        bq_results = await asyncio.get_event_loop().run_in_executor(
            None, fetch_pypi_downloads_bulk_bq, pypi_names
        )
        for name, eco in pypi_pkgs:
            results[(name, eco)] = bq_results.get(name, 0)

    if npm_pkgs:
        npm_names = [n for n, _ in npm_pkgs]
        unscoped = [n for n in npm_names if not n.startswith("@")]
        scoped = [n for n in npm_names if n.startswith("@")]
        batch_size = 128
        batches = [unscoped[i:i + batch_size] for i in range(0, len(unscoped), batch_size)]
        print(
            f"  [npm] {len(unscoped)} unscoped ({len(batches)} batches) + {len(scoped)} scoped...",
            flush=True,
        )

        _end = date.today() - timedelta(days=1)
        _start = _end - timedelta(days=6)

        async def fetch_batch(
            client: httpx.AsyncClient, sem: asyncio.Semaphore, batch: list[str]
        ) -> dict[str, int]:
            async with sem:
                try:
                    r = await client.get(
                        f"https://api.npmjs.org/downloads/point/last-week/{','.join(batch)}",
                        timeout=15,
                    )
                    if r.status_code == 200:
                        return {k: v.get("downloads") or 0 for k, v in r.json().items()}
                except Exception:
                    pass
                return {}

        async def fetch_scoped_batch(
            client: httpx.AsyncClient, sem: asyncio.Semaphore, batch: list[str]
        ) -> dict[str, int]:
            async with sem:
                try:
                    r = await client.get(
                        "https://npm-stat.com/api/download-counts",
                        params={"package": ",".join(batch), "from": str(_start), "until": str(_end)},
                        timeout=15,
                    )
                    if r.status_code == 200:
                        return {pkg: sum(v.values()) for pkg, v in r.json().items()}
                except Exception:
                    pass
                return {}

        scoped_batches = [scoped[i:i + 20] for i in range(0, len(scoped), 20)]
        unscoped_sem = asyncio.Semaphore(npm_concurrency)
        scoped_sem = asyncio.Semaphore(20)
        async with httpx.AsyncClient(timeout=15) as client:
            batch_results = await asyncio.gather(
                *[fetch_batch(client, unscoped_sem, b) for b in batches],
                *[fetch_scoped_batch(client, scoped_sem, b) for b in scoped_batches],
            )
        npm_dl: dict[str, int] = {}
        for br in batch_results:
            if isinstance(br, dict):
                npm_dl.update(br)
        for name, eco in npm_pkgs:
            results[(name, eco)] = npm_dl.get(name, 0)

    return results


async def validate_packages(
    packages: list[tuple[str, str]],
    concurrency: int = 20,
) -> set[tuple[str, str]]:
    """Return subset of (name, ecosystem) that actually exist on their registry."""
    sem = asyncio.Semaphore(concurrency)

    async def check(client: httpx.AsyncClient, name: str, eco: str) -> tuple[str, str] | None:
        async with sem:
            try:
                if eco == "npm":
                    r = await client.get(f"https://registry.npmjs.org/{name}", timeout=10)
                elif eco == "PyPI":
                    r = await client.get(f"https://pypi.org/pypi/{name}/json", timeout=10)
                else:
                    return None
                if r.status_code == 200:
                    return (name, eco)
            except Exception:
                pass
            return None

    async with httpx.AsyncClient(timeout=10) as client:
        results = await asyncio.gather(*[check(client, n, e) for n, e in packages])
    return {r for r in results if r is not None}


async def fetch_cve_ids(
    client: httpx.AsyncClient, name: str, ecosystem: str
) -> list[str]:
    """Fetch CVE IDs for a package from OSV API."""
    osv_eco = {"npm": "npm", "PyPI": "PyPI", "composer": "Packagist"}.get(ecosystem, ecosystem)
    try:
        r = await client.post(
            "https://api.osv.dev/v1/query",
            json={"package": {"name": name, "ecosystem": osv_eco}},
        )
        if r.status_code == 200:
            vulns = r.json().get("vulns", [])
            return [
                alias
                for v in vulns
                for alias in v.get("aliases", [v.get("id", "")])
                if alias.startswith("CVE-")
            ]
    except Exception:
        pass
    return []


async def fetch_mal_advisory(
    client: httpx.AsyncClient, name: str, ecosystem: str
) -> bool:
    """Return True if an active MAL advisory exists for this package on OSV."""
    osv_eco = {"npm": "npm", "PyPI": "PyPI"}.get(ecosystem)
    if not osv_eco:
        return False
    try:
        r = await client.post(
            "https://api.osv.dev/v1/query",
            json={"package": {"name": name, "ecosystem": osv_eco}},
            timeout=10,
        )
        if r.status_code == 200:
            vulns = r.json().get("vulns", [])
            return any(v.get("id", "").startswith("MAL-") for v in vulns)
    except Exception:
        pass
    return False


async def fetch_github_org(
    client: httpx.AsyncClient, name: str, ecosystem: str
) -> str | None:
    """Resolve the GitHub org for a package via registry metadata."""
    try:
        if ecosystem == "npm":
            r = await client.get(f"https://registry.npmjs.org/{name}")
            if r.status_code == 200:
                repo = r.json().get("repository", {})
                url = repo.get("url", "") if isinstance(repo, dict) else str(repo)
                m = re.search(r"github\.com[/:]([^/]+)", url)
                return m.group(1) if m else None
        elif ecosystem == "PyPI":
            r = await client.get(f"https://pypi.org/pypi/{name}/json")
            if r.status_code == 200:
                urls = r.json().get("info", {}).get("project_urls") or {}
                for url in urls.values():
                    m = re.search(r"github\.com[/:]([^/]+)", url)
                    if m:
                        return m.group(1)
    except Exception:
        pass
    return None


async def fetch_github_avatar(client: httpx.AsyncClient, org: str) -> str | None:
    """Return GitHub avatar URL for an org or user slug."""
    for endpoint in [
        f"https://api.github.com/orgs/{org}",
        f"https://api.github.com/users/{org}",
    ]:
        try:
            r = await client.get(endpoint)
            if r.status_code == 200:
                return r.json().get("avatar_url")
        except Exception:
            pass
    return None
