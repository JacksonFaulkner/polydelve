"""Download and parse OSV MAL-* advisories from GCS bulk zips."""
import json
import zipfile
from datetime import datetime
from pathlib import Path

import httpx

from models.models import MalAdvisoryRow

BULK_URLS = {
    "npm":  "https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip",
    "PyPI": "https://osv-vulnerabilities.storage.googleapis.com/PyPI/all.zip",
}


def _parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _ecosystem_for_pkg(pkg: dict) -> str | None:
    eco = (pkg.get("ecosystem") or "").lower()
    if eco == "npm":
        return "npm"
    if eco == "pypi":
        return "PyPI"
    return None


def download_zip(ecosystem: str, dest: Path, client: httpx.Client) -> None:
    """Download OSV all.zip for an ecosystem to dest path."""
    url = BULK_URLS[ecosystem]
    print(f"  downloading {url} ...", flush=True)
    with client.stream("GET", url, follow_redirects=True, timeout=120) as r:
        r.raise_for_status()
        dest.write_bytes(r.read())
    print(f"  saved {dest.stat().st_size // 1_000_000} MB", flush=True)


def parse_zip(zip_path: Path, ecosystem: str) -> list[MalAdvisoryRow]:
    """Extract MAL-* advisory records from an OSV bulk zip."""
    records: list[MalAdvisoryRow] = []
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
            modified_at = _parse_ts(data.get("modified"))
            withdrawn = data.get("withdrawn") is not None
            for affected in data.get("affected", []):
                pkg = affected.get("package", {})
                eco = _ecosystem_for_pkg(pkg)
                if eco != ecosystem:
                    continue
                pkg_name = pkg.get("name", "").strip()
                if not pkg_name:
                    continue
                records.append(MalAdvisoryRow(
                    osv_id=osv_id,
                    name=pkg_name,
                    ecosystem=eco,
                    published_at=published_at,
                    modified_at=modified_at,
                    withdrawn=withdrawn,
                    summary=(data.get("summary") or "")[:500],
                ))
    return records
