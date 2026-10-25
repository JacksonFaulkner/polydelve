"""
Walk-forward backtest of basket ("at least K of N legs fire") probabilities.

Data
  OSV bulk advisory archives (npm, PyPI, Packagist all.zip). An event for a
  package is an OSV advisory whose `published` date falls in the window.
  Realized outcome per leg: >=1 advisory published in [T, T+H).

Model under test (reuses backend code, read-only)
  Per-leg rate: features.contract_pricing.cve_hazard with threshold 5.0
  (OSV advisories carry no parsed CVSS, so all count as UNSCORED=5.0).
  Independent basket: features.etf_pricing.poisson_binomial_at_least.
  Correlated variant: one common lognormal shock M (mean 1) multiplies every
  leg's rate, p_i(M) = 1 - exp(-lam_i H M); P(>=K) = E_M[tail(p(M))].
  sigma = 0 recovers the independent model. sigma is chosen per stratum
  (single-ecosystem vs multi-ecosystem baskets) walk-forward, using only
  origins whose outcome window had already closed.

Baselines
  constant: running mean of all realized labels from closed origins.

Run (from anywhere):
  python3 -I backend/scripts/backtest/basket/basket_backtest.py \
      --osv-dir <dir containing npm.zip PyPI.zip Packagist.zip> --out <json>
"""
from __future__ import annotations

import argparse
import bisect
import json
import math
import random
import sys
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(BACKEND))

from features.contract_pricing import cve_hazard  # noqa: E402
from features.etf_pricing import poisson_binomial_at_least  # noqa: E402

ECOSYSTEMS = ("npm", "PyPI", "Packagist")
H = 30                      # horizon (days); origins spaced H apart => non-overlapping windows
THRESHOLD = 5.0             # all OSV advisories count (unscored -> 5.0 in cve_hazard)
SIGMAS = (0.0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0)
# Control: independent model with all rates multiplied by a walk-forward scale.
SCALES = (0.25, 0.35, 0.5, 0.65, 0.8, 1.0, 1.25)
Z_NODES = [-3.5 + 7.0 * i / 24 for i in range(25)]
_phi = [math.exp(-z * z / 2) for z in Z_NODES]
_norm = sum(_phi)
Z_W = [w / _norm for w in _phi]


def _nodes(sigma: float):
    if sigma == 0.0:
        return [(1.0, 1.0)]
    return [(math.exp(sigma * z - sigma * sigma / 2), w) for z, w in zip(Z_NODES, Z_W)]


NODES = {s: _nodes(s) for s in SIGMAS}


# ── data ──────────────────────────────────────────────────────────────────────

def load_events(osv_dir: Path) -> dict[tuple[str, str], list[int]]:
    """(ecosystem, name) -> sorted list of advisory publish dates (date ordinals)."""
    events: dict[tuple[str, str], list[int]] = defaultdict(list)
    for eco in ECOSYSTEMS:
        with zipfile.ZipFile(osv_dir / f"{eco}.zip") as zf:
            for info in zf.infolist():
                if not info.filename.endswith(".json"):
                    continue
                rec = json.loads(zf.read(info))
                pub = rec.get("published")
                if not pub:
                    continue
                ordn = date.fromisoformat(pub[:10]).toordinal()
                seen = set()
                for aff in rec.get("affected", []) or []:
                    pkg = aff.get("package") or {}
                    if pkg.get("ecosystem") != eco or not pkg.get("name"):
                        continue
                    key = (eco, pkg["name"])
                    if key in seen:
                        continue
                    seen.add(key)
                    events[key].append(ordn)
    for v in events.values():
        v.sort()
    return dict(events)


def eco_times(events: dict[tuple[str, str], list[int]]) -> dict[str, list[int]]:
    """ecosystem -> sorted publish ordinals of every advisory in that ecosystem."""
    out: dict[str, list[int]] = defaultdict(list)
    for (eco, _name), times in events.items():
        out[eco].extend(times)
    for v in out.values():
        v.sort()
    return dict(out)


def eco_rate_at(times: list[int], t: int, n_pkgs: int) -> float:
    """Per package-day advisory rate for an ecosystem, from advisories in [t-365, t).
    The denominator is the advisory-holding universe the baskets draw from, so the
    numerator and denominator cover the same packages (production divides by all packages)."""
    lo = bisect.bisect_left(times, t - 365)
    hi = bisect.bisect_left(times, t)
    return (hi - lo) / (n_pkgs * 365.0)


def leg_rate(times: list[int], t: int, eco_rate: float) -> float:
    """Per-day hazard from advisories published strictly before origin t."""
    hi = bisect.bisect_left(times, t)
    lo = bisect.bisect_left(times, t - 365)
    recent = [(t - x, None) for x in times[lo:hi]]
    return cve_hazard(recent, THRESHOLD, eco_rate)


def realized_fire(times: list[int], t: int) -> int:
    return 1 if bisect.bisect_left(times, t + H) > bisect.bisect_left(times, t) else 0


# ── models ────────────────────────────────────────────────────────────────────

def pmf(probs: list[float]) -> list[float]:
    pm = [1.0]
    for p in probs:
        q = 1.0 - p
        new = [0.0] * (len(pm) + 1)
        for k, v in enumerate(pm):
            new[k] += v * q
            new[k + 1] += v * p
        pm = new
    return pm


def tails(pm: list[float]) -> list[float]:
    """tail[K] = P(count >= K) for K = 0..N+1."""
    n = len(pm) - 1
    out = [0.0] * (n + 2)
    for k in range(n, -1, -1):
        out[k] = out[k + 1] + pm[k]
    return out


def predicted_tails(lams: list[float], sigma: float, scale: float = 1.0) -> list[float]:
    acc = [0.0] * (len(lams) + 1)
    for m, w in NODES[sigma]:
        pm = pmf([1.0 - math.exp(-lam * scale * H * m) for lam in lams])
        for k, v in enumerate(pm):
            acc[k] += w * v
    return tails(acc)


def selfcheck() -> None:
    rng = random.Random(0)
    for _ in range(200):
        n = rng.randint(2, 10)
        ps = [rng.uniform(0.0, 0.5) for _ in range(n)]
        t = tails(pmf(ps))
        for k in range(1, n + 1):
            ref = poisson_binomial_at_least(ps, k)
            assert abs(t[k] - ref) < 1e-9 or ref in (1e-9, 0.9999), (k, t[k], ref)
        prod = math.prod(ps)
        assert abs(t[n] - prod) < 1e-12, "K=N must equal parlay product"


# ── scoring ───────────────────────────────────────────────────────────────────

def brier(ps, ys):
    return sum((p - y) ** 2 for p, y in zip(ps, ys)) / len(ps)


def logloss(ps, ys):
    tot = 0.0
    for p, y in zip(ps, ys):
        p = min(max(p, 1e-9), 1 - 1e-9)
        tot -= y * math.log(p) + (1 - y) * math.log(1 - p)
    return tot / len(ps)


def calib_bins(ps, ys, nb=10):
    bins = [[] for _ in range(nb)]
    for p, y in zip(ps, ys):
        bins[min(int(p * nb), nb - 1)].append((p, y))
    out = []
    n_tot = len(ps)
    ece = 0.0
    for i, b in enumerate(bins):
        if not b:
            out.append({"bin": f"[{i/nb:.1f},{(i+1)/nb:.1f})", "n": 0})
            continue
        mp = sum(p for p, _ in b) / len(b)
        mo = sum(y for _, y in b) / len(b)
        ece += len(b) / n_tot * abs(mo - mp)
        out.append({"bin": f"[{i/nb:.1f},{(i+1)/nb:.1f})", "n": len(b),
                    "mean_pred": round(mp, 4), "obs_rate": round(mo, 4)})
    return out, ece


def summarize(ps, ys):
    bins, ece = calib_bins(ps, ys)
    return {"n": len(ps), "brier": round(brier(ps, ys), 6), "logloss": round(logloss(ps, ys), 6),
            "ece": round(ece, 4), "base_rate": round(sum(ys) / len(ys), 4), "bins": bins}


# ── main ──────────────────────────────────────────────────────────────────────

def main(argv=None) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--osv-dir", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--per-origin", type=int, default=200)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--start", default="2023-01-01")
    ap.add_argument("--min-train-origins", type=int, default=6)
    args = ap.parse_args(argv)

    selfcheck()
    print("selfcheck ok", flush=True)

    events = load_events(args.osv_dir)
    keys = sorted(events)
    max_day = max(v[-1] for v in events.values())
    by_eco: dict[str, list] = defaultdict(list)
    for k in keys:
        by_eco[k[0]].append(k)
    print(f"packages with >=1 advisory: {len(keys)} "
          + " ".join(f"{e}={len(by_eco[e])}" for e in ECOSYSTEMS), flush=True)

    origins = []
    t = date.fromisoformat(args.start).toordinal()
    while t + H <= max_day:
        origins.append(t)
        t += H
    print(f"origins: {len(origins)} ({date.fromordinal(origins[0])} .. {date.fromordinal(origins[-1])})",
          flush=True)

    rng = random.Random(args.seed)
    eco_list = list(by_eco)
    eco_w = [len(by_eco[e]) for e in eco_list]
    per_eco = eco_times(events)
    baskets = []  # one per sampled basket
    for oi, t in enumerate(origins):
        eco_rate = {e: eco_rate_at(per_eco[e], t, len(by_eco[e])) for e in by_eco}
        for b in range(args.per_origin):
            n = rng.randint(2, 10)
            if b % 2 == 0:  # same-ecosystem basket (shared-ecosystem correlation test)
                eco = rng.choices(eco_list, weights=eco_w)[0]
                members = rng.sample(by_eco[eco], n)
            else:           # cross-ecosystem basket
                members = rng.sample(keys, n)
            n_eco = len({m[0] for m in members})
            lams = [leg_rate(events[m], t, eco_rate[m[0]]) for m in members]
            cs = [realized_fire(events[m], t) for m in members]
            baskets.append({"oi": oi, "t": t, "n": n, "n_eco": n_eco,
                            "stratum": "single" if n_eco == 1 else "multi",
                            "lams": lams, "fires": cs, "c": sum(cs)})
    print(f"sampled baskets: {len(baskets)}", flush=True)

    # Predictions per basket for every sigma.
    for bk in baskets:
        bk["tails"] = {s: predicted_tails(bk["lams"], s) for s in SIGMAS}
        bk["stails"] = {c: predicted_tails(bk["lams"], 0.0, c) for c in SCALES}
        bk["indep_mean"] = sum(1 - math.exp(-lam * H) for lam in bk["lams"])
        bk["indep_var"] = sum(p * (1 - p) for p in (1 - math.exp(-lam * H) for lam in bk["lams"]))
    print("predictions done", flush=True)

    by_origin = defaultdict(list)
    for bk in baskets:
        by_origin[bk["oi"]].append(bk)

    def labels(bks, s=None, model="sigma"):
        ps, ys = [], []
        for bk in bks:
            for k in range(1, bk["n"] + 1):
                if model == "sigma":
                    ps.append(bk["tails"][s][k])
                ys.append(1 if bk["c"] >= k else 0)
        return ps, ys

    # Walk-forward: at origin oi, training = origins j with origins[j]+H <= origins[oi].
    results = {"config": vars(args) | {"osv_dir": str(args.osv_dir), "out": str(args.out)},
               "horizon_days": H, "threshold": THRESHOLD, "sigmas": SIGMAS,
               "n_packages": len(keys), "n_origins": len(origins), "n_baskets": len(baskets)}
    test_ps = {"indep": [], "corr": [], "scaled": [], "const": []}
    test_ys, test_strata, test_origin, test_k, test_n = [], [], [], [], []
    chosen = defaultdict(list)
    scale_chosen = defaultdict(list)
    sel_log = []

    for oi in range(len(origins)):
        t = origins[oi]
        train_oi = [j for j in range(len(origins)) if origins[j] + H <= t]
        # running constant baseline from closed-window labels
        train_bks = [bk for j in train_oi for bk in by_origin[j]]
        if len(train_oi) < args.min_train_origins:
            continue
        tr_labels = [1 if bk["c"] >= k else 0 for bk in train_bks for k in range(1, bk["n"] + 1)]
        const_rate = sum(tr_labels) / len(tr_labels)

        sel = {}
        sel_scale = {}
        for stratum in ("single", "multi"):
            tr = [bk for bk in train_bks if bk["stratum"] == stratum]
            best, best_b = None, float("inf")
            for s in SIGMAS:
                ps, ys = labels(tr, s)
                b = brier(ps, ys)
                if b < best_b:
                    best, best_b = s, b
            sel[stratum] = best
            chosen[stratum].append(best)
            best, best_b = None, float("inf")
            for c in SCALES:
                ps = [bk["stails"][c][k] for bk in tr for k in range(1, bk["n"] + 1)]
                ys = [1 if bk["c"] >= k else 0 for bk in tr for k in range(1, bk["n"] + 1)]
                b = brier(ps, ys)
                if b < best_b:
                    best, best_b = c, b
            sel_scale[stratum] = best
            scale_chosen[stratum].append(best)
        sel_log.append({"origin": str(date.fromordinal(t)), "sigma": sel, "scale": sel_scale})

        for bk in by_origin[oi]:
            s = sel[bk["stratum"]]
            for k in range(1, bk["n"] + 1):
                y = 1 if bk["c"] >= k else 0
                test_ps["indep"].append(bk["tails"][0.0][k])
                test_ps["corr"].append(bk["tails"][s][k])
                test_ps["scaled"].append(bk["stails"][sel_scale[bk["stratum"]]][k])
                test_ps["const"].append(const_rate)
                test_ys.append(y)
                test_strata.append(bk["stratum"])
                test_origin.append(oi)
                test_k.append(k)
                test_n.append(bk["n"])

    results["walk_forward_selected_sigma"] = sel_log
    results["n_test_labels"] = len(test_ys)
    out_models = {}
    for name in ("indep", "scaled", "corr", "const"):
        out_models[name] = {}
        for stratum in ("all", "single", "multi"):
            idx = [i for i in range(len(test_ys)) if stratum == "all" or test_strata[i] == stratum]
            ps = [test_ps[name][i] for i in idx]
            ys = [test_ys[i] for i in idx]
            out_models[name][stratum] = summarize(ps, ys)
    results["models"] = out_models

    # Block bootstrap over origins for Brier(indep) - Brier(corr).
    rng2 = random.Random(11)
    origin_ids = sorted(set(test_origin))
    by_o = defaultdict(list)
    for i, o in enumerate(test_origin):
        by_o[o].append(i)
    diffs = []
    for _ in range(1000):
        pick = [rng2.choice(origin_ids) for _ in origin_ids]
        num = den = 0.0
        for o in pick:
            for i in by_o[o]:
                num += (test_ps["indep"][i] - test_ys[i]) ** 2 - (test_ps["corr"][i] - test_ys[i]) ** 2
                den += 1
        diffs.append(num / den)
    diffs.sort()
    point = (sum((test_ps["indep"][i] - test_ys[i]) ** 2 - (test_ps["corr"][i] - test_ys[i]) ** 2
                 for i in range(len(test_ys))) / len(test_ys))
    results["brier_gain_indep_minus_corr"] = {
        "point": round(point, 6),
        "ci95": [round(diffs[25], 6), round(diffs[974], 6)],
        "note": "positive = correlated variant has lower Brier",
    }

    def paired_gain(a: str, b: str) -> dict:
        """Block-bootstrap (over origins) Brier(a) - Brier(b); positive = b better."""
        def d(i):
            return (test_ps[a][i] - test_ys[i]) ** 2 - (test_ps[b][i] - test_ys[i]) ** 2
        pt = sum(d(i) for i in range(len(test_ys))) / len(test_ys)
        rng3 = random.Random(13)
        draws = []
        for _ in range(1000):
            pick = [rng3.choice(origin_ids) for _ in origin_ids]
            num = cnt = 0.0
            for o in pick:
                for i in by_o[o]:
                    num += d(i)
                    cnt += 1
            draws.append(num / cnt)
        draws.sort()
        return {"point": round(pt, 6), "ci95": [round(draws[25], 6), round(draws[974], 6)]}

    results["brier_gain_scaled_minus_corr"] = paired_gain("scaled", "corr")
    results["brier_gain_indep_minus_scaled"] = paired_gain("indep", "scaled")

    # Leg-level calibration of the hazard model itself (no basket structure).
    leg_p, leg_y = [], []
    for bk in baskets:
        for lam, f in zip(bk["lams"], bk["fires"]):
            leg_p.append(1 - math.exp(-lam * H))
            leg_y.append(f)
    results["leg_level"] = summarize(leg_p, leg_y)

    # Dispersion: observed variance of realized count vs independent prediction.
    disp = {}
    for stratum in ("single", "multi", "all"):
        num = den = 0.0
        for bk in baskets:
            if stratum != "all" and bk["stratum"] != stratum:
                continue
            num += (bk["c"] - bk["indep_mean"]) ** 2
            den += bk["indep_var"]
        disp[stratum] = round(num / den, 4) if den else None
    results["dispersion_obs_over_indep_var"] = disp
    results["sigma_chosen_counts"] = {k: {str(s): v.count(s) for s in SIGMAS} for k, v in chosen.items()}
    results["scale_chosen_counts"] = {k: {str(c): v.count(c) for c in SCALES} for k, v in scale_chosen.items()}
    results["realized_fire_rate_per_leg"] = round(
        sum(sum(bk["fires"]) for bk in baskets) / sum(bk["n"] for bk in baskets), 4)
    results["mean_predicted_leg_prob"] = round(
        sum(1 - math.exp(-lam * H) for bk in baskets for lam in bk["lams"]) / sum(bk["n"] for bk in baskets), 4)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(results, indent=2))
    print(json.dumps({k: results[k] for k in (
        "n_packages", "n_origins", "n_baskets", "n_test_labels", "realized_fire_rate_per_leg",
        "mean_predicted_leg_prob", "dispersion_obs_over_indep_var", "brier_gain_indep_minus_corr",
        "sigma_chosen_counts", "scale_chosen_counts")}, indent=2))
    for name in ("indep", "scaled", "corr", "const"):
        for stratum in ("all", "single", "multi"):
            m = results["models"][name][stratum]
            print(f"{name:6s} {stratum:6s} n={m['n']:6d} brier={m['brier']:.5f} "
                  f"logloss={m['logloss']:.5f} ece={m['ece']:.4f} base={m['base_rate']:.4f}")


    # ── metrics.json (consumed by RESULTS.md / downstream) ──────────────────
    m = results["models"]
    cells: dict[tuple[int, int], tuple[list[float], list[int]]] = defaultdict(lambda: ([], []))
    for i in range(len(test_ys)):
        cells[(test_n[i], test_k[i])][0].append(test_ps["indep"][i])
        cells[(test_n[i], test_k[i])][1].append(test_ys[i])
    calibration = {}
    for (n_legs, k_thr) in sorted(cells):
        cps, cys = cells[(n_legs, k_thr)]
        bins, _ = calib_bins(cps, cys)
        calibration[f"K{k_thr}_of_N{n_legs}"] = [
            {"predicted_mean": b["mean_pred"], "observed": b["obs_rate"], "n": b["n"]}
            for b in bins if b["n"] > 0
        ]
    metrics_out = {
        "model": "independent Poisson-binomial over per-leg hazard (cve_hazard, threshold 5.0 on OSV advisories)",
        "metrics": {
            "brier_model": m["indep"]["all"]["brier"],
            "brier_scaled": m["scaled"]["all"]["brier"],
            "brier_correlated": m["corr"]["all"]["brier"],
            "brier_const": m["const"]["all"]["brier"],
            "logloss_model": m["indep"]["all"]["logloss"],
            "logloss_scaled": m["scaled"]["all"]["logloss"],
            "logloss_correlated": m["corr"]["all"]["logloss"],
            "logloss_const": m["const"]["all"]["logloss"],
            "ece_model": m["indep"]["all"]["ece"],
            "ece_scaled": m["scaled"]["all"]["ece"],
            "ece_correlated": m["corr"]["all"]["ece"],
            "ece_const": m["const"]["all"]["ece"],
            "base_rate": m["indep"]["all"]["base_rate"],
            "n_labels": len(test_ys),
            "n_baskets": results["n_baskets"],
        },
        "calibration": calibration,
        "sample": {
            "baskets": results["n_baskets"],
            "basket_k_labels_evaluated": len(test_ys),
            "packages_in_universe": results["n_packages"],
            "legs_scored": results["leg_level"]["n"],
            "evaluated_origins": len(origin_ids),
            "basket_size_range": [2, 10],
            "sources_of_events": "OSV bulk advisories (npm, PyPI, Packagist)",
        },
        "date_range": {
            "origins_first": str(date.fromordinal(origins[0])),
            "origins_last": str(date.fromordinal(origins[-1])),
            "evaluated_from": str(date.fromordinal(origins[min(origin_ids)])),
            "horizon_days": H,
        },
        "sources": [
            "https://storage.googleapis.com/osv-vulnerabilities/ (npm, PyPI, Packagist all.zip, read 2026-10-22)",
            "https://cran.r-project.org/web/packages/ShiftConvolvePoibin/index.html (Peres, Lee, Keich 2020, arXiv:2004.07429)",
            "https://www.utupub.fi/handle/11111/39775",
            "https://arxiv.org/pdf/physics/0609093",
            "https://halshs.archives-ouvertes.fr/halshs-00446903v1",
        ],
        "caveats": [
            "OSV advisories are not CVEs; CVSS is not parsed so threshold 5.0 counts all advisories.",
            "Universe is packages with >=1 advisory ever (survivorship-biased); baskets are random, not catalog.",
            "npm dominates the universe (226k of 241k packages).",
            "sigma and scale selections sit at their grid edges.",
            "Basket-K labels within a basket are correlated; origins (40) are the independent blocks.",
            "Calibration cells use the independent model (the model under test).",
            "Dispersion ratio cannot separate correlation from rate misspecification.",
        ],
    }
    metrics_path = Path(__file__).resolve().parent / "metrics.json"
    metrics_path.write_text(json.dumps(metrics_out, indent=2))
    print(f"wrote {metrics_path}", flush=True)

if __name__ == "__main__":
    main()
