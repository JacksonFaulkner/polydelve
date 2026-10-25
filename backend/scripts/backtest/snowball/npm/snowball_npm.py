#!/usr/bin/env python3
"""Self-excitation test on the npm slice: does recent CVE activity predict future
CVEs beyond the shipped 365-day count?

Shipped (cve_hazard, as in eval_hier 'chosen' with m=730, d=0.5, q fixed):
  rate = (m * lam_eco + k365 ** d) / (m + 365),  x q if k365 == 0

Candidates add an excitation term to the daily rate:
  lin:        rate += gamma * n30 / 30           (n30 = CVEs >= thr in last 30 days)
  exp(tau):   rate += gamma * sum_i exp(-age_i / tau) / tau
              (sum over CVEs >= thr in the last 365 days; the kernel integrates to 1,
               so gamma is the branching ratio)

The zero-history factor q applies only when k365 == 0. n30 and the decay sum are built
from the same >= thr events inside the 365-day window, so k365 == 0 implies zero
excitation and the q rule is identical for every candidate.

Protocol (as eval_hier): gamma (and tau) chosen by minimum mean fit log loss over the
four cells on npm as-of T with T + 90d <= 2023-12-31. Holdout T >= 2024-01-01, scored
once, no refit. Brier diff vs shipped with a package-clustered bootstrap CI.
Transfer check: gamma chosen on the PyPI fit period, applied unchanged to npm holdout.

Usage (from backend/):
    .venv/bin/python scripts/backtest/snowball/npm/snowball_npm.py
"""

from __future__ import annotations

import json
import math
import sys
from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOLD = HERE.parents[1] / "holdout"
sys.path.insert(0, str(HOLD))

import eval_hier as eh  # noqa: E402
import eval_model as em  # noqa: E402

M, DAMP, Q = 730.0, 0.5, 0.6903605711054143
DURATIONS = em.DURATIONS
THRESHOLDS = em.THRESHOLDS
FIT_LAST = em.FIT_LAST_LABEL
HOLDOUT_START = em.HOLDOUT_START
LIN_GRID = (0.0, 0.01, 0.03, 0.1, 0.3, 1.0)
EXP_TAUS = (7.0, 30.0, 90.0)
OUT = HERE / "results.json"

# spec = (kind, gamma, tau). Index 0 is the shipped model expressed as gamma = 0.
SPECS = [("lin", 0.0, None)]
SPECS += [("lin", g, None) for g in LIN_GRID[1:]]
SPECS += [("exp", g, tau) for tau in EXP_TAUS for g in LIN_GRID[1:]]


def label(spec):
    kind, g, tau = spec
    if kind == "lin":
        return f"lin g={g:g}" if g else "shipped"
    return f"exp tau={tau:g} g={g:g}"


def build(events, starts, specs=SPECS):
    """rows[(i, D, thr)] -> [(T, pkg, p, y, quiet)], identical ordering for every spec.
    flags[(D, thr)] -> [n30] aligned with the rows, for the recent-activity diagnostic."""
    rows = defaultdict(list)
    flags = defaultdict(list)
    for T in starts:
        lam = eh.eco_rates(events, T)
        for pkg, evs in events.items():
            cut = bisect_right([d for d, _ in evs], T)
            past = [((T - d).days, s) for d, s in evs[:cut] if (T - d).days <= 365]
            future = evs[cut:]
            for thr in THRESHOLDS:
                ages = [a for a, s in past if s >= thr]
                k = len(ages)
                n30 = sum(1 for a in ages if a <= 30)
                base = eh.lam_hier(k, lam[thr], M, DAMP, Q)
                for D in DURATIONS:
                    end = T + timedelta(days=D)
                    y = int(any(T < d <= end and s >= thr for d, s in future))
                    flags[(D, thr)].append(n30)
                    for i, (kind, g, tau) in enumerate(specs):
                        if kind == "lin":
                            add = g * n30 / 30.0
                        else:
                            add = g * sum(math.exp(-a / tau) / tau for a in ages)
                        lam_c = base + add
                        p = round(min(max(1.0 - math.exp(-lam_c * D), 0.0), 1.0), 4)
                        rows[(i, D, thr)].append((T, pkg, p, y, k == 0))
    return rows, flags


def fit_scores(rows, idxs, starts_lo=date.min, starts_hi=date.max):
    out = {}
    for i in idxs:
        per = {eh.cell(D, t): eh.summary(rows[(i, D, t)], starts_lo, starts_hi) for D, t in em.cells()}
        out[i] = {
            "label": label(SPECS[i]),
            "fit_logloss": sum(s["logloss"] for s in per.values()) / len(per),
            "worst_pooled_bias": max(abs(s["bias_ratio"] - 1) for s in per.values()),
            "per": per,
        }
    return out


def select(scores):
    lin = [i for i, s in enumerate(SPECS) if s[0] == "lin"]
    exp_ = [i for i, s in enumerate(SPECS) if s[0] == "exp"]
    best_lin = min(lin, key=lambda i: scores[i]["fit_logloss"])
    best_exp = min(exp_, key=lambda i: scores[i]["fit_logloss"])
    best_exp_tau = {}
    for tau in EXP_TAUS:
        idx = [i for i in exp_ if SPECS[i][2] == tau]
        best_exp_tau[f"{tau:g}"] = min(idx, key=lambda i: scores[i]["fit_logloss"])
    return {"lin": best_lin, "exp": best_exp, "exp_per_tau": best_exp_tau}


def main():
    print("loading data ...")
    npm = em.load_npm()
    pypi = em.load_pypi()
    starts = em.as_of()
    fit_starts = [t for t in starts if t + timedelta(days=max(DURATIONS)) <= FIT_LAST]
    hold_starts = [t for t in starts if t >= HOLDOUT_START]
    print(f"npm fit as-of: {fit_starts[0]} .. {fit_starts[-1]} ({len(fit_starts)} dates)")
    print(f"npm holdout as-of: {hold_starts[0]} .. {hold_starts[-1]} ({len(hold_starts)} dates)")
    print(f"npm packages: {len(npm)}, pypi packages: {len(pypi)}")

    all_idx = list(range(len(SPECS)))

    # shipped sanity check: spec 0 must reproduce eh.p_hier exactly
    ship_fit_eh = eh.build_hier(npm, fit_starts, [(M, DAMP, Q)])
    fit_npm, _ = build(npm, fit_starts)
    for D, t in em.cells():
        a = [p for _, _, p, _, _ in ship_fit_eh[(0, D, t)]]
        b = [p for _, _, p, _, _ in fit_npm[(0, D, t)]]
        assert a == b, "spec 0 does not reproduce eh.p_hier"
    print("shipped check: spec 0 reproduces eh.p_hier on npm fit rows")

    # ── fit: npm-fit and pypi-fit ─────────────────────────────────────────────
    fit_pypi, _ = build(pypi, fit_starts)
    sc_npm = fit_scores(fit_npm, all_idx)
    sc_pypi = fit_scores(fit_pypi, all_idx)
    sel_npm = select(sc_npm)
    sel_pypi = select(sc_pypi)

    print("\nfit log loss (mean over 4 cells); npm fit | pypi fit")
    for i in all_idx:
        print(f"  {label(SPECS[i]):<22} {sc_npm[i]['fit_logloss']:.6f} "
              f"(bias {sc_npm[i]['worst_pooled_bias']:.3f}) | "
              f"{sc_pypi[i]['fit_logloss']:.6f} (bias {sc_pypi[i]['worst_pooled_bias']:.3f})")
    for src, sel in (("npm-fit", sel_npm), ("pypi-fit", sel_pypi)):
        print(f"{src} chosen: lin {label(SPECS[sel['lin']])}; exp {label(SPECS[sel['exp']])}")
        for tau, i in sel["exp_per_tau"].items():
            print(f"    best exp tau={tau}: {label(SPECS[i])}")

    # ── holdout (npm), transfer of each chosen spec, unchanged ────────────────
    hold, flags = build(npm, hold_starts)
    ship_hold_eh = eh.build_hier(npm, hold_starts, [(M, DAMP, Q)])
    for D, t in em.cells():
        assert [p for _, _, p, _, _ in ship_hold_eh[(0, D, t)]] == \
               [p for _, _, p, _, _ in hold[(0, D, t)]], "holdout shipped mismatch"

    cands = {
        "npm-fit lin": sel_npm["lin"],
        "pypi-fit lin": sel_pypi["lin"],
        "npm-fit exp": sel_npm["exp"],
        "pypi-fit exp": sel_pypi["exp"],
    }
    holdout = {}
    for name, i in cands.items():
        block = {"spec": label(SPECS[i]), "cells": {}}
        for D, t in em.cells():
            c = eh.cell(D, t)
            cand_rows = hold[(i, D, t)]
            ship_rows = hold[(0, D, t)]
            pt, lo, hi = eh.brier_diff(cand_rows, ship_rows, HOLDOUT_START, date.max)
            block["cells"][c] = {
                "candidate": eh.summary(cand_rows, HOLDOUT_START, date.max),
                "shipped": eh.summary(ship_rows, HOLDOUT_START, date.max),
                "quiet_bias_candidate": eh.quiet_bias(cand_rows, HOLDOUT_START, date.max),
                "quiet_bias_shipped": eh.quiet_bias(ship_rows, HOLDOUT_START, date.max),
                "brier_diff_cand_minus_shipped": {"diff": pt, "ci95": [lo, hi]},
            }
        holdout[name] = block

    # point-estimate sensitivity over the whole npm gamma/tau grid (no bootstrap)
    grid_pts = {}
    for i in all_idx[1:]:
        per = {}
        for D, t in em.cells():
            pt, _, _ = eh.brier_diff(hold[(i, D, t)], hold[(0, D, t)], HOLDOUT_START, date.max)
            per[eh.cell(D, t)] = pt
        grid_pts[label(SPECS[i])] = per

    # recent-activity diagnostic: holdout rows with n30 > 0 (any threshold/duration)
    recent = {}
    for D, t in em.cells():
        c = eh.cell(D, t)
        fl = flags[(D, t)]
        idx = [j for j, n in enumerate(fl) if n > 0 and hold[(0, D, t)][j][0] >= HOLDOUT_START]
        if not idx:
            recent[c] = None
            continue
        ys = [hold[(0, D, t)][j][3] for j in idx]
        ps_ship = [hold[(0, D, t)][j][2] for j in idx]
        out = {"n": len(idx), "observed": sum(ys) / len(ys),
               "shipped_pred": sum(ps_ship) / len(ps_ship)}
        for name, i in cands.items():
            ps = [hold[(i, D, t)][j][2] for j in idx]
            out[f"{name}_pred"] = sum(ps) / len(ps)
        recent[c] = out

    report = {
        "protocol": {
            "shipped": {"m_days": M, "damp": DAMP, "q": Q},
            "fit_npm": f"as-of {fit_starts[0]} .. {fit_starts[-1]}, labels end by {FIT_LAST}",
            "fit_pypi": f"as-of {fit_starts[0]} .. {fit_starts[-1]}, labels end by {FIT_LAST}",
            "holdout": f"npm, as-of {HOLDOUT_START} .. {hold_starts[-1]}, no refit",
            "lin_grid": list(LIN_GRID),
            "exp_taus": list(EXP_TAUS),
            "selection": "min mean fit logloss over 4 cells (no calibration constraint)",
            "excitation_window": "CVEs >= thr in the 365 days before T (same as k365)",
        },
        "fit_scores_npm": {label(SPECS[i]): {k: v for k, v in sc_npm[i].items() if k != "per"}
                           for i in all_idx},
        "fit_scores_pypi": {label(SPECS[i]): {k: v for k, v in sc_pypi[i].items() if k != "per"}
                            for i in all_idx},
        "chosen": {
            src: {"lin": label(SPECS[s["lin"]]), "exp": label(SPECS[s["exp"]]),
                  "exp_per_tau": {tau: label(SPECS[i]) for tau, i in s["exp_per_tau"].items()}}
            for src, s in (("npm-fit", sel_npm), ("pypi-fit", sel_pypi))
        },
        "holdout": holdout,
        "holdout_grid_brier_diff_point": grid_pts,
        "recent_activity_n30_gt0": recent,
    }
    OUT.write_text(json.dumps(report, indent=2))

    print("\nnpm holdout: brier, logloss, bias (mean_pred/base), quiet bias")
    print(f"{'model':<14}{'cell':<16}{'brier':>11}{'logloss':>10}{'bias':>7}{'quietb':>8}")
    for name in ["shipped"] + list(cands):
        for c in holdout[next(iter(cands))]["cells"]:
            if name == "shipped":
                s = holdout[next(iter(cands))]["cells"][c]["shipped"]
                qb = holdout[next(iter(cands))]["cells"][c]["quiet_bias_shipped"]
                tag = "shipped"
            else:
                s = holdout[name]["cells"][c]["candidate"]
                qb = holdout[name]["cells"][c]["quiet_bias_candidate"]
                tag = name
            qs = f"{qb:.2f}" if qb is not None else "n/a"
            print(f"{tag:<14}{c:<16}{s['brier']:>11.6f}{s['logloss']:>10.6f}{s['bias_ratio']:>7.2f}{qs:>8}")

    print("\nBrier(candidate) - Brier(shipped), package-clustered 95% CI (negative = candidate better)")
    for name, block in holdout.items():
        for c, h in block["cells"].items():
            d = h["brier_diff_cand_minus_shipped"]
            print(f"  {name:<13}{block['spec']:<22}{c:<16}{d['diff']:+.6f} [{d['ci95'][0]:+.6f}, {d['ci95'][1]:+.6f}]")

    print("\nholdout point-estimate Brier diff over gamma/tau grid (candidate - shipped)")
    for lab, per in grid_pts.items():
        print(f"  {lab:<22}" + "  ".join(f"{v:+.6f}" for v in per.values()))

    print("\nrecent activity: holdout rows with n30 > 0 (observed vs predicted mean)")
    for c, r in recent.items():
        if r:
            print(f"  {c:<16} n={r['n']:<6} observed {r['observed']:.4f}  shipped {r['shipped_pred']:.4f}  "
                  f"npm-lin {r['npm-fit lin_pred']:.4f}  pypi-lin {r['pypi-fit lin_pred']:.4f}")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
