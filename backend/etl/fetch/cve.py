"""Fetch and build CVE history from OSV bulk downloads."""
import asyncio
import io
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

_OSV_ECOSYSTEMS = {"npm": "npm", "PyPI": "PyPI", "composer": "Packagist"}
_SEVERITY_MAP = {"CRITICAL": "critical", "HIGH": "high", "MODERATE": "medium", "LOW": "low"}
_OSV_BULK_URL = "https://osv-vulnerabilities.storage.googleapis.com/{ecosystem}/all.zip"
_CVE_CACHE_DIR = Path("/tmp/osv_cve_zips")

_NPM_FALLBACK_SEED: list[str] = [
    "chalk", "lodash", "react", "typescript", "axios", "express", "eslint",
    "prettier", "jest", "webpack", "babel", "moment", "underscore", "jquery",
    "vue", "next", "gatsby", "nuxt", "angular", "mocha", "commander",
    "dotenv", "uuid", "debug", "semver", "glob", "minimist", "yargs",
    "jsonwebtoken", "passport", "bcrypt", "bcryptjs", "crypto-js",
    "handlebars", "pug", "ejs", "nunjucks", "vm2",
    "tar", "node-tar", "follow-redirects", "braces", "micromatch",
    "lodash.merge", "lodash.set", "lodash.template", "merge-deep",
    "ip", "decode-uri-component", "ua-parser-js", "svgo",
    "socket.io", "ws", "log4js", "node-serialize", "serialize-javascript",
    "graphql", "apollo-server", "@apollo/server",
    "openai", "@anthropic-ai/sdk", "langchain",
    "electron", "pkg",
    "minimatch", "path-to-regexp", "semver", "shelljs",
]


@dataclass
class CveRecord:
    osv_id: str
    cve_id: str | None
    name: str
    ecosystem: str
    published_date: str | None
    modified_date: str | None
    severity: str | None
    cvss_vector: str | None
    cvss_score: float | None = None


async def fetch_top_npm(n: int = 99_999) -> list[str]:
    """Fetch top n npm package names from wooorm/npm-high-impact. Falls back to seed list."""
    import re
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://raw.githubusercontent.com/wooorm/npm-high-impact/main/lib/top-download.js"
            )
            if r.status_code == 200:
                names = re.findall(r"'([^']+)'", r.text)
                if names:
                    return list(dict.fromkeys(names))[:n]
    except Exception:
        pass
    return list(dict.fromkeys(_NPM_FALLBACK_SEED))[:n]


async def fetch_top_pypi(n: int = 99_999) -> list[str]:
    """Fetch top n PyPI package names by 30-day downloads."""
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        r = await client.get(
            "https://hugovk.github.io/top-pypi-packages/top-pypi-packages-30-days.min.json"
        )
        if r.status_code == 200:
            return [row["project"] for row in r.json().get("rows", [])[:n]]
    return []


def _cvss_score_from_vector(vector: str | None) -> float | None:
    if not vector:
        return None
    try:
        if vector.startswith("CVSS:4"):
            from cvss import CVSS4
            return float(CVSS4(vector).base_score)
        from cvss import CVSS3
        return float(CVSS3(vector).base_score)
    except Exception:
        return None


def _parse_vuln(vuln: dict) -> tuple[str | None, str | None, str | None, float | None]:
    cve_id = next((a for a in vuln.get("aliases", []) if a.startswith("CVE-")), None)
    db = vuln.get("database_specific", {})
    raw_sev = (db.get("severity") or "").upper()
    severity = _SEVERITY_MAP.get(raw_sev)
    cvss_vector = None
    for sev in vuln.get("severity", []):
        if sev.get("type") in ("CVSS_V3", "CVSS_V2", "CVSS_V4"):
            cvss_vector = sev.get("score")
            break
    return cve_id, severity, cvss_vector, _cvss_score_from_vector(cvss_vector)


async def _download_bulk_ecosystem(
    client: httpx.AsyncClient,
    ecosystem: str,
    progress: bool,
) -> dict[str, list[dict]]:
    osv_eco = _OSV_ECOSYSTEMS.get(ecosystem, ecosystem)
    url = _OSV_BULK_URL.format(ecosystem=osv_eco)
    _CVE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = _CVE_CACHE_DIR / f"osv_{ecosystem.lower()}_all.zip"

    if dest.exists() and dest.stat().st_size > 100_000:
        if progress:
            print(f"  {osv_eco}: using cached {dest} ({dest.stat().st_size // 1_000_000}MB)", flush=True)
        raw = dest.read_bytes()
    else:
        if progress:
            print(f"  downloading {url} ...", flush=True)
        r = await client.get(url, timeout=120)
        r.raise_for_status()
        dest.write_bytes(r.content)
        raw = r.content
        if progress:
            print(f"  {osv_eco}: {len(raw)/1e6:.1f}MB saved to cache", flush=True)

    if progress:
        print(f"  {osv_eco}: parsing...", flush=True)
    z = zipfile.ZipFile(io.BytesIO(raw))
    by_pkg: dict[str, list[dict]] = {}
    for name in z.namelist():
        vuln = json.loads(z.read(name))
        for affected in vuln.get("affected", []):
            pkg = affected.get("package", {})
            if pkg.get("ecosystem", "") == osv_eco:
                key = pkg.get("name", "").lower()
                by_pkg.setdefault(key, []).append(vuln)
    return by_pkg


async def build_cve_history(
    packages: list[tuple[str, str]],
    progress: bool = True,
) -> list[CveRecord]:
    """Bulk-fetch CVE records from OSV and return as CveRecord list for DB upsert."""
    ecosystems = list({eco for _, eco in packages})
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        bulk_results = await asyncio.gather(
            *[_download_bulk_ecosystem(client, eco, progress) for eco in ecosystems]
        )
    bulk: dict[str, dict[str, list[dict]]] = dict(zip(ecosystems, bulk_results))
    records: list[CveRecord] = []
    for name, ecosystem in packages:
        for vuln in bulk.get(ecosystem, {}).get(name.lower(), []):
            cve_id, severity, cvss_vector, cvss_score = _parse_vuln(vuln)
            records.append(CveRecord(
                osv_id=vuln.get("id", ""),
                cve_id=cve_id,
                name=name,
                ecosystem=ecosystem,
                published_date=vuln.get("published"),
                modified_date=vuln.get("modified"),
                severity=severity,
                cvss_vector=cvss_vector,
                cvss_score=cvss_score,
            ))
    if progress:
        print(f"  bulk: {len(records)} records for {len(packages)} packages", flush=True)
    return records


def upsert_cve_records(conn: Any, records: list[CveRecord]) -> int:
    """Upsert CveRecord list into cve_history. Returns count inserted/updated."""
    if not records:
        return 0
    cur = conn.cursor()
    cur.executemany(
        """
        INSERT INTO cve_history
            (osv_id, cve_id, name, ecosystem, published_date, modified_date,
             severity, cvss_vector, cvss_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (osv_id, name, ecosystem) DO UPDATE SET
            cve_id        = EXCLUDED.cve_id,
            modified_date = EXCLUDED.modified_date,
            severity      = EXCLUDED.severity,
            cvss_vector   = EXCLUDED.cvss_vector,
            cvss_score    = EXCLUDED.cvss_score
        """,
        [
            (r.osv_id, r.cve_id, r.name, r.ecosystem,
             r.published_date, r.modified_date,
             r.severity, r.cvss_vector, r.cvss_score)
            for r in records
        ],
    )
    return len(records)
