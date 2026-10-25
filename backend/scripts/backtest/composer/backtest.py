"""
Walk-forward backtest of the CVE hazard pricing on Packagist (Composer).

For every sampled package and every as-of date T (30-day grid, 2019-01-01 on),
price P(>=1 CVE with cvss >= thr published in (T, T+D]) using ONLY CVEs
published on or before T, then score against what actually happened.

Models compared (same D, thr, packages, and dates for all of them):
  model     production pricing: features.contract_pricing.compute_cvss_probability
            (own-history rate shrunk toward an ecosystem rate, burst damping,
            quiet factor), fixed constants, not refit. The ecosystem rate is
            recomputed at each as-of T from events dated <= T.
  poi365    same model with eco_rate=0 (no ecosystem prior), own 365-day history
  const     constant base rate: pooled outcome rate over windows whose outcome
            was already fully observed by T (expanding window, no leakage)

Metrics: Brier, log loss, ROC AUC (ranking), reliability bins, and a
package-clustered bootstrap CI on the Brier difference model - baseline.
Constants in features.contract_pricing were tuned on npm/PyPI (see
scripts/backtest_pricing.py), so this is a transfer test, not in-sample.

Run: python3 -I backtest.py  (reads data/sample.json and data/cve_events.json)
"""
from __future__ import annotations

import json
import math
import random
import sys
from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[2]  # backend/
sys.path.insert(0, str(BACKEND))

from features.contract_pricing import (  # noqa: E402  (reuse production model)
    UNSCORED_CVSS,
    compute_cvss_probability,
)

DATA = HERE / "data"
DURATIONS = (30, 90)
THRESHOLDS = (5.0, 7.0)
GRID_START = date(2019, 1, 1)
DATA_END = date(2026, 10, 22)  # snapshot date of the OSV export pull
STEP_DAYS = 30
BOOT = 2000
EPS = 1e-6


# ── data ─────────────────────────────────────────────────────────────────────

def load() -> tuple[list[dict], dict[str, list[tuple[date, float]]]]:
    sample = json.loads((DATA / "sample.json").read_text())["rows"]
    raw = json.loads((DATA / "cve_events.json").read_text())
    events: dict[str, list[tuple[date, float]]] = {}
    for r in sample:
        name = r["name"]
        ev = []
        for cve, day, score, _src in raw.get(name, []):
            s = UNSCORED_CVSS if score is None else score
            ev.append((date.fromisoformat(day), s))
        ev.sort()
        events[name] = ev
    return sample, events


# ── ecosystem rate ───────────────────────────────────────────────────────────

def load_all_events() -> dict[str, list[tuple[date, float]]]:
    """Every package with an OSV CVE, not just the sample. The ecosystem rate needs
    the same population as its denominator (the whole catalog)."""
    raw = json.loads((DATA / "cve_events.json").read_text())
    return {
        name: sorted((date.fromisoformat(day), UNSCORED_CVSS if score is None else score)
                     for _cve, day, score, _src in rows)
        for name, rows in raw.items()
    }


def catalog_size() -> int:
    """Packagist catalog size: the denominator production uses (all packages)."""
    return len(json.loads((DATA / "list.json").read_text())["packageNames"])


def eco_rate_at(events: dict[str, list[tuple[date, float]]], T: date, thr: float, catalog_n: int) -> float:
    """Per package-day rate of qualifying CVEs across the catalog, from events dated <= T
    within the last 365 days. Using only events <= T keeps the as-of prediction leak-free."""
    n = sum(1 for ev in events.values() for d, s in ev
            if d <= T and (T - d).days <= 365 and s >= thr)
    return n / (catalog_n * 365.0)


# ── metrics ──────────────────────────────────────────────────────────────────

def clip(p: float) -> float:
    return min(max(p, EPS), 1 - EPS)


def brier(ps, ys) -> float:
    return sum((p - y) ** 2 for p, y in zip(ps, ys)) / len(ys)


def logloss(ps, ys) -> float:
    return -sum(y * math.log(clip(p)) + (1 - y) * math.log(1 - clip(p)) for p, y in zip(ps, ys)) / len(ys)


def auc(ps, ys) -> float | None:
    """Mann-Whitney AUC with average ranks for ties."""
    pos = sum(ys)
    neg = len(ys) - pos
    if pos == 0 or neg == 0:
        return None
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    ranks = [0.0] * len(ps)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and ps[order[j + 1]] == ps[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    rank_pos = sum(r for r, y in zip(ranks, ys) if y == 1)
    return (rank_pos - pos * (pos + 1) / 2) / (pos * neg)


EDGES = [0.0, 0.01, 0.02, 0.05, 0.10, 0.20, 0.35, 0.50, 1.0001]


def calibration(ps, ys) -> list[tuple[str, int, float, float]]:
    rows = []
    for lo, hi in zip(EDGES, EDGES[1:]):
        idx = [i for i, p in enumerate(ps) if lo <= p < hi]
        if not idx:
            continue
        mp = sum(ps[i] for i in idx) / len(idx)
        mo = sum(ys[i] for i in idx) / len(idx)
        rows.append((f"{lo:.2f}-{min(hi, 1):.2f}", len(idx), mp, mo))
    return rows


# ── walk-forward ─────────────────────────────────────────────────────────────

def as_of_dates() -> list[date]:
    out, t = [], GRID_START
    while t + timedelta(days=max(DURATIONS)) <= DATA_END:
        out.append(t)
        t += timedelta(days=STEP_DAYS)
    return out


def run() -> dict:
    sample, events = load()
    created = {r["name"]: date.fromisoformat(r["created"]) for r in sample}
    tier = {r["name"]: r["tier"] for r in sample}
    grid = as_of_dates()
    catalog_n = catalog_size()
    eco_events = load_all_events()

    # rows[(D, thr)] -> list of dicts, one per (T, package)
    rows: dict[tuple[int, float], list[dict]] = defaultdict(list)
    # outcome store for the expanding constant base rate: (D, thr) -> {T: (n_pkgs, n_events)}
    per_T: dict[tuple[int, float], dict[date, tuple[int, int]]] = defaultdict(dict)

    for T in grid:
        for D in DURATIONS:
            end = T + timedelta(days=D)
            for thr in THRESHOLDS:
                eco = eco_rate_at(eco_events, T, thr, catalog_n)
                n_pkg = n_ev = 0
                for name, ev in events.items():
                    if created[name] > T:
                        continue
                    dates = [d for d, _ in ev]
                    cut = bisect_right(dates, T)
                    past = [((T - d).days, s) for d, s in ev[:cut]]
                    hit = int(any(T < d <= end and s >= thr for d, s in ev[cut:]))
                    n_pkg += 1
                    n_ev += hit
                    rows[(D, thr)].append({
                        "T": T, "pkg": name, "tier": tier[name], "y": hit,
                        "model": compute_cvss_probability(past, thr, D, eco),
                        "poi365": compute_cvss_probability(past, thr, D, 0.0),
                        "k365": sum(1 for g, s in past if g <= 365 and s >= thr),
                    })
                per_T[(D, thr)][T] = (n_pkg, n_ev)

    # constant base rate per window: pooled outcome rate of windows fully observed by T
    results = {}
    for (D, thr), R in rows.items():
        # Outcome of window started at T' is known at T'+D; the pooled hazard
        # per package-day is events / (pkgs * D) over all windows known by T.
        known = sorted(per_T[(D, thr)].items())
        for r in R:
            hist = [(n, e) for t, (n, e) in known if t + timedelta(days=D) <= r["T"]]
            if not hist:
                r["const"] = None
                continue
            n_sum = sum(n for n, _ in hist)
            e_sum = sum(e for _, e in hist)
            # already a window probability (share of package-windows with an event)
            r["const"] = e_sum / n_sum
        results[(D, thr)] = [r for r in R if r["const"] is not None]
    return {"grid_n": len(grid), "rows": results, "sample_n": len(sample)}


def summarize(res: dict) -> dict:
    out = {}
    rng = random.Random(11)
    for (D, thr), R in sorted(res["rows"].items()):
        ys = [r["y"] for r in R]
        n = len(ys)
        ev = sum(ys)
        base_rate = ev / n
        P = {
            "model": [r["model"] for r in R],
            "const": [r["const"] for r in R],
            "poi365": [r["poi365"] for r in R],
        }
        score = {k: {"brier": brier(v, ys), "logloss": logloss(v, ys), "auc": auc(v, ys)}
                 for k, v in P.items()}
        # package-clustered bootstrap on Brier difference
        by_pkg: dict[str, list[int]] = defaultdict(list)
        for i, r in enumerate(R):
            by_pkg[r["pkg"]].append(i)
        pkgs = list(by_pkg)
        diffs = {"const": [], "poi365": []}
        for _ in range(BOOT):
            draw = [rng.choice(pkgs) for _ in pkgs]
            idx = [i for p in draw for i in by_pkg[p]]
            ysb = [ys[i] for i in idx]
            mb = brier([P["model"][i] for i in idx], ysb)
            for k in diffs:
                diffs[k].append(mb - brier([P[k][i] for i in idx], ysb))
        ci = {}
        for k, v in diffs.items():
            v.sort()
            ci[k] = (v[int(0.025 * BOOT)], v[int(0.975 * BOOT)])
        # calibration + tiers for the model
        cal = calibration(P["model"], ys)
        tiers = {}
        for t in ("top", "mid", "tail"):
            idx = [i for i, r in enumerate(R) if r["tier"] == t]
            if idx:
                tiers[t] = (len(idx), sum(ys[i] for i in idx),
                            sum(P["model"][i] for i in idx) / len(idx))
        hist_tiers = {}
        for lo, hi, lab in [(0, 0, "0 CVEs/365d"), (1, 3, "1-3"), (4, 10**9, "4+")]:
            idx = [i for i, r in enumerate(R) if lo <= r["k365"] <= hi]
            if idx:
                hist_tiers[lab] = (len(idx), sum(ys[i] for i in idx),
                                   sum(P["model"][i] for i in idx) / len(idx))
        out[f"D{D}_thr{thr:g}"] = {
            "D": D, "thr": thr, "n": n, "events": ev, "base_rate": base_rate,
            "score": score, "boot_ci_brier_model_minus": ci,
            "calibration": cal, "tiers": tiers, "history": hist_tiers,
            "packages_with_any_event": sum(1 for p in pkgs if any(ys[i] for i in by_pkg[p])),
        }
    return out


def report(summary: dict, res: dict) -> None:
    print(f"sample packages={res['sample_n']}  as-of dates={res['grid_n']} "
          f"(every {STEP_DAYS}d from {GRID_START}, last T {as_of_dates()[-1]})")
    for key, s in summary.items():
        print(f"\n=== {key}  n={s['n']:,}  events={s['events']}  base={s['base_rate']:.2%}  "
              f"pkgs w/ event={s['packages_with_any_event']}")
        for k in ("model", "const", "poi365"):
            m = s["score"][k]
            auc_s = f"{m['auc']:.3f}" if m["auc"] is not None else "n/a"
            print(f"  {k:<7} brier {m['brier']:.5f}  logloss {m['logloss']:.5f}  auc {auc_s}")
        for k, (lo, hi) in s["boot_ci_brier_model_minus"].items():
            print(f"  brier(model) - brier({k}) 95% CI [{lo:+.5f}, {hi:+.5f}]  "
                  f"({'model better' if hi < 0 else 'model worse' if lo > 0 else 'not distinguishable'})")
        print("  calibration (model):  bin          n     mean_pred  observed")
        for lab, n, mp, mo in s["calibration"]:
            print(f"                        {lab:<11}{n:>6}   {mp:8.2%}   {mo:8.2%}")
        print("  by tier:", {t: f"n={v[0]} ev={v[1]} pred={v[2]:.2%}" for t, v in s["tiers"].items()})
        print("  by history:", {t: f"n={v[0]} ev={v[1]} pred={v[2]:.2%}" for t, v in s["history"].items()})


def build_metrics(res: dict, summary: dict) -> dict:
    """Machine-readable copy of RESULTS.md, same keys as backtest/pypi/metrics.json."""
    cells, calibration, tier_skill = [], {}, {}
    sample, _ = load()
    for (D, thr), R in sorted(res["rows"].items()):
        key = f"{D}d_cvss>={thr:g}"
        s = summary[f"D{D}_thr{thr:g}"]
        ys = [r["y"] for r in R]
        pm = [r["model"] for r in R]
        pc = [r["const"] for r in R]
        n = len(ys)
        bins = s["calibration"]
        ece = sum(cnt / n * abs(mp - mo) for _, cnt, mp, mo in bins)
        cells.append({
            "window_days": D,
            "cvss_min": thr,
            "events": s["events"],
            "base_rate": s["base_rate"],
            "brier_model": s["score"]["model"]["brier"],
            "brier_const": s["score"]["const"]["brier"],
            "brier_365d": s["score"]["poi365"]["brier"],
            "auc_model": s["score"]["model"]["auc"],
            "mean_pred_model": sum(pm) / n,
            "observed": sum(ys) / n,
            "ece_model": ece,
            "ci_model_minus_const": list(s["boot_ci_brier_model_minus"]["const"]),
            "ci_model_minus_365d": list(s["boot_ci_brier_model_minus"]["poi365"]),
        })
        calibration[key] = [
            {"predicted_mean": mp, "observed": mo, "n": cnt} for _, cnt, mp, mo in bins
        ]
        for t in ("top", "mid", "tail"):
            idx = [i for i, r in enumerate(R) if r["tier"] == t]
            if not idx:
                continue
            yt = [ys[i] for i in idx]
            b_m = brier([pm[i] for i in idx], yt)
            b_c = brier([pc[i] for i in idx], yt)
            tier_skill.setdefault(t, {})[key] = (1 - b_m / b_c) if b_c > 0 else None
    pkgs_with_cve = sum(1 for r in sample if r["name"] in json.loads((DATA / "cve_events.json").read_text()))
    raw = json.loads((DATA / "cve_events.json").read_text())
    events_in_sample = sum(len(raw.get(r["name"], [])) for r in sample)
    as_of = sorted({r["T"] for R in res["rows"].values() for r in R})
    return {
        "model": "cve_hazard eco-shrink (features/contract_pricing.py, prior 730d, burst damp 0.5, quiet factor), eco_rate per as-of from events <= T, fixed constants, not refit",
        "cells": cells,
        "calibration": calibration,
        "tier_skill": tier_skill,
        "sample": {
            "packages": len(sample),
            "packages_with_any_osv_cve": pkgs_with_cve,
            "cve_events_in_sample_all_history": events_in_sample,
            "tiers": {t: sum(1 for r in sample if r["tier"] == t) for t in ("top", "mid", "tail")},
            "tier_definition": {"top": "popularity rank 1-500", "mid": "rank 501-5000", "tail": "uniform from catalog outside top 5000"},
            "seed": 7,
        },
        "date_range": {
            "as_of_first": as_of[0].isoformat(),
            "as_of_last": as_of[-1].isoformat(),
            "as_of_dates": len(as_of),
            "data_snapshot": DATA_END.isoformat(),
        },
        "sources": [
            "https://osv-vulnerabilities.storage.googleapis.com/Packagist/all.zip",
            "https://osv-vulnerabilities.storage.googleapis.com/ecosystems.txt",
            "https://packagist.org/explore/popular.json",
            "https://packagist.org/packages/list.json",
            "https://packagist.org/packages/{name}.json",
            "https://docs.github.com/en/enterprise-server@3.16/code-security/concepts/vulnerability-reporting-and-management/github-advisory-database",
        ],
        "caveats": [
            "Only 14 of 175 sampled packages have any OSV CVE; 33-86 events per cell from 10-13 packages. Not statistically strong.",
            "Model constants were tuned on npm/PyPI; this is a transfer test, not refit.",
            "Popularity ranks use current Packagist download counts (look-ahead).",
            "OSV Packagist is GHSA-based; CVEs outside GitHub advisories are missed, especially pre-2021.",
            "CVSS: v3 vector computed; else severity proxy; else unscored=5.0. Threshold results are approximate.",
            "Overlapping 30-day as-of windows with 90-day outcomes; bootstrap is package-clustered.",
            "Zero-history prior overpredicts quiet packages ~10-20x (2.2% vs 0.12% at 30d; 6.4% vs 0.35% at 90d).",
        ],
    }


if __name__ == "__main__":
    res = run()
    summary = summarize(res)
    report(summary, res)
    (DATA / "backtest_results.json").write_text(json.dumps(summary, indent=1, default=str))
    (HERE / "metrics.json").write_text(json.dumps(build_metrics(res, summary), indent=1))
