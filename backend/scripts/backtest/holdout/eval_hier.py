#!/usr/bin/env python3
"""Hierarchical (Gamma-Poisson) CVE hazard: shrink each package toward its
ecosystem's trailing rate instead of a fixed prior.

Model (per package i, as-of T, threshold t):
  k_i      = CVEs >= t for package i in the 365 days before T
  lam_eco  = ecosystem rate per package-day >= t over the 365 days before T
             (pooled over the sampled packages; uses events before T only)
  lam_i    = (m * lam_eco + k_i ** d) / (m + 365)     # posterior mean rate
  P(>=1 in D days) = 1 - exp(-lam_i * D)

m is the prior strength in pseudo-days; d < 1 is the burst damping kept from
the production model. There are no per-ecosystem constants: the prior level
comes from each ecosystem's own trailing data, so it tracks trends
(the quiet rate on PyPI roughly tripled between the fit and holdout periods).

Protocol: fit (m, d) on PyPI as-of dates with label windows ending by 2023-12-31,
minimizing fit log loss subject to calibration within +/-10% pooled and for the
quiet bucket (k_i = 0). Then transfer, unchanged, to npm and Composer holdouts.
The old production model is the baseline on every split.

Usage (from backend/):
    .venv/bin/python scripts/backtest/holdout/eval_hier.py
"""

from __future__ import annotations

import itertools
import json
import math
import sys
from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import eval_model as em  # noqa: E402  (loaders, metrics, CURRENT, paired bootstrap)

FIT_LAST_LABEL = em.FIT_LAST_LABEL
HOLDOUT_START = em.HOLDOUT_START
DURATIONS = em.DURATIONS
THRESHOLDS = em.THRESHOLDS
BIAS_TOL = em.BIAS_TOL
OUT = HERE / "results_hier.json"

M_GRID = (1.0, 7.0, 30.0, 90.0, 180.0, 365.0, 730.0, 1460.0, 3650.0)
D_GRID = (0.5, 0.7, 1.0)


def eco_rates(events, T):
    """lam_eco per threshold: events >= t in the 365 days before T, per package-day."""
    out = {}
    n = len(events)
    for t in THRESHOLDS:
        hits = 0
        for evs in events.values():
            hits += sum(1 for d, s in evs if s >= t and 0 < (T - d).days <= 365)
        out[t] = hits / (n * 365.0) if n else 0.0
    return out


def lam_hier(k, lam_eco, m, d, q=1.0):
    """Posterior mean daily rate. q scales the zero-history (k = 0) rate only."""
    lam = (m * lam_eco + k ** d) / (m + 365.0)
    return lam * q if k == 0 else lam


def p_hier(k, lam_eco, D, m, d, q=1.0):
    lam = lam_hier(k, lam_eco, m, d, q)
    return round(min(max(1.0 - math.exp(-lam * D), 0.0), 1.0), 4)


def fit_quiet_factor(events, starts, m, d):
    """Zero-history factor q: observed / expected events for k = 0 rows, pooled over
    durations and thresholds, using unrounded expectations. Fit period only."""
    obs = exp = 0.0
    for T in starts:
        lam = eco_rates(events, T)
        for pkg, evs in events.items():
            cut = bisect_right([d_ for d_, _ in evs], T)
            past = [((T - d_).days, s) for d_, s in evs[:cut] if (T - d_).days <= 365]
            future = evs[cut:]
            for thr in THRESHOLDS:
                k = sum(1 for _, s in past if s >= thr)
                if k:
                    continue
                for D in DURATIONS:
                    end = T + timedelta(days=D)
                    obs += any(T < d_ <= end and s >= thr for d_, s in future)
                    exp += 1.0 - math.exp(-lam_hier(0, lam[thr], m, d) * D)
    return obs / exp


def build_hier(events, starts, prm_list):
    """rows[(prm_idx, D, thr)] -> list of (T, pkg, p, y, quiet). prm = (m, damp, q)."""
    rows = defaultdict(list)
    for T in starts:
        lam = eco_rates(events, T)
        for pkg, evs in events.items():
            cut = bisect_right([d for d, _ in evs], T)
            past = [((T - d).days, s) for d, s in evs[:cut] if (T - d).days <= 365]
            future = evs[cut:]
            for thr in THRESHOLDS:
                k = sum(1 for _, s in past if s >= thr)
                for D in DURATIONS:
                    end = T + timedelta(days=D)
                    y = int(any(T < d <= end and s >= thr for d, s in future))
                    for i, (m, dmp, q) in enumerate(prm_list):
                        rows[(i, D, thr)].append((T, pkg, p_hier(k, lam[thr], D, m, dmp, q), y, k == 0))
    return rows


def summary(rs, lo, hi):
    sel = [(p, y) for T, _, p, y, _ in rs if lo <= T <= hi]
    ps, ys = [p for p, _ in sel], [y for _, y in sel]
    base = sum(ys) / len(ys)
    mean = sum(ps) / len(ps)
    return {
        "n": len(sel),
        "events": sum(ys),
        "base_rate": base,
        "mean_pred": mean,
        "bias_ratio": mean / base if base else float("nan"),
        "brier": em.pypi.brier(ps, ys),
        "logloss": em.pypi.logloss(ps, ys),
        "ece": em.ece(ps, ys),
        "auc": em.pypi.auc(ps, ys),
    }


def quiet_bias(rs, lo, hi):
    sel = [(p, y) for T, _, p, y, q in rs if lo <= T <= hi and q]
    if not sel:
        return None
    mp = sum(p for p, _ in sel) / len(sel)
    my = sum(y for _, y in sel) / len(sel)
    return my / mp if mp > 0 else None


def fairness(rs, lo, hi):
    out = {}
    for label, keep in (("quiet", lambda q: q), ("all", lambda q: True)):
        sel = [(p, y) for T, _, p, y, q in rs if lo <= T <= hi and keep(q)]
        if not sel:
            out[label] = None
            continue
        n = len(sel)
        mp = sum(p for p, _ in sel) / n
        my = sum(y for _, y in sel) / n
        out[label] = {
            "n": n,
            "mean_price_yes": mp,
            "observed_yes": my,
            "ev_yes": my / mp - 1 if mp > 0 else None,
            "ev_no": (1 - my) / (1 - mp) - 1 if mp < 1 else None,
        }
    return out


def brier_diff(rs_a, rs_b, lo, hi):
    """Package-clustered bootstrap CI for Brier(A) - Brier(B)."""
    import random

    rng = random.Random(11)
    by_pkg = defaultdict(list)
    for (T, pkg, pa, y, _), (_, _, pb, _, _) in zip(rs_a, rs_b):
        if lo <= T <= hi:
            by_pkg[pkg].append(((pa - y) ** 2, (pb - y) ** 2))
    pkgs = list(by_pkg)
    n = sum(len(v) for v in by_pkg.values())
    point = (sum(a for v in by_pkg.values() for a, _ in v) - sum(b for v in by_pkg.values() for _, b in v)) / n
    diffs = []
    for _ in range(em.N_BOOT):
        sa = sb = sn = 0
        for pkg in (rng.choice(pkgs) for _ in pkgs):
            for a, b in by_pkg[pkg]:
                sa += a
                sb += b
                sn += 1
        diffs.append((sa - sb) / sn)
    diffs.sort()
    return point, diffs[int(0.025 * em.N_BOOT)], diffs[int(0.975 * em.N_BOOT) - 1]


def cell(D, t):
    return f"{D}d_cvss>={int(t)}"


def main():
    print("loading data ...")
    ecos = {"pypi": em.load_pypi(), "npm": em.load_npm(), "composer": em.load_composer()}
    starts = em.as_of()
    fit_starts = [t for t in starts if t + timedelta(days=max(DURATIONS)) <= FIT_LAST_LABEL]
    hold_starts = [t for t in starts if t >= HOLDOUT_START]
    print(f"fit as-of: {fit_starts[0]} .. {fit_starts[-1]} ({len(fit_starts)} dates, purged)")
    print(f"holdout as-of: {hold_starts[0]} .. {hold_starts[-1]} ({len(hold_starts)} dates)")

    grid = [(m, d, 1.0) for m, d in itertools.product(M_GRID, D_GRID)]

    # ── fit on PyPI only ──────────────────────────────────────────────────────
    fit_rows = build_hier(ecos["pypi"], fit_starts, grid)
    fit_lo, fit_hi = date.min, date.max
    scored = []
    for i, (m, dmp, _) in enumerate(grid):
        per = {cell(D, t): summary(fit_rows[(i, D, t)], fit_lo, fit_hi) for D, t in em.cells()}
        qb = {cell(D, t): quiet_bias(fit_rows[(i, D, t)], fit_lo, fit_hi) for D, t in em.cells()}
        worst_pooled = max(abs(s["bias_ratio"] - 1) for s in per.values())
        worst_quiet = max(abs(b - 1) for b in qb.values() if b is not None)
        ll = sum(s["logloss"] for s in per.values()) / len(per)
        scored.append({
            "m": m, "damp": dmp, "fit_logloss": ll,
            "worst_pooled_bias": worst_pooled, "worst_quiet_bias": worst_quiet,
            "per": per, "quiet_bias": qb,
        })

    feasible = [s for s in scored if max(s["worst_pooled_bias"], s["worst_quiet_bias"]) <= BIAS_TOL]
    if feasible:
        chosen = min(feasible, key=lambda s: s["fit_logloss"])
        selection = "min fit logloss, calibration within +/-10% (pooled and quiet)"
    else:
        chosen = min(scored, key=lambda s: max(s["worst_pooled_bias"], s["worst_quiet_bias"]))
        selection = "no feasible set; least-biased set taken"
    print(f"\nselection: {selection}")
    print(f"chosen: m={chosen['m']:g} damp={chosen['damp']}  fit logloss {chosen['fit_logloss']:.6f} "
          f"worst pooled bias {chosen['worst_pooled_bias']:.3f} worst quiet bias {chosen['worst_quiet_bias']:.3f}")
    print("top fit candidates (logloss, pooled bias, quiet bias):")
    for s in sorted(scored, key=lambda s: s["fit_logloss"])[:5]:
        print(f"  m={s['m']:>6g} damp={s['damp']}  ll {s['fit_logloss']:.6f}  "
              f"pooled {s['worst_pooled_bias']:.3f}  quiet {s['worst_quiet_bias']:.3f}")

    # ── holdout: chosen (fit on PyPI) transferred unchanged; current baseline ──
    q = fit_quiet_factor(ecos["pypi"], fit_starts, chosen["m"], chosen["damp"])
    print(f"\nzero-history factor q (fit, PyPI) = {q:.3f}")
    prm = [(chosen["m"], chosen["damp"], 1.0), (chosen["m"], chosen["damp"], q)]
    report = {
        "protocol": {
            "model": "hierarchical Gamma-Poisson, prior = trailing ecosystem rate",
            "fit": f"PyPI, as-of {fit_starts[0]} .. {fit_starts[-1]}, labels end by {FIT_LAST_LABEL}",
            "holdout": f"as-of {HOLDOUT_START} .. {hold_starts[-1]}, all ecosystems, no refit",
            "grid": {"m_days": list(M_GRID), "damp": list(D_GRID)},
            "selection": selection,
            "bias_tolerance": BIAS_TOL,
            "baseline": em.CURRENT,
        },
        "chosen": {"m_days": chosen["m"], "damp": chosen["damp"], "quiet_factor_q": q},
        "fit_scores": [{k: v for k, v in s.items() if k not in ("per", "quiet_bias")} for s in scored],
        "holdout": {},
    }
    for name, ev in ecos.items():
        rows = build_hier(ev, hold_starts, prm)
        cur_rows = em.build(ev, hold_starts, [em.CURRENT])
        block = {}
        for D, t in em.cells():
            c = cell(D, t)
            new = rows[(0, D, t)]
            qnew = rows[(1, D, t)]
            old = [(T, pkg, p, y, p == em.p_cve([], t, D, em.CURRENT)) for T, pkg, p, y in cur_rows[(0, D, t)]]
            pt, lo_ci, hi_ci = brier_diff(new, old, HOLDOUT_START, date.max)
            pq, lq, hq = brier_diff(qnew, old, HOLDOUT_START, date.max)
            pqn, lqn, hqn = brier_diff(qnew, new, HOLDOUT_START, date.max)
            block[c] = {
                "chosen": summary(new, HOLDOUT_START, date.max),
                "chosen_q": summary(qnew, HOLDOUT_START, date.max),
                "current": summary(old, HOLDOUT_START, date.max),
                "brier_diff": {"diff": pt, "ci95": [lo_ci, hi_ci]},
                "brier_diff_q_vs_current": {"diff": pq, "ci95": [lq, hq]},
                "brier_diff_q_vs_chosen": {"diff": pqn, "ci95": [lqn, hqn]},
                "fairness": {
                    "chosen": fairness(new, HOLDOUT_START, date.max),
                    "chosen_q": fairness(qnew, HOLDOUT_START, date.max),
                    "current": fairness(old, HOLDOUT_START, date.max),
                },
            }
        report["holdout"][name] = block

    OUT.write_text(json.dumps(report, indent=2))

    print("\nholdout: chosen (hierarchical, PyPI-fit, no refit) vs current. bias = mean_pred / base")
    print(f"{'eco':<9}{'cell':<16}{'model':<9}{'brier':>10}{'logloss':>10}{'ece':>8}{'auc':>7}{'bias':>7}{'base':>8}")
    for name, block in report["holdout"].items():
        for c, h in block.items():
            for label in ("current", "chosen", "chosen_q"):
                s = h[label]
                print(f"{name:<9}{c:<16}{label:<9}{s['brier']:>10.6f}{s['logloss']:>10.6f}"
                      f"{s['ece']:>8.4f}{s['auc']:>7.3f}{s['bias_ratio']:>7.2f}{s['base_rate']:>8.4f}")
    print("\nBrier differences, package-clustered 95% CI (negative = first model better)")
    for name, block in report["holdout"].items():
        for c, h in block.items():
            for key, label in (("brier_diff", "chosen - current"),
                               ("brier_diff_q_vs_current", "chosen_q - current"),
                               ("brier_diff_q_vs_chosen", "chosen_q - chosen")):
                d = h[key]
                print(f"{name:<9}{c:<16}{label:<22}{d['diff']:+.6f} [{d['ci95'][0]:+.6f}, {d['ci95'][1]:+.6f}]")
    print("\nfairness, holdout: EV per bit at model price (0 = fair), quiet bucket")
    for name, block in report["holdout"].items():
        for c in ("30d_cvss>=5", "90d_cvss>=5"):
            for label in ("current", "chosen", "chosen_q"):
                f = block[c]["fairness"][label]["quiet"]
                if f:
                    print(f"  {name:<9}{c:<13}{label:<8}quiet n={f['n']:<6}"
                          f"price_yes {f['mean_price_yes']:.4f}  observed {f['observed_yes']:.4f}  "
                          f"EV_yes {f['ev_yes']:+.2f}  EV_no {f['ev_no']:+.4f}")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
