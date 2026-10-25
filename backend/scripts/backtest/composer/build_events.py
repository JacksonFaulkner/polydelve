"""
Turn the OSV Packagist bulk export into point-in-time CVE events per package.

One event = one (package, CVE id) pair, dated at the OSV entry's `published`
timestamp (GitHub's publish date), keeping the earliest publish date if a CVE
appears in several advisories. Only entries carrying a CVE alias are kept, to
match the CVE-based definition used by the pricing model (GHSA-only entries
are dropped and counted).

CVSS for threshold comparison, in order:
  1. CVSS 3.x base score, computed from the vector string in the OSV entry
  2. proxy from database_specific.severity (CRITICAL 9.5, HIGH 8.0,
     MODERATE 5.5, LOW 2.5) when no v3 vector is present
  3. None -> the pricing model's UNSCORED_CVSS convention (5.0)

Writes data/cve_events.json: {"vendor/pkg": [[cve_id, "YYYY-MM-DD", score|null, source], ...]}
Run: python3 -I build_events.py
"""
from __future__ import annotations

import json
import math
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ZIP = HERE / "data" / "osv_packagist_all.zip"
OUT = HERE / "data" / "cve_events.json"

SEVERITY_PROXY = {"CRITICAL": 9.5, "HIGH": 8.0, "MODERATE": 5.5, "MEDIUM": 5.5, "LOW": 2.5}


def cvss3_base(vector: str) -> float | None:
    """CVSS 3.0/3.1 base score from a vector string."""
    if not vector or not vector.startswith("CVSS:3"):
        return None
    try:
        m = dict(part.split(":", 1) for part in vector.split("/")[1:])
        scope_changed = m["S"] == "C"
        av = {"N": 0.85, "A": 0.62, "L": 0.55, "P": 0.2}[m["AV"]]
        ac = {"L": 0.77, "H": 0.44}[m["AC"]]
        pr = {"N": 0.85, "L": 0.68 if scope_changed else 0.62,
              "H": 0.5 if scope_changed else 0.27}[m["PR"]]
        ui = {"N": 0.85, "R": 0.62}[m["UI"]]
        cia = {"H": 0.56, "L": 0.22, "N": 0.0}
        iss = 1 - (1 - cia[m["C"]]) * (1 - cia[m["I"]]) * (1 - cia[m["A"]])
    except (KeyError, ValueError):
        return None
    impact = 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 if scope_changed else 6.42 * iss
    expl = 8.22 * av * ac * pr * ui
    if impact <= 0:
        return 0.0
    raw = min(1.08 * (impact + expl), 10.0) if scope_changed else min(impact + expl, 10.0)
    return math.ceil(raw * 10 - 1e-9) / 10  # CVSS "round up to one decimal"


def score_of(entry: dict) -> tuple[float | None, str]:
    for s in entry.get("severity", []) or []:
        if s.get("type") == "CVSS_V3":
            v = cvss3_base(s.get("score", ""))
            if v is not None:
                return v, "cvss3_vector"
    sev = (entry.get("database_specific") or {}).get("severity")
    if sev in SEVERITY_PROXY:
        return SEVERITY_PROXY[sev], "severity_proxy"
    return None, "unscored"


def main() -> None:
    events: dict[str, dict[str, tuple[str, float | None, str]]] = defaultdict(dict)
    stats = Counter()
    with zipfile.ZipFile(ZIP) as z:
        for n in z.namelist():
            if not n.endswith(".json"):
                continue
            e = json.loads(z.read(n))
            stats["entries"] += 1
            cves = [a for a in e.get("aliases", []) if a.startswith("CVE-")]
            if not cves:
                stats["no_cve_alias_skipped"] += 1
                continue
            cve = min(cves)
            day = e["published"][:10]
            score, src = score_of(e)
            stats[f"score_{src}"] += 1
            for a in e.get("affected", []):
                p = a.get("package", {})
                if p.get("ecosystem") != "Packagist" or not p.get("name"):
                    continue
                name = p["name"].lower()  # Packagist names are case-insensitive
                prev = events[name].get(cve)
                if prev is None or day < prev[0]:
                    events[name][cve] = (day, score, src)
    out = {
        pkg: sorted([[cve, d, s, src] for cve, (d, s, src) in rows.items()], key=lambda r: r[1])
        for pkg, rows in events.items()
    }
    OUT.write_text(json.dumps(out))
    total = sum(len(v) for v in out.values())
    print(dict(stats))
    print(f"packages_with_cves={len(out)} cve_package_events={total}")


if __name__ == "__main__":
    main()
