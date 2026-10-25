#!/usr/bin/env python3
"""Counting-unit test for the CVE hazard: what should k be?

Hypotheses about disclosure bursts:
  H_damp: a burst is one discovery event; count distinct disclosure units.
  H_snow: disclosures snowball; raw counts (or recent counts) carry signal.

Candidates (same eco rate, m = 730, same zero-history factor q on k == 0):
  shipped     k = raw CVEs >= thr in 365d,          d = 0.5
  raw_d1      k = raw CVEs >= thr in 365d,          d = 1.0
  days_d05    k = distinct disclosure days >= thr,  d = 0.5
  days_d1     k = distinct disclosure days >= thr,  d = 1.0
  weeks_d05   k = distinct ISO weeks >= thr,        d = 0.5
  weeks_d1    k = distinct ISO weeks >= thr,        d = 1.0

The eco rate is the shared raw-event rate from eval_hier.eco_rates for every
candidate, so the candidates differ only in the unit inside k ** d.

Protocol: fit = as-of T with T + 90d <= 2023-12-31. Per ecosystem, pick the
candidate with minimum fit log loss (mean over the four cells). Holdout =
T >= 2024-01-01, scored for every candidate. Pooled = rows from all three
ecosystems, per cell, then averaged over cells.

Usage (from backend/):
    .venv/bin/python scripts/backtest/snowball/bursts/burst_units.py
"""

from __future__ import annotations

import json
import sys
from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
BT = HERE.parents[1]  # backend/scripts/backtest
HOLD = BT / "holdout"
OUT = HERE / "results.json"

sys.path.insert(0, str(HOLD))
import eval_hier as eh  # noqa: E402  (eco_rates, p_hier, summary, brier_diff, fairness)
import eval_model as em  # noqa: E402  (loaders, cells, as_of, FIT_LAST_LABEL, HOLDOUT_START)

M = 730.0
Q = 0.6903605711054143
DURATIONS = em.DURATIONS
THRESHOLDS = em.THRESHOLDS
FIT_LAST_LABEL = em.FIT_LAST_LABEL
HOLDOUT_START = em.HOLDOUT_START

# name, unit, exponent
CANDS = [
    ("shipped", "raw", 0.5),
    ("raw_d1", "raw", 1.0),
    ("days_d05", "days", 0.5),
    ("days_d1", "days", 1.0),
    ("weeks_d05", "weeks", 0.5),
    ("weeks_d1", "weeks", 1.0),
]


def unit_count(hits, unit):
    """hits: list of (date, cvss) already filtered to the window and threshold."""
    if unit == "raw":
        return len(hits)
    if unit == "days":
        return len({d for d, _ in hits})
    if unit == "weeks":
        return len({d.isocalendar()[:2] for d, _ in hits})
    raise ValueError(unit)


def build(events, starts):
    """rows[(cand_idx, D, thr)] -> list of (T, pkg_key, p, y, quiet)."""
    rows = defaultdict(list)
    for T in starts:
        lam = eh.eco_rates(events, T)
        for pkg, evs in events.items():
            cut = bisect_right([d for d, _ in evs], T)
            window = [(d, s) for d, s in evs[:cut] if (T - d).days <= 365]
            future = evs[cut:]
            for thr in THRESHOLDS:
                hits = [(d, s) for d, s in window if s >= thr]
                for ci, (_, unit, dmp) in enumerate(CANDS):
                    k = unit_count(hits, unit)
                    for D in DURATIONS:
                        end = T + timedelta(days=D)
                        y = int(any(T < d <= end and s >= thr for d, s in future))
                        p = eh.p_hier(k, lam[thr], D, M, dmp, Q)
                        rows[(ci, D, thr)].append((T, pkg, p, y, k == 0))
    return rows


def cell_key(D, thr):
    return f"{D}d_cvss>={int(thr)}"


def mean_cells(per):
    """Average metric across cells."""
    keys = ("brier", "logloss", "ece", "auc", "bias_ratio")
    return {k: sum(v[k] for v in per.values()) / len(per) for k in keys}


def main():
    print("loading data ...")
    ecos = {"pypi": em.load_pypi(), "npm": em.load_npm(), "composer": em.load_composer()}
    starts = em.as_of()
    fit_starts = [t for t in starts if t + timedelta(days=max(DURATIONS)) <= FIT_LAST_LABEL]
    hold_starts = [t for t in starts if t >= HOLDOUT_START]
    print(f"fit as-of: {fit_starts[0]} .. {fit_starts[-1]} ({len(fit_starts)} dates)")
    print(f"holdout as-of: {hold_starts[0]} .. {hold_starts[-1]} ({len(hold_starts)} dates)")

    fit_lo, fit_hi = date.min, date.max
    hold_lo, hold_hi = HOLDOUT_START, date.max

    # ── fit: per-ecosystem selection by fit log loss ─────────────────────────
    chosen = {}
    fit_scores = {}
    for name, ev in ecos.items():
        rows = build(ev, fit_starts)
        scores = {}
        for ci, (cname, _, _) in enumerate(CANDS):
            per = {cell_key(D, t): eh.summary(rows[(ci, D, t)], fit_lo, fit_hi)
                   for D, t in em.cells()}
            scores[cname] = {"fit_logloss": mean_cells(per)["logloss"],
                             "fit_bias": mean_cells(per)["bias_ratio"]}
        fit_scores[name] = scores
        best = min(CANDS, key=lambda c: scores[c[0]]["fit_logloss"])[0]
        chosen[name] = best
        print(f"fit {name:<9} chosen={best:<10} " + "  ".join(
            f"{c}:{scores[c]['fit_logloss']:.5f}" for c, _, _ in CANDS))

    # ── holdout: all candidates, per ecosystem and pooled ────────────────────
    hold = {}
    for name, ev in ecos.items():
        hold[name] = build(ev, hold_starts)

    names = [c[0] for c in CANDS]
    report = {
        "protocol": {
            "fit": f"as-of {fit_starts[0]} .. {fit_starts[-1]}, labels end by {FIT_LAST_LABEL}",
            "holdout": f"as-of {HOLDOUT_START} .. {hold_starts[-1]}",
            "m_days": M,
            "quiet_factor_q": Q,
            "candidates": [{"name": n, "unit": u, "exponent": d} for n, u, d in CANDS],
            "selection": "per ecosystem, min fit log loss (mean over 4 cells)",
            "pooling": "rows concatenated across ecosystems per cell; metrics averaged over cells",
            "fit_scores": fit_scores,
            "chosen": chosen,
        },
        "holdout_per_eco": {},
        "holdout_pooled": {},
        "brier_chosen_vs_shipped": {},
    }

    # per-ecosystem holdout metrics
    for name in ecos:
        block = {}
        for ci, cname in enumerate(names):
            per = {}
            for D, t in em.cells():
                per[cell_key(D, t)] = eh.summary(hold[name][(ci, D, t)], hold_lo, hold_hi)
            block[cname] = {"per_cell": per, "mean": mean_cells(per)}
        report["holdout_per_eco"][name] = block

    # pooled holdout metrics: concatenate ecosystems, prefix pkg to keep clusters distinct
    pooled_rows = {}
    for ci in range(len(CANDS)):
        for D, t in em.cells():
            rs = []
            for name in ecos:
                rs += [(T, f"{name}:{pkg}", p, y, q) for T, pkg, p, y, q in hold[name][(ci, D, t)]]
            pooled_rows[(ci, D, t)] = rs

    for ci, cname in enumerate(names):
        per = {cell_key(D, t): eh.summary(pooled_rows[(ci, D, t)], hold_lo, hold_hi)
               for D, t in em.cells()}
        report["holdout_pooled"][cname] = {"per_cell": per, "mean": mean_cells(per)}

    # Brier(chosen) - Brier(shipped): per ecosystem and pooled, per cell, package-clustered
    shipped_i = names.index("shipped")
    for name in list(ecos) + ["pooled"]:
        if name == "pooled":
            # pooled chosen = candidate minimizing pooled fit logloss across ecosystems
            pooled_fit = {c[0]: sum(fit_scores[e][c[0]]["fit_logloss"] for e in ecos) / len(ecos)
                          for c in CANDS}
            chosen_name = min(pooled_fit, key=pooled_fit.get)
            ci_ch = names.index(chosen_name)
            block = {"chosen": chosen_name, "cells": {}}
            for D, t in em.cells():
                d_, lo_, hi_ = eh.brier_diff(pooled_rows[(ci_ch, D, t)],
                                             pooled_rows[(shipped_i, D, t)], hold_lo, hold_hi)
                block["cells"][cell_key(D, t)] = {"diff": d_, "ci95": [lo_, hi_]}
            report["brier_chosen_vs_shipped"][name] = block
            continue
        ci_ch = names.index(chosen[name])
        block = {"chosen": chosen[name], "cells": {}}
        for D, t in em.cells():
            d_, lo_, hi_ = eh.brier_diff(hold[name][(ci_ch, D, t)],
                                         hold[name][(shipped_i, D, t)], hold_lo, hold_hi)
            block["cells"][cell_key(D, t)] = {"diff": d_, "ci95": [lo_, hi_]}
        report["brier_chosen_vs_shipped"][name] = block

    OUT.write_text(json.dumps(report, indent=2))

    # ── printing ─────────────────────────────────────────────────────────────
    print("\nholdout, pooled over ecosystems (mean over 4 cells). bias = mean_pred / base")
    print(f"{'candidate':<12}{'unit':<8}{'d':>5}{'brier':>11}{'logloss':>11}{'auc':>8}{'bias':>8}")
    for cname, unit, dmp in CANDS:
        m = report["holdout_pooled"][cname]["mean"]
        print(f"{cname:<12}{unit:<8}{dmp:>5}{m['brier']:>11.6f}{m['logloss']:>11.6f}"
              f"{m['auc']:>8.3f}{m['bias_ratio']:>8.3f}")

    print("\nholdout per ecosystem (mean over cells): brier / logloss / bias")
    for name in ecos:
        print(f"  {name}")
        for cname, unit, dmp in CANDS:
            m = report["holdout_per_eco"][name][cname]["mean"]
            print(f"    {cname:<12}{m['brier']:.6f}  {m['logloss']:.6f}  {m['bias_ratio']:.3f}")

    print("\nBrier(chosen) - Brier(shipped), package-clustered 95% CI (negative = chosen better)")
    for name, block in report["brier_chosen_vs_shipped"].items():
        for cell, d in block["cells"].items():
            print(f"  {name:<9}{cell:<16}{block['chosen']:<11}{d['diff']:+.6f} "
                  f"[{d['ci95'][0]:+.6f}, {d['ci95'][1]:+.6f}]")

    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
