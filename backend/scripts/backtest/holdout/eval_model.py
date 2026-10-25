#!/usr/bin/env python3
"""Per-ecosystem fit of the CVE hazard parameters on a purged time split, with a
holdout check, a game-fairness check, and the old production constants as baseline.

Why per ecosystem: the zero-history (quiet) rate differs by ecosystem. Observed
30-day quiet rates on the samples are ~0.11% on npm and Composer and ~0.51% on
PyPI. One shared prior cannot price both (the first run's constraint was
infeasible), so each ecosystem's prior is fit on its own data. That is partial
pooling in the empirical-Bayes sense: the family and grid are shared, the prior
level is per ecosystem.

Protocol (per ecosystem):
  - fit:     as-of dates T with T + 90d <= 2023-12-31 (purged: label windows never
             reach the holdout)
  - select:  minimize fit log loss, subject to calibration-in-the-large within
             +/-10% pooled AND for the quiet bucket, in every fit cell
  - holdout: as-of dates T >= 2024-01-01, scored once
  - fairness: expected value per bit at the model's price, quiet bucket and all,
             on the holdout (0 = fair)

Parameters inside the production formula:
  HAZARD_PRIOR_EVENTS (alpha), HAZARD_PRIOR_DAYS (beta),
  HAZARD_BURST_DAMP (d), HAZARD_W90 (w)

Usage (from backend/):
    .venv/bin/python scripts/backtest/holdout/eval_model.py
"""

from __future__ import annotations

import importlib.util
import itertools
import json
import math
import random
from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3]
BT = BACKEND / "scripts" / "backtest"

_spec = importlib.util.spec_from_file_location("backtest_pypi", BT / "pypi" / "backtest_pypi.py")
assert _spec is not None and _spec.loader is not None
pypi = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pypi)

FIT_LAST_LABEL = date(2023, 12, 31)  # purge: label window must end on or before this
HOLDOUT_START = date(2024, 1, 1)
DURATIONS = (30, 90)
THRESHOLDS = (5.0, 7.0)
ECE_BINS = 10
BIAS_TOL = 0.10
N_BOOT = 400
OUT = Path(__file__).resolve().parent / "results_model.json"

# Pre-change production constants, frozen so the baseline is reproducible after
# features/contract_pricing.py moves on: prior 0.25/150, damping 0.7, 90d weight 0.45.
CURRENT = {"alpha": 0.25, "beta": 150.0, "damp": 0.7, "w90": 0.45}

# The grid is wide on purpose: earlier runs put optima on the edges of narrower grids.
GRID = [
    {"alpha": a, "beta": b, "damp": d, "w90": w}
    for a, b, d, w in itertools.product(
        (0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0),
        (1.0, 7.0, 15.0, 30.0, 60.0, 150.0, 365.0, 730.0),
        (0.1, 0.25, 0.5, 0.7, 1.0),
        (0.0, 0.25, 0.45, 0.7, 1.0),
    )
]


# ── loaders: events[pkg] = sorted [(date, cvss)], names = sample ───────────────

def load_pypi():
    pypi.ensure(pypi.OSV_URL, pypi.OSV_ZIP)
    pypi.ensure(pypi.TOP_URL, pypi.TOP_JSON)
    events, _ = pypi.load_events(pypi.OSV_ZIP)
    names = [p for p, _ in pypi.load_sample(7)]
    return {p: [(d, pypi.eff(s)) for d, s, _ in events.get(p, [])] for p in names}


def load_npm():
    data = BT / "npm" / "data"
    ev = defaultdict(list)
    for line in (data / "events.jsonl").read_text().splitlines():
        r = json.loads(line)
        s = 5.0 if r["cvss"] is None else float(r["cvss"])
        ev[r["pkg"]].append((date.fromisoformat(r["pub"]), s))
    names = [r["name"] for r in json.loads((data / "sample.json").read_text())]
    return {p: sorted(ev.get(p, [])) for p in names}


def load_composer():
    data = BT / "composer" / "data"
    rows = json.loads((data / "sample.json").read_text())["rows"]
    raw = json.loads((data / "cve_events.json").read_text())
    out = {}
    for r in rows:
        name = r["name"]
        ev = [(date.fromisoformat(day), 5.0 if score is None else float(score))
              for _, day, score, _ in raw.get(name, [])]
        out[name] = sorted(ev)
    return out


# ── model ──────────────────────────────────────────────────────────────────────

def p_cve(past, thr, D, prm):
    """Production formula with prm substituted. Rounded to 4dp like production."""
    k90 = sum(1 for days, s in past if days <= 90 and s >= thr)
    k365 = sum(1 for _, s in past if s >= thr)
    rate90 = (k90 ** prm["damp"] + prm["alpha"]) / (90.0 + prm["beta"])
    rate365 = (k365 ** prm["damp"] + prm["alpha"]) / (365.0 + prm["beta"])
    rate = prm["w90"] * rate90 + (1.0 - prm["w90"]) * rate365
    return round(min(max(1.0 - math.exp(-rate * D), 0.0), 1.0), 4)


def as_of(start=date(2019, 1, 1), last=date(2026, 7, 23)):
    out, t = [], start
    while t <= last:
        out.append(t)
        t += timedelta(days=30)
    return out


def build(events, starts, prms):
    """rows[(prm_idx, D, thr)] -> list of (T, pkg, p, y)."""
    rows = defaultdict(list)
    for T in starts:
        for pkg, evs in events.items():
            cut = bisect_right([d for d, _ in evs], T)
            past = [((T - d).days, s) for d, s in evs[:cut] if (T - d).days <= 365]
            future = evs[cut:]
            for thr in THRESHOLDS:
                for D in DURATIONS:
                    end = T + timedelta(days=D)
                    y = int(any(T < d <= end and s >= thr for d, s in future))
                    for i, prm in enumerate(prms):
                        rows[(i, D, thr)].append((T, pkg, p_cve(past, thr, D, prm), y))
    return rows


# ── metrics ────────────────────────────────────────────────────────────────────

def ece(ps, ys):
    bins = [[0, 0.0, 0.0] for _ in range(ECE_BINS)]
    for p, y in zip(ps, ys):
        b = min(int(p * ECE_BINS), ECE_BINS - 1)
        bins[b][0] += 1
        bins[b][1] += p
        bins[b][2] += y
    n = len(ps)
    return sum(c / n * abs(sp / c - sy / c) for c, sp, sy in bins if c)


def summarize(rs, lo, hi):
    sel = [(p, y) for T, _, p, y in rs if lo <= T <= hi]
    ps, ys = [p for p, _ in sel], [y for _, y in sel]
    base = sum(ys) / len(ys)
    mean = sum(ps) / len(ps)
    return {
        "n": len(sel),
        "events": sum(ys),
        "base_rate": base,
        "mean_pred": mean,
        "bias_ratio": mean / base if base else float("nan"),
        "brier": pypi.brier(ps, ys),
        "logloss": pypi.logloss(ps, ys),
        "ece": ece(ps, ys),
        "auc": pypi.auc(ps, ys),
    }


def quiet_bias(rs, prm, D, thr):
    """observed / predicted for the quiet bucket (prior-only prediction), or None."""
    quiet_p = p_cve([], thr, D, prm)
    sel = [(p, y) for _, _, p, y in rs if p == quiet_p]
    if not sel:
        return None
    mp = sum(p for p, _ in sel) / len(sel)
    my = sum(y for _, y in sel) / len(sel)
    return my / mp if mp > 0 else None


def fairness(rs, prm, D, thr, lo, hi):
    """EV per bit when buying YES or NO at the model's price, quiet bucket and all rows.
    EV = realized win rate / price - 1, so 0 means fair."""
    quiet_p = p_cve([], thr, D, prm)
    out = {}
    for label, keep in (("quiet", lambda p: p == quiet_p), ("all", lambda p: True)):
        sel = [(p, y) for T, _, p, y in rs if lo <= T <= hi and keep(p)]
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


def paired_brier_diff(rs_a, rs_b, lo, hi, seed=11):
    """Package-clustered bootstrap CI for Brier(A) - Brier(B). Negative: A better."""
    rng = random.Random(seed)
    by_pkg = defaultdict(list)
    for (T, pkg, pa, y), (_, _, pb, _) in zip(rs_a, rs_b):
        if lo <= T <= hi:
            by_pkg[pkg].append(((pa - y) ** 2, (pb - y) ** 2))
    pkgs = list(by_pkg)
    n = sum(len(v) for v in by_pkg.values())
    point = (sum(a for v in by_pkg.values() for a, _ in v) - sum(b for v in by_pkg.values() for _, b in v)) / n
    diffs = []
    for _ in range(N_BOOT):
        sa = sb = sn = 0
        for pkg in (rng.choice(pkgs) for _ in pkgs):
            for a, b in by_pkg[pkg]:
                sa += a
                sb += b
                sn += 1
        diffs.append((sa - sb) / sn)
    diffs.sort()
    return point, diffs[int(0.025 * N_BOOT)], diffs[int(0.975 * N_BOOT) - 1]


def cells():
    return [(D, thr) for D in DURATIONS for thr in THRESHOLDS]


def cell_name(D, thr):
    return f"{D}d_cvss>={int(thr)}"


# ── per-ecosystem fit and holdout ──────────────────────────────────────────────

def quiet_rate_mle(events, fit_starts, D=90, thr=5.0):
    """Poisson MLE of the daily rate for quiet rows (no CVE >= thr in the prior 365d),
    from the fit period only. Solves P(>=1 in D) = 1 - exp(-lambda*D) for lambda."""
    expo = hits = 0
    for T in fit_starts:
        end = T + timedelta(days=D)
        for evs in events.values():
            if any((T - d).days <= 365 and s >= thr for d, s in evs if d <= T):
                continue
            expo += 1
            hits += any(T < d <= end and s >= thr for d, s in evs)
    q = hits / expo
    return -math.log(1.0 - q) / D


def eb_grid(lam):
    """Prior-level-free grid: alpha is set so the quiet rate equals lam exactly,
    alpha = lam / (w/(90+beta) + (1-w)/(365+beta)). Searches beta, damp, w90 only."""
    out = []
    for beta, damp, w90 in itertools.product(
        (1.0, 7.0, 15.0, 30.0, 60.0, 150.0, 365.0, 730.0),
        (0.1, 0.25, 0.5, 0.7, 1.0),
        (0.0, 0.25, 0.45, 0.7, 1.0),
    ):
        alpha = lam / (w90 / (90.0 + beta) + (1.0 - w90) / (365.0 + beta))
        out.append({"alpha": alpha, "beta": beta, "damp": damp, "w90": w90})
    return out


def fit_and_hold(name, events, fit_starts, hold_starts):
    lam = quiet_rate_mle(events, fit_starts)
    print(f"  quiet fit rate: {lam:.3e}/day = {1 - math.exp(-lam * 30):.4%} per 30d")
    prms = eb_grid(lam) + [CURRENT]
    fit_rows = build(events, fit_starts, prms)

    scored = []
    for i, prm in enumerate(prms):
        if prm == CURRENT:
            continue
        per = {cell_name(D, t): summarize(fit_rows[(i, D, t)], date.min, date.max) for D, t in cells()}
        quiet = {cell_name(D, t): quiet_bias(fit_rows[(i, D, t)], prm, D, t) for D, t in cells()}
        worst_pooled = max(abs(s["bias_ratio"] - 1) for s in per.values())
        worst_quiet = max(abs(b - 1) for b in quiet.values() if b is not None)
        mean_ll = sum(s["logloss"] for s in per.values()) / len(per)
        scored.append((prm, mean_ll, max(worst_pooled, worst_quiet), worst_pooled, worst_quiet))

    feasible = [s for s in scored if s[2] <= BIAS_TOL]
    if feasible:
        chosen, ll, worst, _, _ = min(feasible, key=lambda s: s[1])
        selection = "min fit logloss, calibration within +/-10% (pooled and quiet)"
    else:
        chosen, ll, worst, _, _ = min(scored, key=lambda s: s[2])
        selection = "no feasible set; least-biased set taken"

    hold_rows = build(events, hold_starts, [chosen, CURRENT])
    cur_idx = len(prms) - 1  # CURRENT is appended last
    cur_fit_per = {cell_name(D, t): summarize(fit_rows[(cur_idx, D, t)], date.min, date.max) for D, t in cells()}
    chosen_fit_per = {cell_name(D, t): summarize(fit_rows[(prms.index(chosen), D, t)], date.min, date.max)
                      for D, t in cells()}
    block = {
        "chosen_params": chosen,
        "selection": selection,
        "fit_logloss_mean": ll,
        "fit_worst_bias": worst,
        "fit": {"chosen": chosen_fit_per, "current": cur_fit_per},
        "holdout": {},
    }
    for D, t in cells():
        c = cell_name(D, t)
        new = hold_rows[(0, D, t)]
        old = hold_rows[(1, D, t)]
        diff, lo_ci, hi_ci = paired_brier_diff(new, old, HOLDOUT_START, date.max)
        block["holdout"][c] = {
            "chosen": summarize(new, HOLDOUT_START, date.max),
            "current": summarize(old, HOLDOUT_START, date.max),
            "brier_diff": {"diff": diff, "ci95": [lo_ci, hi_ci]},
            "fairness": {
                "chosen": fairness(new, chosen, D, t, HOLDOUT_START, date.max),
                "current": fairness(old, CURRENT, D, t, HOLDOUT_START, date.max),
            },
        }
    return block


def main():
    print("loading data ...")
    ecos = {"pypi": load_pypi(), "npm": load_npm(), "composer": load_composer()}
    starts = as_of()
    fit_starts = [t for t in starts if t + timedelta(days=max(DURATIONS)) <= FIT_LAST_LABEL]
    hold_starts = [t for t in starts if t >= HOLDOUT_START]
    print(f"fit as-of: {fit_starts[0]} .. {fit_starts[-1]} ({len(fit_starts)} dates, purged)")
    print(f"holdout as-of: {hold_starts[0]} .. {hold_starts[-1]} ({len(hold_starts)} dates)")
    print(f"grid: {len(GRID)} parameter sets per ecosystem")

    report = {
        "protocol": {
            "fit_as_of": f"{fit_starts[0]} .. {fit_starts[-1]}",
            "purge": f"label windows end on or before {FIT_LAST_LABEL}",
            "holdout_as_of": f"{HOLDOUT_START} .. {hold_starts[-1]}",
            "grid_size": len(GRID),
            "bias_tolerance": BIAS_TOL,
            "current": CURRENT,
        },
        "ecosystems": {},
    }
    for name, events in ecos.items():
        print(f"\nfitting {name} ...")
        block = fit_and_hold(name, events, fit_starts, hold_starts)
        report["ecosystems"][name] = block
        print(f"  selection: {block['selection']}")
        print(f"  chosen:  {block['chosen_params']}  fit worst |bias-1| {block['fit_worst_bias']:.3f}")
        print(f"  current: {CURRENT}")

    OUT.write_text(json.dumps(report, indent=2))

    print("\nholdout, chosen (per-ecosystem fit) vs current. bias = mean_pred / base")
    print(f"{'eco':<9}{'cell':<16}{'model':<9}{'brier':>10}{'logloss':>10}{'ece':>8}{'auc':>7}{'bias':>7}{'base':>8}")
    for name, block in report["ecosystems"].items():
        for c, h in block["holdout"].items():
            for label in ("current", "chosen"):
                s = h[label]
                print(f"{name:<9}{c:<16}{label:<9}{s['brier']:>10.6f}{s['logloss']:>10.6f}"
                      f"{s['ece']:>8.4f}{s['auc']:>7.3f}{s['bias_ratio']:>7.2f}{s['base_rate']:>8.4f}")
    print("\nBrier(chosen) - Brier(current), package-clustered 95% CI (negative = chosen better)")
    for name, block in report["ecosystems"].items():
        for c, h in block["holdout"].items():
            d = h["brier_diff"]
            print(f"{name:<9}{c:<16}{d['diff']:+.6f} [{d['ci95'][0]:+.6f}, {d['ci95'][1]:+.6f}]")
    print("\nfairness, holdout: EV per bit at model price (0 = fair)")
    for name, block in report["ecosystems"].items():
        for c in ("30d_cvss>=5", "90d_cvss>=5"):
            for label in ("current", "chosen"):
                f = block["holdout"][c]["fairness"][label]["quiet"]
                if f:
                    print(f"  {name:<9}{c:<13}{label:<8}quiet n={f['n']:<6}"
                          f"price_yes {f['mean_price_yes']:.4f}  observed {f['observed_yes']:.4f}  "
                          f"EV_yes {f['ev_yes']:+.2f}  EV_no {f['ev_no']:+.4f}")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
