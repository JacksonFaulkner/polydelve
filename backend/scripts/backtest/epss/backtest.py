"""Walk-forward backtest of the EPSS threshold-crossing leg in
features/contract_pricing.py (compute_epss_probability) against baselines.

Question: P(EPSS of a CVE reaches >= T within N days | EPSS and history up to
as-of date t). Only the panel data up to t is used for every prediction.

Models
  model   compute_epss_probability(e_t, T, N)   (imported unchanged)
  stay    p = 0  ("stays put": no crossing)
  base    constant crossing rate for the same (N, T), estimated only from
          outcomes already realized by t (i.e. t' + N <= t)
  rw      zero-drift Gaussian random walk in logit(EPSS), daily sigma from the
          CVE's own trailing 90 days (pooled sigma if <10 obs), barrier hit
          probability by reflection with Broadie-Glasserman daily-monitoring shift

Scoring: Brier, log loss, AUC (Mann-Whitney), 10-bin calibration + ECE,
and a cluster bootstrap over as-of dates for Brier differences.

Usage (from backend/):
  uv run python scripts/backtest/epss/backtest.py
"""
import bisect
import json
import math
import random
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parents[2]))  # backend/
from features.contract_pricing import _logit, compute_epss_probability  # noqa: E402

PANEL = HERE / "data" / "panel.tsv.gz"
RESULTS = HERE / "data" / "results.json"
THRESHOLDS = (0.05, 0.10, 0.25, 0.50)
HORIZONS = (7, 30)
STEP_DAYS = 7
LOOKBACK = 90
MIN_OBS = 10
BG_SHIFT = 0.5826  # Broadie-Glasserman discrete-monitoring correction, in sigma*sqrt(dt) units
DEFAULT_SIGMA = 0.3


def load_panel():
    import gzip
    series: dict[str, list[tuple[int, float]]] = defaultdict(list)
    with gzip.open(PANEL, "rt") as f:
        next(f)
        for line in f:
            c, d, s = line.rstrip("\n").split("\t")
            series[c].append((date.fromisoformat(d).toordinal(), float(s)))
    for v in series.values():
        v.sort()
    return series


def value_at(ser_days, ser_vals, day, max_lag=3):
    """Latest observation on or before `day` within max_lag days, else None."""
    i = bisect.bisect_right(ser_days, day) - 1
    if i < 0 or day - ser_days[i] > max_lag:
        return None
    return ser_vals[i]


def norm_sf(x):
    return 0.5 * math.erfc(x / math.sqrt(2))


def rw_prob(e, T, N, sigma):
    gap = _logit(T) - _logit(e)
    if gap <= 0:
        return 0.92
    gap_adj = gap + BG_SHIFT * sigma  # daily monitoring correction
    p = 2.0 * norm_sf(gap_adj / (sigma * math.sqrt(N)))
    return min(max(p, 0.0), 1.0)


def brier(ps, ys):
    return sum((p - y) ** 2 for p, y in zip(ps, ys)) / len(ps)


def logloss(ps, ys, eps=1e-4):
    tot = 0.0
    for p, y in zip(ps, ys):
        p = min(max(p, eps), 1 - eps)
        tot -= y * math.log(p) + (1 - y) * math.log(1 - p)
    return tot / len(ps)


def auc(ps, ys):
    pos = [p for p, y in zip(ps, ys) if y == 1]
    neg = [p for p, y in zip(ps, ys) if y == 0]
    if not pos or not neg:
        return float("nan")
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
    r_pos = sum(ranks[i] for i, y in enumerate(ys) if y == 1)
    return (r_pos - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg))


def calibration(ps, ys, bins=10):
    rows = []
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        idx = [i for i, p in enumerate(ps) if (lo <= p < hi) or (b == bins - 1 and p == 1.0)]
        if not idx:
            rows.append((lo, hi, 0, None, None))
            continue
        mp = sum(ps[i] for i in idx) / len(idx)
        mo = sum(ys[i] for i in idx) / len(idx)
        rows.append((lo, hi, len(idx), mp, mo))
    n = len(ps)
    ece = sum(r[2] / n * abs(r[3] - r[4]) for r in rows if r[2])
    return rows, ece


def main() -> None:
    series = load_panel()
    all_days = sorted({d for ser in series.values() for d, _ in ser})
    d0, d1 = all_days[0], all_days[-1]
    first_asof = d0 + LOOKBACK
    last_asof = d1 - max(HORIZONS)

    # Pooled sigma over trailing window is recomputed per as-of date (walk-forward).
    # Precompute per-CVE arrays.
    arrs = {c: ([d for d, _ in s], [v for _, v in s]) for c, s in series.items()}

    records = []  # dicts: asof, cve, T, N, e, sigma, y
    asofs = list(range(first_asof, last_asof + 1, STEP_DAYS))
    for t in asofs:
        # pooled sigma from trailing diffs in logit space, all CVEs (only data <= t)
        pooled = []
        per_cve_sigma = {}
        for c, (ds, vs) in arrs.items():
            lo = bisect.bisect_right(ds, t - LOOKBACK)
            hi = bisect.bisect_right(ds, t)
            if hi - lo < 3:
                continue
            seg = [_logit(max(min(v, 0.9999), 1e-4)) for v in vs[lo:hi]]
            diffs = [b - a for a, b in zip(seg, seg[1:])]
            if len(diffs) >= MIN_OBS - 1:
                m = sum(diffs) / len(diffs)
                var = sum((x - m) ** 2 for x in diffs) / max(len(diffs) - 1, 1)
                per_cve_sigma[c] = math.sqrt(var)
                pooled.extend(diffs)
        pooled_sigma = (math.sqrt(sum(x * x for x in pooled) / len(pooled))
                        if len(pooled) > 100 else DEFAULT_SIGMA)
        for c, (ds, vs) in arrs.items():
            e = value_at(ds, vs, t)
            if e is None:
                continue
            sigma = per_cve_sigma.get(c, pooled_sigma)
            for N in HORIZONS:
                fut_days = [x for x in ds if t < x <= t + N]
                if not fut_days or value_at(ds, vs, t + N) is None:
                    continue  # no realized outcome window
                fut_vals = vs[bisect.bisect_right(ds, t): bisect.bisect_right(ds, t + N)]
                for T in THRESHOLDS:
                    if e >= T:
                        continue  # model's "already above" branch: not a pricing question here
                    y = 1 if max(fut_vals) >= T else 0
                    records.append(dict(asof=t, cve=c, T=T, N=N, e=e, sigma=sigma, y=y))
    print(f"as-of dates={len(asofs)} records={len(records)} "
          f"positives={sum(r['y'] for r in records)}", flush=True)

    # Base-rate baseline: running rate per (N,T) from outcomes realized by t.
    by_key = defaultdict(list)
    for r in records:
        by_key[(r["N"], r["T"])].append(r)
    for k in by_key:
        by_key[k].sort(key=lambda r: r["asof"])
    for r in records:
        pass
    base_pred = {}
    for k, rs in by_key.items():
        # cumulative counts of outcomes known at time t (asof + N <= t)
        pass
    for k, rs in by_key.items():
        N = k[0]
        known = sorted(rs, key=lambda r: r["asof"] + N)
        ks = [r["asof"] + N for r in known]
        cum_pos, cum_n = [0], [0]
        for r in known:
            cum_pos.append(cum_pos[-1] + r["y"])
            cum_n.append(cum_n[-1] + 1)
        for r in rs:
            j = bisect.bisect_right(ks, r["asof"])  # outcomes realized by as-of date
            n = cum_n[j]
            p = (cum_pos[j] / n) if n >= 50 else 0.05
            base_pred[(r["asof"], r["cve"], r["T"], r["N"])] = p

    rows = {"model": [], "stay": [], "base": [], "rw": [], "y": [], "asof": [], "N": [], "T": [], "e": []}
    for r in records:
        p_model = compute_epss_probability(r["e"], r["T"], r["N"])
        rows["model"].append(p_model)
        rows["stay"].append(0.0)
        rows["base"].append(base_pred[(r["asof"], r["cve"], r["T"], r["N"])])
        rows["rw"].append(rw_prob(r["e"], r["T"], r["N"], r["sigma"]))
        rows["y"].append(r["y"])
        rows["asof"].append(r["asof"])
        rows["N"].append(r["N"])
        rows["T"].append(r["T"])
        rows["e"].append(r["e"])

    def summarize(mask):
        idx = [i for i, m in enumerate(mask) if m]
        ys = [rows["y"][i] for i in idx]
        out = {"n": len(idx), "pos_rate": sum(ys) / len(ys) if ys else None}
        for name in ("model", "stay", "base", "rw"):
            ps = [rows[name][i] for i in idx]
            out[name] = {"brier": brier(ps, ys), "logloss": logloss(ps, ys), "auc": auc(ps, ys)}
            _, ece = calibration(ps, ys)
            out[name]["ece"] = ece
        return out

    results = {"groups": {}, "calibration": {}, "bootstrap": {}}
    groups = {
        "all": [True] * len(records),
        "N=7": [n == 7 for n in rows["N"]],
        "N=30": [n == 30 for n in rows["N"]],
        "N=30,e>=0.01": [n == 30 and e >= 0.01 for n, e in zip(rows["N"], rows["e"])],
    }
    for g, mask in groups.items():
        results["groups"][g] = summarize(mask)

    # Calibration table for the model, all records
    cal_rows, _ = calibration(rows["model"], rows["y"])
    results["calibration"]["model_all"] = cal_rows
    cal_rows, _ = calibration(rows["rw"], rows["y"])
    results["calibration"]["rw_all"] = cal_rows

    # Cluster bootstrap over as-of dates for Brier difference model - X
    dates = sorted(set(rows["asof"]))
    per_date = defaultdict(lambda: defaultdict(float))
    per_date_n = defaultdict(int)
    for i, t in enumerate(rows["asof"]):
        y = rows["y"][i]
        per_date_n[t] += 1
        for name in ("model", "stay", "base", "rw"):
            per_date[t][name] += (rows[name][i] - y) ** 2
    rng = random.Random(0)
    for other in ("stay", "base", "rw"):
        diffs = []
        for _ in range(500):
            sample = [rng.choice(dates) for _ in dates]
            num = sum(per_date[t]["model"] - per_date[t][other] for t in sample)
            den = sum(per_date_n[t] for t in sample)
            diffs.append(num / den)
        diffs.sort()
        point = (sum(per_date[t]["model"] - per_date[t][other] for t in dates)
                 / sum(per_date_n[t] for t in dates))
        results["bootstrap"][f"model_minus_{other}"] = {
            "brier_diff": point, "ci95": [diffs[12], diffs[487]]}

    results["meta"] = {
        "panel_days": [date.fromordinal(d0).isoformat(), date.fromordinal(d1).isoformat()],
        "first_asof": date.fromordinal(asofs[0]).isoformat(),
        "last_asof": date.fromordinal(asofs[-1]).isoformat(),
        "n_asof": len(asofs),
        "n_cves": len(arrs),
        "thresholds": THRESHOLDS,
        "horizons": HORIZONS,
        "step_days": STEP_DAYS,
    }
    RESULTS.write_text(json.dumps(results, indent=1, default=str))
    print(json.dumps(results["groups"], indent=1, default=str)[:6000], flush=True)
    print(f"wrote {RESULTS}", flush=True)


if __name__ == "__main__":
    main()
