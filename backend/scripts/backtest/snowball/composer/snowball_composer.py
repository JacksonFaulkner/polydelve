#!/usr/bin/env python3
"""Self-excitation test on the Composer (Packagist) slice.

Hypothesis (user's guess): a disclosure raises the chance of further disclosures
soon after, so recent CVEs predict future CVEs beyond the 365-day count. The
shipped model treats bursts as one discovery event and damps them (d = 0.5).

Candidates, all scored on the same protocol as eval_hier.py (Composer rows):
  shipped  : eh.p_hier with m=730, d=0.5, q=0.6903605711054143
  n30      : rate = shipped_rate + gamma * n30 / 30
             n30 = CVEs >= thr with age <= 30 days before T
  exp      : rate = shipped_rate + gamma * sum_{past CVEs >= thr} exp(-age/tau) / tau
             tau in {7, 30, 90}; sum runs over all past CVEs (no 365-day cut)
q is applied only when k365 == 0 AND n30 == 0 (the quiet bucket, same for all).

Protocol: gamma (and tau) chosen by minimum mean fit log loss over the four
cells, fit as-of dates with T + 90d <= 2023-12-31. Holdout as-of dates
T >= 2024-01-01, scored once, no refit.

Usage (from backend/):
    .venv/bin/python scripts/backtest/snowball/composer/snowball_composer.py
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
sys.path.insert(0, str(HERE.parents[1] / "holdout"))

import eval_hier as eh  # noqa: E402
import eval_model as em  # noqa: E402

M = 730.0
D_SHIP = 0.5
Q = 0.6903605711054143
GAMMAS = (0.0, 0.01, 0.03, 0.1, 0.3, 1.0)
TAUS = (7.0, 30.0, 90.0)
SCALES = (0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0)
OUT = HERE / "results.json"


def build(events, starts):
    """recs[(D, thr)] -> list of dict records, one per (T, pkg). Uses only events dated <= T."""
    recs = defaultdict(list)
    for T in starts:
        lam = eh.eco_rates(events, T)
        for pkg, evs in events.items():
            cut = bisect_right([d for d, _ in evs], T)
            past = [((T - d).days, s) for d, s in evs[:cut]]
            future = evs[cut:]
            for thr in eh.THRESHOLDS:
                k365 = sum(1 for a, s in past if a <= 365 and s >= thr)
                n30 = sum(1 for a, s in past if a <= 30 and s >= thr)
                kern = {tau: sum(math.exp(-a / tau) / tau for a, s in past if s >= thr) for tau in TAUS}
                for D in eh.DURATIONS:
                    end = T + timedelta(days=D)
                    y = int(any(T < d <= end and s >= thr for d, s in future))
                    recs[(D, thr)].append({"T": T, "pkg": pkg, "y": y, "k365": k365,
                                           "n30": n30, "kern": kern, "lam": lam[thr]})
    return recs


def p_from_lam(lam, D):
    return round(min(max(1.0 - math.exp(-lam * D), 0.0), 1.0), 4)


def p_shipped(r, D):
    return eh.p_hier(r["k365"], r["lam"], D, M, D_SHIP, Q)


def p_scale(r, D, s):
    """Level control: shipped rate times s, no timing information."""
    base = (M * r["lam"] + r["k365"] ** D_SHIP) / (M + 365.0)
    if r["k365"] == 0:
        base *= Q
    return p_from_lam(base * s, D)


def p_excite(r, D, gamma, tau=None):
    base = (M * r["lam"] + r["k365"] ** D_SHIP) / (M + 365.0)
    if r["k365"] == 0 and r["n30"] == 0:
        base *= Q
    add = gamma * r["n30"] / 30.0 if tau is None else gamma * r["kern"][tau]
    return p_from_lam(base + add, D)


def score_rows(recs, pfun):
    """rows[(D, thr)] -> list of (T, pkg, p, y, quiet) in record order."""
    out = {}
    for cell, rs in recs.items():
        D, _ = cell
        out[cell] = [(r["T"], r["pkg"], pfun(r, D), r["y"], r["k365"] == 0) for r in rs]
    return out


def fit_logloss(rows_by_cell):
    return sum(eh.summary(rs, date.min, date.max)["logloss"] for rs in rows_by_cell.values()) / len(rows_by_cell)


def cell_name(D, thr):
    return eh.cell(D, thr)


def main():
    print("loading composer ...")
    events = em.load_composer()
    starts = em.as_of()
    fit_starts = [t for t in starts if t + timedelta(days=max(eh.DURATIONS)) <= em.FIT_LAST_LABEL]
    hold_starts = [t for t in starts if t >= em.HOLDOUT_START]
    print(f"fit as-of: {fit_starts[0]} .. {fit_starts[-1]} ({len(fit_starts)} dates)")
    print(f"holdout as-of: {hold_starts[0]} .. {hold_starts[-1]} ({len(hold_starts)} dates)")

    # ── event counts ─────────────────────────────────────────────────────────
    counts = {}
    for label, lo, hi in (("fit", date.min, em.FIT_LAST_LABEL), ("holdout", em.HOLDOUT_START, date.max)):
        for thr in eh.THRESHOLDS:
            evs_in = [(d, s) for evs in events.values() for d, s in evs if lo <= d <= hi and s >= thr]
            pk = {pkg for pkg, evs in events.items() for d, s in evs if lo <= d <= hi and s >= thr}
            counts[f"{label}_events_cvss>={int(thr)}"] = {"events": len(evs_in), "packages": len(pk)}
    print("\nCVE events in window (dated, cvss >= thr):")
    for k, v in counts.items():
        print(f"  {k:<26} events {v['events']:>4}  packages {v['packages']:>3}")

    fit_recs = build(events, fit_starts)
    hold_recs = build(events, hold_starts)

    # ── fit: choose gamma (and tau) by minimum fit log loss ──────────────────
    ship_fit = score_rows(fit_recs, p_shipped)
    ship_fit_ll = fit_logloss(ship_fit)
    # Sanity: gamma=0 must reproduce the shipped model exactly.
    g0 = score_rows(fit_recs, lambda r, D: p_excite(r, D, 0.0))
    max_dev = max(abs(a[2] - b[2]) for c in ship_fit for a, b in zip(ship_fit[c], g0[c]))
    assert max_dev == 0.0, f"gamma=0 does not match shipped (max dev {max_dev})"

    fit_grid = []
    fit_ll = {}
    for g in GAMMAS:
        rows = score_rows(fit_recs, lambda r, D, g=g: p_excite(r, D, g))
        ll = fit_logloss(rows)
        fit_ll[("n30", None, g)] = ll
        fit_grid.append({"model": "n30", "tau": None, "gamma": g, "fit_logloss": ll})
    for tau in TAUS:
        for g in GAMMAS:
            rows = score_rows(fit_recs, lambda r, D, g=g, tau=tau: p_excite(r, D, g, tau))
            ll = fit_logloss(rows)
            fit_ll[("exp", tau, g)] = ll
            fit_grid.append({"model": "exp", "tau": tau, "gamma": g, "fit_logloss": ll})

    print(f"\nfit mean logloss, shipped: {ship_fit_ll:.6f}")
    print("fit mean logloss, n30 model by gamma:")
    for g in GAMMAS:
        print(f"  gamma={g:<5g} {fit_ll[('n30', None, g)]:.6f}")
    print("fit mean logloss, exp model by tau x gamma:")
    for tau in TAUS:
        print("  tau=%-4g " % tau + "  ".join(f"g={g:g}:{fit_ll[('exp', tau, g)]:.6f}" for g in GAMMAS))

    g_n30 = min(GAMMAS, key=lambda g: fit_ll[("n30", None, g)])
    best_by_tau = {tau: min(GAMMAS, key=lambda g: fit_ll[("exp", tau, g)]) for tau in TAUS}
    best_tau = min(TAUS, key=lambda t: fit_ll[("exp", t, best_by_tau[t])])
    print(f"\nselected n30 gamma = {g_n30:g}")
    print("selected exp gamma by tau: " + ", ".join(f"tau={t:g}: {best_by_tau[t]:g}" for t in TAUS))
    print(f"best exp tau (fit) = {best_tau:g} gamma = {best_by_tau[best_tau]:g}")

    scale_ll = {s: fit_logloss(score_rows(fit_recs, lambda r, D, s=s: p_scale(r, D, s))) for s in SCALES}
    s_ctrl = min(SCALES, key=lambda s: scale_ll[s])
    print("level control, fit mean logloss by scale: "
          + "  ".join(f"{s:g}:{scale_ll[s]:.6f}" for s in SCALES) + f"  -> scale {s_ctrl:g}")

    # ── holdout ──────────────────────────────────────────────────────────────
    models = {
        "shipped": lambda r, D: p_shipped(r, D),
        f"level ctrl x{s_ctrl:g}": lambda r, D: p_scale(r, D, s_ctrl),
        f"n30 g={g_n30:g}": lambda r, D: p_excite(r, D, g_n30),
    }
    for tau in TAUS:
        models[f"exp tau={tau:g} g={best_by_tau[tau]:g}"] = (
            lambda r, D, tau=tau, g=best_by_tau[tau]: p_excite(r, D, g, tau))
    hold_rows = {name: score_rows(hold_recs, f) for name, f in models.items()}
    ship_name = "shipped"
    ctrl_name = f"level ctrl x{s_ctrl:g}"

    holdout = {}
    print("\nholdout (as-of >= 2024-01-01). bias = mean_pred / base")
    print(f"{'model':<24}{'cell':<16}{'brier':>10}{'logloss':>10}{'bias':>7}{'base':>8}{'events':>8}")
    for name, rows in hold_rows.items():
        holdout[name] = {}
        for cell in rows:
            D, thr = cell
            c = cell_name(D, thr)
            s = eh.summary(rows[cell], em.HOLDOUT_START, date.max)
            qb = eh.quiet_bias(rows[cell], em.HOLDOUT_START, date.max)
            entry = {"summary": s, "quiet_bias": qb}
            if name != ship_name:
                pt, lo_ci, hi_ci = eh.brier_diff(rows[cell], hold_rows[ship_name][cell],
                                                 em.HOLDOUT_START, date.max)
                entry["brier_diff_vs_shipped"] = {"diff": pt, "ci95": [lo_ci, hi_ci]}
            if name not in (ship_name, ctrl_name):
                pt, lo_ci, hi_ci = eh.brier_diff(rows[cell], hold_rows[ctrl_name][cell],
                                                 em.HOLDOUT_START, date.max)
                entry["brier_diff_vs_level_ctrl"] = {"diff": pt, "ci95": [lo_ci, hi_ci]}
            holdout[name][c] = entry
            print(f"{name:<24}{c:<16}{s['brier']:>10.6f}{s['logloss']:>10.6f}{s['bias_ratio']:>7.2f}"
                  f"{s['base_rate']:>8.4f}{s['events']:>8}")

    print("\nBrier(candidate) - Brier(shipped), package-clustered 95% CI (negative = candidate better)")
    for name in hold_rows:
        if name == ship_name:
            continue
        for c, e in holdout[name].items():
            d = e["brier_diff_vs_shipped"]
            print(f"{name:<24}{c:<16}{d['diff']:+.6f} [{d['ci95'][0]:+.6f}, {d['ci95'][1]:+.6f}]")
    print("\nBrier(candidate) - Brier(level control), package-clustered 95% CI")
    for name in hold_rows:
        if name in (ship_name, ctrl_name):
            continue
        for c, e in holdout[name].items():
            d = e["brier_diff_vs_level_ctrl"]
            print(f"{name:<24}{c:<16}{d['diff']:+.6f} [{d['ci95'][0]:+.6f}, {d['ci95'][1]:+.6f}]")

    # ── diagnostics: how much data the excitation term actually sees ─────────
    diag = {}
    for label, recs in (("fit", fit_recs), ("holdout", hold_recs)):
        rs = recs[(90, 5.0)]
        ex = [r for r in rs if r["n30"] > 0]
        pos_ex = sum(r["y"] for r in ex)
        ship_mean_ex = (sum(p_shipped(r, 90) for r in ex) / len(ex)) if ex else None
        pos_pkgs = defaultdict(int)
        for r in ex:
            if r["y"]:
                pos_pkgs[r["pkg"]] += 1
        diag[label] = {
            "rows_90d_cvss5": len(rs),
            "rows_with_n30_gt0": len(ex),
            "positives_among_n30_gt0": pos_ex,
            "observed_rate_n30_gt0": (pos_ex / len(ex)) if ex else None,
            "shipped_mean_pred_n30_gt0": ship_mean_ex,
            "distinct_pkgs_with_n30_gt0": len({r["pkg"] for r in ex}),
            "distinct_as_of_with_n30_gt0": len({r["T"] for r in ex}),
            "positive_rows_by_pkg": dict(sorted(pos_pkgs.items(), key=lambda kv: -kv[1])),
        }
    print("\ndiagnostics, 90d cvss>=5, rows where n30 > 0 (the excitation term's only support):")
    for label, d in diag.items():
        obs = d["observed_rate_n30_gt0"]
        pred = d["shipped_mean_pred_n30_gt0"]
        obs_s = f"{obs:.4f}" if obs is not None else "n/a"
        pred_s = f"{pred:.4f}" if pred is not None else "n/a"
        print(f"  {label:<8} rows {d['rows_with_n30_gt0']:>5} of {d['rows_90d_cvss5']:>5}  "
              f"positives {d['positives_among_n30_gt0']:>3}  observed {obs_s}  shipped mean pred {pred_s}  "
              f"pkgs {d['distinct_pkgs_with_n30_gt0']}  as-of dates {d['distinct_as_of_with_n30_gt0']}")

    report = {
        "protocol": {
            "slice": "composer (Packagist), sample of 175 packages",
            "shipped": {"m": M, "damp": D_SHIP, "q": Q},
            "fit": f"as-of {fit_starts[0]} .. {fit_starts[-1]}, labels end by {em.FIT_LAST_LABEL}",
            "holdout": f"as-of {em.HOLDOUT_START} .. {hold_starts[-1]}, no refit",
            "selection": "min mean fit logloss over four cells (gamma; tau x gamma for exp)",
            "n30_window": "age <= 30 days (inclusive), CVEs >= thr",
            "exp_kernel": "sum over all past CVEs >= thr of exp(-age/tau)/tau",
            "q_rule": "q applied iff k365 == 0 and n30 == 0 (identical quiet bucket for all models)",
            "cvss_none_handling": "scored as 5.0 (em.load_composer)",
        },
        "event_counts": counts,
        "fit_grid": fit_grid,
        "selected": {"n30_gamma": g_n30, "exp_gamma_by_tau": {str(t): best_by_tau[t] for t in TAUS},
                     "exp_best_tau": best_tau},
        "diagnostics": diag,
        "holdout": holdout,
    }
    OUT.write_text(json.dumps(report, indent=2))
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
