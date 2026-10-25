"""
Build the npm backtest dataset (point-in-time CVE events + a popularity-stratified package sample).

Inputs
  - OSV npm bulk export: https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip
    One JSON per advisory. Each advisory has a `published` timestamp (the as-of key)
    and `aliases` (we keep only advisories with a CVE alias, matching cve_history).
  - npm registry search API (https://registry.npmjs.org/-/v1/search) for a pool of
    package names, including packages with no advisories (needed for the "quiet" side).
  - npm downloads API (https://api.npmjs.org/downloads/point/last-month/) for popularity
    of OSV-only names.

Outputs (in data/, not committed)
  - events.jsonl  one row per (package, CVE): {pkg, pub, cve, cvss, ghsa}
  - sample.json   the sampled packages with monthly downloads and tier

Run:  backend/.venv/bin/python scripts/backtest/npm/build_dataset.py
"""
from __future__ import annotations

import json
import random
import sys
import time
import zipfile
from collections import defaultdict
from pathlib import Path

import httpx
from cvss import CVSS3

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
ZIP_PATH = DATA / "npm_all.zip"
OSV_URL = "https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip"

SEARCH_URL = "https://registry.npmjs.org/-/v1/search"
DOWNLOADS_URL = "https://api.npmjs.org/downloads/point/last-month/"

SEARCH_TERMS = [
    "react", "vue", "angular", "express", "utils", "cli", "parser", "logger", "config",
    "testing", "http", "database", "crypto", "date", "string", "array", "css", "webpack",
    "babel", "typescript", "eslint", "graphql", "api", "server", "client", "json", "yaml",
    "markdown", "image", "xml", "async", "stream", "router", "auth", "validator", "schema",
    "math", "color", "chart", "icons", "ui", "component", "hook", "fetch", "promise", "tool",
    "build", "loader", "plugin", "mock", "jest", "cache", "queue", "email", "socket", "redis",
    "mongo", "sql", "aws", "google", "telemetry", "lint", "format", "compress", "zip", "uuid",
    "hash", "file", "path", "shell", "terminal", "env", "yargs", "commander", "debug", "semver",
    "axios", "request", "cookie", "jwt", "bcrypt", "sanitize", "template", "theme", "animation",
    "svelte", "next", "nuxt", "react-native", "electron", "pdf", "excel", "csv", "parse", "http-proxy",
]

# Popularity tiers by last-month downloads (current counts, see caveats).
TIERS = [(0, 1_000, "T1 <1k"), (1_000, 10_000, "T2 1k-10k"), (10_000, 100_000, "T3 10k-100k"),
         (100_000, 1_000_000, "T4 100k-1M"), (1_000_000, 10**12, "T5 >1M")]
PER_TIER = 50
SEED = 7


def parse_osv() -> tuple[list[dict], set[str]]:
    """Return CVE events (one per package per CVE) and the set of npm names seen in OSV."""
    events: list[dict] = []
    osv_names: set[str] = set()
    seen: set[tuple[str, str]] = set()
    with zipfile.ZipFile(ZIP_PATH) as z:
        for info in z.infolist():
            if not info.filename.endswith(".json"):
                continue
            adv = json.loads(z.read(info))
            aid = adv.get("id", "")
            if aid.startswith("MAL-") or adv.get("withdrawn"):
                continue
            cves = [a for a in adv.get("aliases", []) if a.startswith("CVE-")]
            if not cves:
                continue
            pkgs = {
                a["package"]["name"]
                for a in adv.get("affected", [])
                if a.get("package", {}).get("ecosystem") == "npm"
            }
            if not pkgs:
                continue
            osv_names |= pkgs
            pub = adv["published"][:10]
            cvss = _cvss_score(adv)
            for pkg in pkgs:
                for cve in cves:
                    if (pkg, cve) in seen:
                        continue
                    seen.add((pkg, cve))
                    events.append({"pkg": pkg, "pub": pub, "cve": cve, "cvss": cvss, "ghsa": aid})
    events.sort(key=lambda e: e["pub"])
    return events, osv_names


_SEV_FALLBACK = {"CRITICAL": 9.5, "HIGH": 8.0, "MODERATE": 5.5, "MEDIUM": 5.5, "LOW": 2.5}


def _cvss_score(adv: dict) -> float | None:
    for s in adv.get("severity", []) or []:
        if s.get("type") == "CVSS_V3" and s.get("score", "").startswith("CVSS:3"):
            try:
                return float(CVSS3(s["score"]).scores()[0])
            except Exception:
                pass
    sev = (adv.get("database_specific") or {}).get("severity")
    return _SEV_FALLBACK.get(str(sev).upper()) if sev else None


def search_pool() -> dict[str, int]:
    """name -> monthly downloads from registry search, for the quiet/general pool."""
    out: dict[str, int] = {}
    with httpx.Client(timeout=30) as c:
        for term in SEARCH_TERMS:
            for offset in (0, 250):
                try:
                    r = c.get(SEARCH_URL, params={"text": term, "size": 250, "from": offset})
                    r.raise_for_status()
                    objs = r.json().get("objects", [])
                except Exception as exc:  # network blips: skip this page
                    print(f"  search {term}@{offset} failed: {exc}", file=sys.stderr)
                    continue
                for o in objs:
                    name = o["package"]["name"]
                    out[name] = int(o.get("downloads", {}).get("monthly", 0))
                if len(objs) < 250:
                    break
    return out


def bulk_downloads(names: list[str]) -> dict[str, int]:
    """Monthly downloads for unscoped names, 128 per request (API limit)."""
    out: dict[str, int] = {}
    with httpx.Client(timeout=30) as c:
        for i in range(0, len(names), 128):
            chunk = names[i:i + 128]
            try:
                r = c.get(DOWNLOADS_URL + ",".join(chunk))
                r.raise_for_status()
                body = r.json()
            except Exception as exc:
                print(f"  downloads chunk {i} failed: {exc}", file=sys.stderr)
                continue
            if len(chunk) == 1:
                body = {chunk[0]: body}
            for name in chunk:
                row = body.get(name) or {}
                if row.get("downloads") is not None:
                    out[name] = int(row["downloads"])
            time.sleep(0.2)
    return out


def tier_of(dl: int) -> str | None:
    for lo, hi, label in TIERS:
        if lo <= dl < hi:
            return label
    return None


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    if not ZIP_PATH.exists():
        raise SystemExit(f"missing {ZIP_PATH}; download {OSV_URL} first")

    print("parsing OSV npm export ...")
    events, osv_names = parse_osv()
    print(f"  CVE events: {len(events):,}   packages with >=1 CVE: {len({e['pkg'] for e in events}):,}")
    with (DATA / "events.jsonl").open("w") as f:
        for e in events:
            f.write(json.dumps(e) + "\n")

    print("fetching registry search pool ...")
    pool = search_pool()
    print(f"  search pool: {len(pool):,} names")

    # Downloads for OSV-only unscoped names (search results already carry downloads).
    osv_only = sorted(n for n in osv_names if n not in pool and not n.startswith("@"))
    print(f"fetching downloads for {len(osv_only):,} OSV-only unscoped names ...")
    pool.update(bulk_downloads(osv_only))

    # Stratify: equal draws per popularity tier from everything we can price.
    affected = {e["pkg"] for e in events}
    by_tier: dict[str, list[str]] = defaultdict(list)
    for name, dl in pool.items():
        t = tier_of(dl)
        if t:
            by_tier[t].append(name)

    rng = random.Random(SEED)
    sample = []
    for _, _, label in TIERS:
        names = sorted(by_tier.get(label, []))
        picks = rng.sample(names, min(PER_TIER, len(names)))
        for name in picks:
            sample.append({
                "name": name,
                "downloads_last_month": pool[name],
                "tier": label,
                "has_cve_in_osv": name in affected,
            })
        print(f"  {label}: pool {len(names):,}  sampled {len(picks)}")

    (DATA / "sample.json").write_text(json.dumps(sample, indent=1))
    print(f"sample size: {len(sample)}  (with >=1 CVE in OSV: {sum(s['has_cve_in_osv'] for s in sample)})")


if __name__ == "__main__":
    main()
