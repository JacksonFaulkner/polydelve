#!/usr/bin/env python3
"""Self-excitation test on the PyPI slice: does recent CVE activity predict future
CVEs beyond the shipped 365-day count?

Shipped (cve_hazard, as in eval_hier 'chosen' with m=730, d=0.5, q fixed):
  rate = (m * lam_eco + k365 ** d) / (m + 365),  x q if k365 == 0

Candidates add an excitation term to the daily rate:
  selfexc:    rate += gamma * n30 / 30           (n30 = CVEs >= thr in last 30 days)
  decay(tau): rate += gamma * sum_i exp(-age_i / tau) / tau
              (sum over CVEs >= thr in the last 365 days; kernel integrates to 1,
               so gamma is the branching ratio)

The zero-history factor q applies only when k365 == 0. Since n30 and the decay sum
are built from the same >= thr events inside the 365-day window, k365 == 0 implies
zero excitation, so the q rule is the same for every candidate.

Protocol (as eval_hier): fit on as-of T with T + 90d <= 2023-12-31, gamma chosen by
minimum mean fit log loss over the four cells. Holdout T >= 2024-01-01, scored once,
no refit. Brier diff vs shipped with a package-clustered bootstrap CI.

Usage (from backend/):
    .venv/bin/python scripts/backtest/snowball/pypi/snowball_pypi.py
"""

from __future__ import annotations

import json
import math
import sys
from bisect import bisect_right
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
HOLD = HERE.parents[1] / "holdout"
sys.path.insert(0, str(HOLD))

import eval_hier as eh  # noqa: E402
import eval_model as em  # noqa: E402

OUT = HERE / "results.json"
M = 730.0
D_EXP = 0.5
Q = 0.6903605711054143
GAMMAS = (0.0, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1.0)
TAUS = (7.0, 30.0, 90.0)
CTRL_GRID = (0.0, 1e-5, 3e-5, 1e-4, 3e-4, 1e-3, 3e-3)
FIT_LAST = em.FIT_LAST_LABEL
HOLD_START = em.HOLDOUT_START


def build_features(events, starts):
    """One feature dict per (T, pkg, thr, D), in a fixed order shared by all models."""
    feats = []
    for T in starts:
        lam = eh.eco_rates(events, T)
        for pkg, evs in events.items():
            cut = bisect_right([d for d, _ in evs], T)
            past = [((T - d).days, s) for d, s in evs[:cut]]
            past = [(a, s) for a, s in past if a <= 365]
            future = evs[cut:]
            for thr in em.THRESHOLDS:
                k = sum(1 for a, s in past if s >= thr)
                n30 = sum(1 for a, s in past if a <= 30 and s >= thr)
                dec = {tau: sum(math.exp(-a / tau) / tau for a, s in past if s >= thr) for tau in TAUS}
                for D in em.DURATIONS:
                    end = T + timedelta(days=D)
                    y = int(any(T < d <= end and s >= thr for d, s in future))
                    feats.append({"T": T, "pkg": pkg, "thr": thr, "D": D, "k": k,
                                  "n30": n30, "dec": dec, "lam": lam[thr], "y": y})
    return feats


def excite(f, model):
    fam, g, tau = model
    if fam == "shipped":
        return 0.0
    if fam == "ctrl":  # recency-blind control: flat uplift for any package with k365 > 0
        return g if f["k"] > 0 else 0.0
    if fam == "selfexc":
        return g * f["n30"] / 30.0
    return g * f["dec"][tau]


def prob(f, model):
    base = (M * f["lam"] + f["k"] ** D_EXP) / (M + 365.0)
    e = excite(f, model)
    if f["k"] == 0:
        assert e == 0.0, "excitation must be zero when k365 == 0"
        rate = base * Q
    else:
        rate = base + e
    return round(min(max(1.0 - math.exp(-rate * f["D"]), 0.0), 1.0), 4)


def rows_for(feats, model, D=None, thr=None, lo=None, hi=None):
    out = []
    for f in feats:
        if D is not None and (f["D"] != D or f["thr"] != thr):
            continue
        out.append((f["T"], f["pkg"], prob(f, model), f["y"], f["k"] == 0))
    return out


def fit_score(feats, model):
    """Mean over the four cells of fit log loss (eval_hier's fit_logloss definition)."""
    lls = []
    for D, thr in em.cells():
        rs = rows_for(feats, model, D, thr)
        lls.append(eh.summary(rs, date.min, date.max)["logloss"])
    return sum(lls) / len(lls)


def cell(D, thr):
    return f"{D}d_cvss>={int(thr)}"


def main():
    print("loading data ...")
    events = em.load_pypi()
    starts = em.as_of()
    fit_starts = [t for t in starts if t + timedelta(days=max(em.DURATIONS)) <= FIT_LAST]
    hold_starts = [t for t in starts if t >= HOLD_START]
    print(f"fit as-of: {fit_starts[0]} .. {fit_starts[-1]} ({len(fit_starts)} dates)")
    print(f"holdout as-of: {hold_starts[0]} .. {hold_starts[-1]} ({len(hold_starts)} dates)")

    fit_feats = build_features(events, fit_starts)
    hold_feats = build_features(events, hold_starts)

    # Shipped sanity check: must reproduce eval_hier's chosen model exactly.
    shipped = ("shipped", 0.0, None)
    for f in hold_feats:
        assert prob(f, shipped) == eh.p_hier(f["k"], f["lam"], f["D"], M, D_EXP, Q)

    # ── fit ──────────────────────────────────────────────────────────────────
    fit = {"shipped": {"fit_logloss": fit_score(fit_feats, shipped)}}
    print(f"\nshipped fit logloss {fit['shipped']['fit_logloss']:.6f}")

    selfexc_fit = {}
    for g in GAMMAS:
        selfexc_fit[g] = fit_score(fit_feats, ("selfexc", g, None))
    g_self = min(selfexc_fit, key=selfexc_fit.get)
    print("self-excitation fit (gamma: logloss):",
          "  ".join(f"{g:g}: {v:.6f}" for g, v in selfexc_fit.items()))
    print(f"  chosen gamma = {g_self:g}")

    decay_choice = {}
    for tau in TAUS:
        sc = {g: fit_score(fit_feats, ("decay", g, tau)) for g in GAMMAS}
        g_best = min(sc, key=sc.get)
        decay_choice[tau] = {"gamma": g_best, "fit_logloss": sc[g_best], "grid": sc}
        print(f"decay tau={tau:g} fit (gamma: logloss):",
              "  ".join(f"{g:g}: {v:.6f}" for g, v in sc.items()), f"  -> gamma {g_best:g}")

    candidates = {"selfexc": ("selfexc", g_self, None)}
    for tau in TAUS:
        candidates[f"decay_tau{int(tau)}"] = ("decay", decay_choice[tau]["gamma"], tau)
    fit["selfexc"] = {"gamma": g_self, "fit_logloss": selfexc_fit[g_self], "grid": selfexc_fit}
    for tau in TAUS:
        fit[f"decay_tau{int(tau)}"] = {"gamma": decay_choice[tau]["gamma"],
                                       "fit_logloss": decay_choice[tau]["fit_logloss"],
                                       "grid": decay_choice[tau]["grid"]}

    # Control: same uplift for every package with a CVE in the window, no recency.
    ctrl_sc = {g: fit_score(fit_feats, ("ctrl", g, None)) for g in CTRL_GRID}
    c_best = min(ctrl_sc, key=ctrl_sc.get)
    print("control (flat uplift, k>0) fit (rate: logloss):",
          "  ".join(f"{g:g}: {v:.6f}" for g, v in ctrl_sc.items()), f"  -> {c_best:g}")
    fit["control_flat"] = {"rate": c_best, "fit_logloss": ctrl_sc[c_best], "grid": ctrl_sc}
    candidates["control_flat"] = ("ctrl", c_best, None)

    # ── holdout ──────────────────────────────────────────────────────────────
    all_models = {"shipped": shipped, **candidates}
    holdout = {}
    diffs = {}
    for name, model in all_models.items():
        holdout[name] = {}
        diffs[name] = {}
    for D, thr in em.cells():
        c = cell(D, thr)
        ship_rs = rows_for(hold_feats, shipped, D, thr)
        ship_sum = eh.summary(ship_rs, HOLD_START, date.max)
        for name, model in all_models.items():
            rs = rows_for(hold_feats, model, D, thr)
            s = eh.summary(rs, HOLD_START, date.max)
            s["quiet_bias"] = eh.quiet_bias(rs, HOLD_START, date.max)
            holdout[name][c] = s
            if name == "shipped":
                continue
            pt, lo_ci, hi_ci = eh.brier_diff(rs, ship_rs, HOLD_START, date.max)
            diffs[name][c] = {"diff": pt, "ci95": [lo_ci, hi_ci]}
        assert holdout["shipped"][c]["brier"] == ship_sum["brier"]

    # Direct test of recency: candidate minus the recency-blind control.
    vs_ctrl = {}
    for name in ("selfexc", "decay_tau90"):
        vs_ctrl[name] = {}
        for D, thr in em.cells():
            c = cell(D, thr)
            pt, lo_ci, hi_ci = eh.brier_diff(rows_for(hold_feats, candidates[name], D, thr),
                                             rows_for(hold_feats, candidates["control_flat"], D, thr),
                                             HOLD_START, date.max)
            vs_ctrl[name][c] = {"diff": pt, "ci95": [lo_ci, hi_ci]}

    # ── report ───────────────────────────────────────────────────────────────
    print("\nholdout (PyPI, no refit). bias = mean_pred / base")
    print(f"{'model':<14}{'cell':<16}{'brier':>11}{'logloss':>10}{'bias':>7}{'ece':>8}{'auc':>7}{'events':>8}{'n':>7}")
    for name in all_models:
        for D, thr in em.cells():
            c = cell(D, thr)
            s = holdout[name][c]
            print(f"{name:<14}{c:<16}{s['brier']:>11.6f}{s['logloss']:>10.6f}{s['bias_ratio']:>7.3f}"
                  f"{s['ece']:>8.4f}{s['auc']:>7.3f}{s['events']:>8d}{s['n']:>7d}")

    print("\nBrier(candidate) - Brier(shipped), package-clustered 95% CI (negative = candidate better)")
    for name in candidates:
        for D, thr in em.cells():
            c = cell(D, thr)
            d = diffs[name][c]
            print(f"{name:<14}{c:<16}{d['diff']:+.6f} [{d['ci95'][0]:+.6f}, {d['ci95'][1]:+.6f}]")

    print("\nBrier(candidate) - Brier(control_flat), package-clustered 95% CI")
    for name in vs_ctrl:
        for c, d in vs_ctrl[name].items():
            print(f"{name:<14}{c:<16}{d['diff']:+.6f} [{d['ci95'][0]:+.6f}, {d['ci95'][1]:+.6f}]")

    out = {
        "protocol": {
            "fit": f"PyPI, as-of {fit_starts[0]} .. {fit_starts[-1]}, labels end by {FIT_LAST}",
            "holdout": f"as-of {HOLD_START} .. {hold_starts[-1]}, no refit",
            "shipped": {"m": M, "damp": D_EXP, "q": Q},
            "gamma_grid": list(GAMMAS),
            "tau_grid": list(TAUS),
            "selection": "gamma (and tau) by min mean fit logloss over the four cells",
            "n30_window": "age <= 30 days; excitation window = 365 days (same as k365)",
        },
        "fit": fit,
        "holdout": holdout,
        "brier_diff_vs_shipped": diffs,
        "brier_diff_vs_control_flat": vs_ctrl,
    }
    OUT.write_text(json.dumps(out, indent=2, default=str))
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
