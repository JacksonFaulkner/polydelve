"""
Walk-forward backtest of a pinned copy of the pre-fb3645f CVE hazard model (see
PINNED below; the live model in features/contract_pricing.py is not used here) on
PyPI, using the OSV bulk export as the event history.

For a sample of PyPI packages and a grid of as-of dates T (every 30 days from
2019-01-01), the model sees only CVEs published on or before T and predicts
P(>=1 new CVE with CVSS >= threshold in (T, T+D]) for D in {30, 90}. The
outcome is whether such a CVE was published in that window.

Baselines (same point-in-time information):
  const  pooled constant-rate Poisson: one rate for all sampled packages,
         estimated from every sampled event published on or before T.
  365d   the model's own 365-day term alone (w90 = 0): same burst damping and
         prior constants as the model, no 90-day blend.

Run from backend/:  .venv/bin/python scripts/backtest/pypi/backtest_pypi.py
Prints markdown tables to stdout and writes metrics.json next to this file.
RESULTS.md is written by hand from that output.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import re
import sys
import urllib.request
import zipfile
from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(BACKEND))

# Pinned to the pre-change production model (prior 0.25/150, damping 0.7, 90d
# blend 0.45) so this script still reproduces RESULTS.md. The live model is in
# features/contract_pricing.py and is now hierarchical; see scripts/backtest/holdout/.
HAZARD_PRIOR_EVENTS = 0.25
HAZARD_PRIOR_DAYS = 150.0
HAZARD_BURST_DAMP = 0.7
HAZARD_W90 = 0.45


def compute_cvss_probability(past, thr, D):
    """Legacy two-window blend. Same formula the published PyPI results were run on."""
    k90 = sum(1 for days, s in past if days <= 90 and eff(s) >= thr)
    k365 = sum(1 for _, s in past if eff(s) >= thr)
    rate90 = (k90 ** HAZARD_BURST_DAMP + HAZARD_PRIOR_EVENTS) / (90.0 + HAZARD_PRIOR_DAYS)
    rate365 = (k365 ** HAZARD_BURST_DAMP + HAZARD_PRIOR_EVENTS) / (365.0 + HAZARD_PRIOR_DAYS)
    rate = HAZARD_W90 * rate90 + (1.0 - HAZARD_W90) * rate365
    return round(1.0 - math.exp(-rate * D), 4)

DATA = Path(__file__).resolve().parent / "data"
OSV_ZIP = DATA / "PyPI_all.zip"
TOP_JSON = DATA / "top_pypi_30d.min.json"
OSV_URL = "https://osv-vulnerabilities.storage.googleapis.com/PyPI/all.zip"
TOP_URL = "https://hugovk.github.io/top-pypi-packages/top-pypi-packages-30-days.min.json"

DURATIONS = (30, 90)
THRESHOLDS = (5.0, 7.0)
UNSCORED_CVSS = 5.0  # same as features.contract_pricing for unscored CVEs
POOL_START = date(2018, 1, 1)
EDGES = [0.0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0001]
P_CLIP = 1e-6
N_BOOT = 500
TIER_KEYS = {
    "top 1-100": "top_100",
    "rank 101-1,000 (sample 100)": "rank_101_1000",
    "rank 1,001-10,000 (sample 100)": "rank_1001_10000",
}


def norm(name: str) -> str:
    """PEP 503 name normalization."""
    return re.sub(r"[-_.]+", "-", name).lower()


def ensure(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 1000:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {url}", file=sys.stderr)
    with urllib.request.urlopen(url, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())


def cvss_score(vector: str | None) -> float | None:
    """Same parsing as backend/etl/fetch/cve.py (cvss lib, v3/v4 only)."""
    if not vector:
        return None
    try:
        from cvss import CVSS3, CVSS4

        if vector.startswith("CVSS:4"):
            return float(CVSS4(vector).base_score)
        return float(CVSS3(vector).base_score)
    except Exception:
        return None


def load_events(zip_path: Path) -> tuple[dict[str, list], int]:
    """(name, CVE) -> (earliest published date, cvss). Withdrawn records dropped.
    Only OSV records with a CVE alias count as events."""
    by_key: dict[tuple[str, str], tuple[date, float | None]] = {}
    n_records = 0
    with zipfile.ZipFile(zip_path) as z:
        for member in z.namelist():
            n_records += 1
            v = json.loads(z.read(member))
            if v.get("withdrawn"):
                continue
            cve = next((a for a in v.get("aliases", []) if a.startswith("CVE-")), None)
            pub = v.get("published")
            if not cve or not pub:
                continue
            d = date.fromisoformat(pub[:10])
            vec = next(
                (s.get("score") for s in v.get("severity", [])
                 if s.get("type") in ("CVSS_V3", "CVSS_V2", "CVSS_V4")),
                None,
            )
            score = cvss_score(vec)
            names = {
                norm(a["package"]["name"])
                for a in v.get("affected", [])
                if a.get("package", {}).get("ecosystem") == "PyPI" and a["package"].get("name")
            }
            for name in names:
                key = (name, cve)
                if key not in by_key or d < by_key[key][0]:
                    by_key[key] = (d, score)
    events: dict[str, list] = defaultdict(list)
    for (name, cve), (d, s) in by_key.items():
        events[name].append((d, s, cve))
    for lst in events.values():
        lst.sort(key=lambda e: e[0])
    return events, n_records


def eff(score: float | None) -> float:
    return UNSCORED_CVSS if score is None else score


def load_sample(seed: int) -> list[tuple[str, str]]:
    """(package, tier). Tiers by PyPI 30-day download rank."""
    ranks = [norm(r["project"]) for r in json.loads(TOP_JSON.read_text())["rows"]]
    rng = random.Random(seed)
    tiers = [
        ("top 1-100", ranks[0:100]),
        ("rank 101-1,000 (sample 100)", rng.sample(ranks[100:1000], 100)),
        ("rank 1,001-10,000 (sample 100)", rng.sample(ranks[1000:10000], 100)),
    ]
    out, seen = [], set()
    for label, names in tiers:
        for n in names:
            if n not in seen:
                seen.add(n)
                out.append((n, label))
    return out


def as_of_dates(today: date) -> list[date]:
    out, t = [], date(2019, 1, 1)
    last = today - timedelta(days=max(DURATIONS))
    while t <= last:
        out.append(t)
        t += timedelta(days=30)
    return out


def auc(scores: list[float], ys: list[int]) -> float:
    """Mann-Whitney AUC with average ranks for ties."""
    order = sorted(range(len(scores)), key=lambda i: scores[i])
    ranks = [0.0] * len(scores)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and scores[order[j + 1]] == scores[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    pos = sum(ys)
    neg = len(ys) - pos
    if pos == 0 or neg == 0:
        return float("nan")
    sum_pos = sum(r for r, y in zip(ranks, ys) if y)
    return (sum_pos - pos * (pos + 1) / 2) / (pos * neg)


def logloss(ps: list[float], ys: list[int]) -> float:
    tot = 0.0
    for p, y in zip(ps, ys):
        p = min(max(p, P_CLIP), 1 - P_CLIP)
        tot -= y * math.log(p) + (1 - y) * math.log(1 - p)
    return tot / len(ys)


def brier(ps: list[float], ys: list[int]) -> float:
    return sum((p - y) ** 2 for p, y in zip(ps, ys)) / len(ys)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    ensure(OSV_URL, OSV_ZIP)
    ensure(TOP_URL, TOP_JSON)
    events, n_records = load_events(OSV_ZIP)
    sample = load_sample(args.seed)
    pkgs = [p for p, _ in sample]
    tier_of = dict(sample)
    today = date.today()
    starts = as_of_dates(today)

    # Pooled event dates per threshold for the constant-rate baseline.
    thr_dates = {
        thr: sorted(d for p in pkgs for d, s, _ in events.get(p, []) if eff(s) >= thr)
        for thr in THRESHOLDS
    }

    # rows[(D, thr)] -> list of (pkg, tier, T, p_model, p_const, p_365, y, k365)
    rows: dict[tuple[int, float], list] = defaultdict(list)
    for T in starts:
        expo_days = (T - POOL_START).days * len(pkgs)
        lam_const = {thr: bisect_right(thr_dates[thr], T) / expo_days for thr in THRESHOLDS}
        for pkg in pkgs:
            evs = events.get(pkg, [])
            dates = [e[0] for e in evs]
            cut = bisect_right(dates, T)
            past = [((T - d).days, s) for d, s, _ in evs[:cut] if (T - d).days <= 365]
            future = evs[cut:]
            for thr in THRESHOLDS:
                k365 = sum(1 for _, s in past if eff(s) >= thr)
                rate365 = (k365 ** HAZARD_BURST_DAMP + HAZARD_PRIOR_EVENTS) / (365.0 + HAZARD_PRIOR_DAYS)
                for D in DURATIONS:
                    p_model = compute_cvss_probability(past, thr, D)
                    p_const = 1.0 - math.exp(-lam_const[thr] * D)
                    p_365 = 1.0 - math.exp(-rate365 * D)
                    end = T + timedelta(days=D)
                    y = int(any(T < d <= end and eff(s) >= thr for d, s, _ in future))
                    rows[(D, thr)].append((pkg, tier_of[pkg], T, p_model, p_const, p_365, y, k365))

    # ── report ────────────────────────────────────────────────────────────
    n_pkg_events = sum(1 for p in pkgs if events.get(p))
    n_events_sample = sum(len(events.get(p, [])) for p in pkgs)
    print("## Data")
    print(f"- OSV PyPI records scanned: {n_records:,}; CVE-named (name, CVE) events: "
          f"{sum(len(v) for v in events.values()):,} across {len(events):,} packages")
    print(f"- Sample: {len(pkgs)} packages ({n_pkg_events} with >=1 CVE event, "
          f"{n_events_sample} events in sample)")
    print(f"- As-of dates: {len(starts)} (every 30d, {starts[0]} to {starts[-1]}); "
          f"data snapshot {today}")
    print(f"- Predictions: {len(rows[(30, 5.0)]):,} per (D, threshold) cell\n")

    summary = []
    out: dict = {"cells": [], "calibration": {}}
    for (D, thr), rs in sorted(rows.items()):
        ys = [r[6] for r in rs]
        pm = [r[3] for r in rs]
        pc = [r[4] for r in rs]
        p3 = [r[5] for r in rs]
        n = len(rs)
        base = sum(ys) / n
        b_m, b_c, b_3 = brier(pm, ys), brier(pc, ys), brier(p3, ys)
        ll_m, ll_c, ll_3 = logloss(pm, ys), logloss(pc, ys), logloss(p3, ys)
        a_m, a_c, a_3 = auc(pm, ys), auc(pc, ys), auc(p3, ys)

        # ECE + calibration bins for the model
        bins = []
        for lo, hi in zip(EDGES, EDGES[1:]):
            idx = [i for i, p in enumerate(pm) if lo <= p < hi]
            if idx:
                bins.append((lo, hi, len(idx), sum(pm[i] for i in idx) / len(idx),
                             sum(ys[i] for i in idx) / len(idx)))
        ece = sum(nb / n * abs(mp - mo) for _, _, nb, mp, mo in bins)

        # Package-cluster bootstrap of Brier differences
        by_pkg: dict[str, list[int]] = defaultdict(list)
        for i, r in enumerate(rs):
            by_pkg[r[0]].append(i)
        pk = list(by_pkg)
        sums = {}
        for p in pk:
            idx = by_pkg[p]
            sums[p] = (
                len(idx),
                sum((pm[i] - ys[i]) ** 2 for i in idx),
                sum((pc[i] - ys[i]) ** 2 for i in idx),
                sum((p3[i] - ys[i]) ** 2 for i in idx),
            )
        rng = random.Random(11)
        d_c, d_3 = [], []
        for _ in range(N_BOOT):
            draw = [rng.choice(pk) for _ in pk]
            cnt = sum(sums[p][0] for p in draw)
            sm = sum(sums[p][1] for p in draw) / cnt
            sc = sum(sums[p][2] for p in draw) / cnt
            s3 = sum(sums[p][3] for p in draw) / cnt
            d_c.append(sm - sc)
            d_3.append(sm - s3)
        d_c.sort()
        d_3.sort()
        ci = lambda xs: (xs[int(0.025 * N_BOOT)], xs[int(0.975 * N_BOOT)])  # noqa: E731

        summary.append(dict(D=D, thr=thr, n=n, base=base))
        print(f"### {D}-day window, CVSS >= {thr:g}\n")
        print(f"n = {n:,} predictions, events = {sum(ys):,} (base rate {base:.2%})\n")
        print("| metric | model | constant pooled | 365d-only |")
        print("|---|---|---|---|")
        print(f"| mean prediction | {sum(pm)/n:.2%} | {sum(pc)/n:.2%} | {sum(p3)/n:.2%} |")
        print(f"| Brier | {b_m:.5f} | {b_c:.5f} | {b_3:.5f} |")
        print(f"| Brier skill vs constant | {1-b_m/b_c:+.3f} | - | {1-b_3/b_c:+.3f} |")
        print(f"| log loss | {ll_m:.4f} | {ll_c:.4f} | {ll_3:.4f} |")
        print(f"| ranking AUC | {a_m:.3f} | {a_c:.3f} | {a_3:.3f} |")
        lo_c, hi_c = ci(d_c)
        lo_3, hi_3 = ci(d_3)
        cell = f"{D}d_cvss>={thr:g}"
        out["cells"].append({
            "window_days": D,
            "cvss_min": thr,
            "events": sum(ys),
            "base_rate": base,
            "brier_model": b_m,
            "brier_const": b_c,
            "brier_365d": b_3,
            "auc_model": a_m,
            "mean_pred_model": sum(pm) / n,
            "observed": base,
            "ece_model": ece,
            "ci_model_minus_const": [lo_c, hi_c],
            "ci_model_minus_365d": [lo_3, hi_3],
        })
        out["calibration"][cell] = [
            {"predicted_mean": mp, "observed": mo, "n": nb} for lo, hi, nb, mp, mo in bins
        ]
        print(f"| Brier diff model minus baseline (95% CI, package bootstrap) | - | "
              f"{b_m-b_c:+.5f} [{lo_c:+.5f}, {hi_c:+.5f}] | {b_m-b_3:+.5f} [{lo_3:+.5f}, {hi_3:+.5f}] |")
        print(f"\nModel ECE {ece:.4f}\n")
        print("| model predicted | n | mean pred | observed |")
        print("|---|---|---|---|")
        for lo, hi, nb, mp, mo in bins:
            print(f"| {lo:.2%}–{min(hi,1):.2%} | {nb:,} | {mp:.2%} | {mo:.2%} |")
        print()

    print("### Model Brier skill vs constant baseline, by popularity tier\n")
    tier_skill: dict[str, dict[str, float]] = {}
    tiers = sorted({r[1] for rs in rows.values() for r in rs})
    print("| tier | " + " | ".join(f"{D}d CVSS>={thr:g}" for D, thr in sorted(rows)) + " |")
    print("|---|" + "---|" * len(rows))
    for tier in tiers:
        cells = []
        for key in sorted(rows):
            D, thr = key
            rs = [r for r in rows[key] if r[1] == tier]
            ys = [r[6] for r in rs]
            if not ys:
                cells.append("-")
                continue
            bm = brier([r[3] for r in rs], ys)
            bc = brier([r[4] for r in rs], ys)
            cells.append(f"{1-bm/bc:+.3f} (n={len(rs):,}, ev={sum(ys)})" if bc > 0 else "-")
            if bc > 0:
                tier_skill.setdefault(TIER_KEYS[tier], {})[f"{D}d_cvss>={thr:g}"] = 1 - bm / bc
        print(f"| {tier} | " + " | ".join(cells) + " |")

    out["model"] = "cve_hazard_poisson_blend (pinned pre-fb3645f copy in this script, w90=0.45, burst damp 0.7)"
    out["tier_skill"] = {k: tier_skill.get(k, {}) for k in TIER_KEYS.values()}
    out["sample"] = {
        "packages": len(pkgs),
        "packages_with_events": n_pkg_events,
        "events_in_sample": n_events_sample,
        "tiers": {"top_100": 100, "rank_101_1000": 100, "rank_1001_10000": 100},
        "seed": args.seed,
    }
    out["date_range"] = {
        "as_of_first": str(starts[0]),
        "as_of_last": str(starts[-1]),
        "as_of_dates": len(starts),
        "data_snapshot": str(today),
    }
    out["sources"] = [
        OSV_URL,
        TOP_URL,
        "https://arxiv.org/pdf/1202.5140",
        "https://arxiv.org/pdf/2108.03210",
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC7923594",
    ]
    out["caveats"] = [
        "Event definition: OSV records with a CVE alias only; production ETL ingests all OSV records.",
        "Look-ahead: single OSV snapshot; late-added advisories appear in history at their published date.",
        "Survivorship/selection: packages chosen by current download rank.",
        "Constant baseline is an expanding pooled average that lags advisory-volume trend.",
        "Dependence: overlapping as-of windows and shared dates; CIs likely too narrow.",
        "Scope: PyPI only; MAL/EPSS/NO legs untested.",
        "CVSS>=7 relies on v3/v4 vectors; v2-only records use 5.0.",
    ]
    (Path(__file__).resolve().parent / "metrics.json").write_text(json.dumps(out, indent=2) + "\n")


if __name__ == "__main__":
    main()
