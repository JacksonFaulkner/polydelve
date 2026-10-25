"""
Fetch and cache the Packagist inputs for the Composer backtest (stdlib only).

Caches under data/ (raw responses, reused on re-run):
  popular_pages/*.json   Packagist explore/popular.json, 100 per page, by download count
  list.json              Packagist packages/list.json (every package name)
  osv_packagist_all.zip  OSV bulk export for the Packagist ecosystem
  meta/<name>.json       packages/<name>.json (for the package creation date)
  sample.json            the stratified sample of package names (seeded)

Sample design (seed 7):
  top   : 50 random from popularity ranks 1-500
  mid   : 75 random from popularity ranks 501-5000
  tail  : 50 random from the full catalog outside the top 5000
"""
from __future__ import annotations

import json
import random
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
UA = "polydelve-composer-backtest/1.0 (research; contact via repo owner)"
OSV_ZIP_URL = "https://osv-vulnerabilities.storage.googleapis.com/Packagist/all.zip"
POPULAR_URL = "https://packagist.org/explore/popular.json?per_page=100&page={page}"
LIST_URL = "https://packagist.org/packages/list.json"
META_URL = "https://packagist.org/packages/{name}.json"

POPULAR_PAGES = 50  # 5,000 most-downloaded packages
N_TOP, N_MID, N_TAIL = 50, 75, 50
SEED = 7


def _get(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _cached(path: Path, url: str, pause: float = 0.0) -> bytes:
    if path.exists() and path.stat().st_size > 0:
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    body = _get(url)
    path.write_bytes(body)
    if pause:
        time.sleep(pause)
    return body


def fetch_popular() -> list[dict]:
    out: list[dict] = []
    for page in range(1, POPULAR_PAGES + 1):
        raw = _cached(DATA / "popular_pages" / f"{page:03d}.json", POPULAR_URL.format(page=page), pause=0.2)
        out.extend(json.loads(raw)["packages"])
    return out


def build_sample(popular: list[dict], catalog: list[str]) -> dict:
    rng = random.Random(SEED)
    top = [p["name"].lower() for p in popular[:500]]
    mid = [p["name"].lower() for p in popular[500:5000]]
    popset = {p["name"].lower() for p in popular}
    tail_pool = sorted(n.lower() for n in catalog if n.lower() not in popset)
    rng.shuffle(top)
    rng.shuffle(mid)
    rng.shuffle(tail_pool)
    tiers = {
        "top": top[:N_TOP],
        "mid": mid[:N_MID],
        "tail": tail_pool[:N_TAIL],
    }
    # rank lookup for the report
    rank = {p["name"].lower(): i + 1 for i, p in enumerate(popular)}
    rows = [
        {"name": n, "tier": t, "popularity_rank": rank.get(n)}
        for t, names in tiers.items()
        for n in names
    ]
    return {"seed": SEED, "popular_packages_total": len(popular), "rows": rows}


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    popular = fetch_popular()
    catalog = json.loads(_cached(DATA / "list.json", LIST_URL))["packageNames"]
    _cached(DATA / "osv_packagist_all.zip", OSV_ZIP_URL)
    sample = build_sample(popular, catalog)
    for row in sample["rows"]:
        name = row["name"]
        # Packagist names are vendor/package; keep the file name filesystem-safe
        safe = urllib.parse.quote(name, safe="")
        meta = _cached(DATA / "meta" / f"{safe}.json", META_URL.format(name=name), pause=0.05)
        pkg = json.loads(meta).get("package", {})
        row["created"] = (pkg.get("time") or "")[:10] or None
    (DATA / "sample.json").write_text(json.dumps(sample, indent=1))
    print(f"popular={len(popular)} catalog={len(catalog)} sample={len(sample['rows'])}", file=sys.stderr)


if __name__ == "__main__":
    main()
