"""
Walk-forward backtest of the CVE hazard model on npm (OSV history).

For each sampled npm package and each as-of date T (monthly, 2020-01 onward):
  - the model sees only CVEs published strictly before T (days_ago = T - pub);
  - it predicts P(>=1 qualifying CVE in [T, T+D)) for D in (30, 90) days;
  - the outcome is whether such a CVE was actually published in that window.

Model under test: features.contract_pricing.compute_cvss_probability (imported, not copied),
with eco_rate recomputed per as-of T from sampled events dated before T.
Baselines:
  - 365d_only: the same model with eco_rate=0 (no ecosystem prior), own 365-day history only.
  - constant: pool-wide Poisson rate from all sampled packages' events before T.

Metrics: Brier, Brier skill vs constant, log loss, ROC AUC (ranking), calibration
(10 equal-width bins + ECE), calibration-in-the-large, and package-clustered
bootstrap 95% CIs for Brier differences.

Run: backend/.venv/bin/python -I scripts/backtest/npm/backtest.py
"""
from __future__ import annotations

import json
import math
import random
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
BACKEND = HERE.parents[2]  # backend/
sys.path.insert(0, str(BACKEND))

from features.contract_pricing import (  # noqa: E402  (reuse the production model)
    UNSCORED_CVSS,
    compute_cvss_probability,
)

DURATIONS = (30, 90)
THRESHOLDS = (0.0, 5.0, 7.0)  # 0.0 = any CVE; 5.0 / 7.0 = CVSS >= 5 / >= 7 (metrics.json uses 5 and 7)
START = date(2020, 1, 1)
STEP_DAYS = 30
END = date(2026, 10, 22)  # today; last as-of leaves full 90d outcome window observable
DATA_START = date(2018, 1, 1)  # origin for the constant-rate baseline
N_BOOT = 1000
SEED = 11


def _score(c):
    return UNSCORED_CVSS if c is None else c


def load():
    events = defaultdict(list)  # pkg -> [(pub_date, cvss)] sorted
    with (DATA / "events.jsonl").open() as f:
        for line in f:
            e = json.loads(line)
            events[e["pkg"]].append((date.fromisoformat(e["pub"]), e["cvss"]))
    for v in events.values():
        v.sort(key=lambda x: x[0])
    sample = json.loads((DATA / "sample.json").read_text())
    return events, sample


def as_of_dates():
    out, t = [], START
    while t + timedelta(days=max(DURATIONS)) <= END:
        out.append(t)
        t += timedelta(days=STEP_DAYS)
    return out


def ranks_auc(scores, labels):
    """Mann-Whitney AUC with average ranks for ties."""
    pairs = sorted(zip(scores, labels))
    n_pos = sum(labels)
    n_neg = len(labels) - n_pos
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    rank_sum, i = 0.0, 0
    while i < len(pairs):
        j = i
        while j + 1 < len(pairs) and pairs[j + 1][0] == pairs[i][0]:
            j += 1
        avg = (i + j) / 2 + 1
        rank_sum += avg * sum(lbl for _, lbl in pairs[i:j + 1])
        i = j + 1
    return (rank_sum - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)


def metrics(preds, labels):
    n = len(preds)
    brier = sum((p - o) ** 2 for p, o in zip(preds, labels)) / n
    eps = 1e-6
    logloss = -sum(o * math.log(p + eps) + (1 - o) * math.log(1 - p + eps)
                   for p, o in zip(preds, labels)) / n
    bins = defaultdict(list)
    for p, o in zip(preds, labels):
        bins[min(int(p * 10), 9)].append((p, o))
    ece = 0.0
    table = []
    for b in range(10):
        if not bins[b]:
            continue
        mp = sum(p for p, _ in bins[b]) / len(bins[b])
        mo = sum(o for _, o in bins[b]) / len(bins[b])
        ece += len(bins[b]) / n * abs(mp - mo)
        table.append((f"{b / 10:.1f}-{(b + 1) / 10:.1f}", len(bins[b]), mp, mo))
    return {
        "n": n,
        "base_rate": sum(labels) / n,
        "mean_pred": sum(preds) / n,
        "brier": brier,
        "logloss": logloss,
        "auc": ranks_auc(preds, labels),
        "ece": ece,
        "calib_table": table,
    }


def eco_rate_at(events, names, T, thr):
    """Per package-day rate of qualifying events over the sample, from events dated
    in (T-365, T). Denominator is the sample, so numerator and denominator cover the
    same packages. The sample is enriched (63 of 250 have CVEs): this is not the npm rate."""
    n = sum(1 for pkg in names for pub, cv in events.get(pkg, [])
            if pub < T and (T - pub).days <= 365 and _score(cv) >= thr)
    return n / (len(names) * 365.0)


def main():
    events, sample = load()
    names = [s["name"] for s in sample]
    tier = {s["name"]: s["tier"] for s in sample}
    dates = as_of_dates()

    # Per-(duration, threshold) rows: pkg, T, model p, 365-only p, constant p, outcome
    rows = defaultdict(list)
    # Constant baseline needs pool-wide counts of qualifying events before T.
    all_events = [(pkg, pub, cv) for pkg in names for pub, cv in events.get(pkg, [])]

    for T in dates:
        exposure_days = max((T - DATA_START).days, 1) * len(names)
        for thr in THRESHOLDS:
            eco = eco_rate_at(events, names, T, thr)
            qual_before = sum(1 for _, pub, cv in all_events
                              if pub < T and _score(cv) >= thr)
            rate_pool = qual_before / exposure_days
            for D in DURATIONS:
                p_const = 1 - math.exp(-rate_pool * D)
                for pkg in names:
                    hist = events.get(pkg, [])
                    past = [((T - pub).days, cv) for pub, cv in hist if pub < T]
                    past365 = [(d, c) for d, c in past if d <= 365]
                    k365 = sum(1 for _, c in past365 if _score(c) >= thr)
                    p_model = compute_cvss_probability(past365, thr, D, eco)
                    p_365 = compute_cvss_probability(past365, thr, D, 0.0)
                    end = T + timedelta(days=D)
                    outcome = int(any(T <= pub < end and _score(cv) >= thr for pub, cv in hist))
                    rows[(D, thr)].append((pkg, T, p_model, p_365, p_const, outcome, k365))

    results = {}
    for key, rs in sorted(rows.items()):
        D, thr = key
        labels = [r[5] for r in rs]
        m = {
            "model": metrics([r[2] for r in rs], labels),
            "365d_only": metrics([r[3] for r in rs], labels),
            "constant": metrics([r[4] for r in rs], labels),
        }
        # Package-clustered bootstrap for Brier differences.
        per_pkg = defaultdict(lambda: [0.0, 0.0, 0.0, 0])  # sum sq model, 365, const, count
        for pkg, _, pm, p365, pc, o, _k in rs:
            acc = per_pkg[pkg]
            acc[0] += (pm - o) ** 2
            acc[1] += (p365 - o) ** 2
            acc[2] += (pc - o) ** 2
            acc[3] += 1
        pkgs = list(per_pkg)
        rng = random.Random(SEED)
        d365, dconst = [], []
        for _ in range(N_BOOT):
            s = [0.0, 0.0, 0.0, 0]
            for pk in (rng.choice(pkgs) for _ in pkgs):
                a = per_pkg[pk]
                for i in range(3):
                    s[i] += a[i]
                s[3] += a[3]
            bm, b365, bc = s[0] / s[3], s[1] / s[3], s[2] / s[3]
            d365.append(bm - b365)
            dconst.append(bm - bc)
        d365.sort()
        dconst.sort()
        m["boot_model_minus_365"] = (d365[int(0.025 * N_BOOT)], d365[int(0.975 * N_BOOT)])
        m["boot_model_minus_const"] = (dconst[int(0.025 * N_BOOT)], dconst[int(0.975 * N_BOOT)])
        m["n_packages"] = len(pkgs)
        m["n_as_of"] = len(dates)
        # Per-tier Brier skill of model vs constant.
        tiers = {}
        for t in sorted({tier[r[0]] for r in rs}):
            sub = [r for r in rs if tier[r[0]] == t]
            ol = [r[5] for r in sub]
            tiers[t] = {
                "n": len(sub),
                "base_rate": sum(ol) / len(sub),
                "brier_model": metrics([r[2] for r in sub], ol)["brier"],
                "brier_const": metrics([r[4] for r in sub], ol)["brier"],
            }
        m["tiers"] = tiers
        # Split by 365-day qualifying history: zero (prior-only) vs any.
        hist_split = {}
        for label, pred in (("zero_history", lambda r: r[6] == 0), ("some_history", lambda r: r[6] > 0)):
            sub = [r for r in rs if pred(r)]
            if not sub:
                continue
            ol = [r[5] for r in sub]
            hist_split[label] = {
                "n": len(sub),
                "base_rate": sum(ol) / len(sub),
                "mean_pred_model": sum(r[2] for r in sub) / len(sub),
                "mean_pred_365": sum(r[3] for r in sub) / len(sub),
                "brier_model": metrics([r[2] for r in sub], ol)["brier"],
                "brier_const": metrics([r[4] for r in sub], ol)["brier"],
            }
        m["history_split"] = hist_split
        results[f"{D}d_thr{thr:g}"] = m

    (DATA / "results.json").write_text(json.dumps(results, indent=1, default=str))
    write_report(results, dates, names, events, sample)
    write_metrics(results, dates, names, events, sample)
    print_summary(results)


def write_metrics(results, dates, names, events, sample):
    """metrics.json in the same shape as backtest_pypi's output (cvss_min 5 and 7 only)."""
    cells, calib, tier_skill = [], {}, {}
    for k, m in results.items():
        D, thr = k.split("_thr")
        if float(thr) == 0:
            continue
        key = f"{D}_cvss>={float(thr):g}"
        mo, m3, mc = m["model"], m["365d_only"], m["constant"]
        cells.append({
            "window_days": int(D.rstrip("d")),
            "cvss_min": float(thr),
            "events": int(round(mo["base_rate"] * mo["n"])),
            "base_rate": mo["base_rate"],
            "brier_model": mo["brier"],
            "brier_const": mc["brier"],
            "brier_365d": m3["brier"],
            "auc_model": mo["auc"],
            "mean_pred_model": mo["mean_pred"],
            "observed": mo["base_rate"],
            "ece_model": mo["ece"],
            "ci_model_minus_const": list(m["boot_model_minus_const"]),
            "ci_model_minus_365d": list(m["boot_model_minus_365"]),
        })
        calib[key] = [{"predicted_mean": mp, "observed": mo_, "n": cnt}
                      for _, cnt, mp, mo_ in mo["calib_table"]]
        for t, v in m["tiers"].items():
            tier_skill.setdefault(t, {})[key] = 1 - v["brier_model"] / v["brier_const"]
    in_sample = {s["name"] for s in sample}
    n_events = sum(1 for pkg in in_sample for _ in events.get(pkg, []))
    pkgs_with = sum(1 for pkg in in_sample if events.get(pkg))
    out = {
        "model": "cve_hazard eco-shrink (features/contract_pricing.py), eco_rate per as-of from sampled events before T; 365d_only = eco_rate 0",
        "cells": cells,
        "calibration": calib,
        "tier_skill": tier_skill,
        "sample": {
            "packages": len(names),
            "packages_with_events": pkgs_with,
            "events_in_sample": n_events,
            "tiers": {t: sum(1 for s in sample if s["tier"] == t) for t in sorted({s["tier"] for s in sample})},
            "seed": SEED_SAMPLE,
        },
        "date_range": {
            "as_of_first": dates[0].isoformat(),
            "as_of_last": dates[-1].isoformat(),
            "as_of_dates": len(dates),
            "data_snapshot": END.isoformat(),
        },
        "sources": [
            "https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip",
            "https://registry.npmjs.org/-/v1/search",
            "https://api.npmjs.org/downloads/point/last-month/",
        ],
        "caveats": [
            "Event definition: OSV records with a CVE alias only; withdrawn and MAL records dropped.",
            "Look-ahead: single OSV snapshot; late-added advisories appear at their published date.",
            "Survivorship/selection: download tiers use current monthly downloads; sample is not a random draw.",
            "Constant baseline is a pool-wide Poisson rate over sampled packages (weak baseline).",
            "Model constants were tuned on 2024-04 to 2026-08 production data; this run starts in 2020.",
            "Dependence: overlapping as-of windows; bootstrap resamples packages, so CIs are approximate.",
            "Calibration bins are 10 equal-width bins; empty bins are omitted.",
            "Scope: npm only; MAL/EPSS/NO legs untested.",
        ],
    }
    (DATA / "metrics.json").write_text(json.dumps(out, indent=1))
    (HERE / "metrics.json").write_text(json.dumps(out, indent=1))


SEED_SAMPLE = 7


def fmt_p(x):
    return f"{x * 100:.2f}%"


def print_summary(results):
    for k, m in results.items():
        print(f"\n== {k}  n={m['model']['n']:,}  base={fmt_p(m['model']['base_rate'])}")
        for name in ("model", "365d_only", "constant"):
            r = m[name]
            print(f"  {name:10s} brier={r['brier']:.5f} logloss={r['logloss']:.4f} "
                  f"auc={r['auc']:.3f} ece={r['ece']:.4f} mean_pred={fmt_p(r['mean_pred'])}")
        print(f"  boot model-365 brier diff CI {tuple(round(x, 5) for x in m['boot_model_minus_365'])}")
        print(f"  boot model-const brier diff CI {tuple(round(x, 5) for x in m['boot_model_minus_const'])}")


def write_report(results, dates, names, events, sample):
    n_cve_pkgs = sum(1 for s in sample if s["has_cve_in_osv"])
    lines = []
    w = lines.append
    w("# npm CVE hazard model backtest — RESULTS")
    w("")
    w("Generated by `scripts/backtest/npm/backtest.py` from `data/`. Model under test is "
      "`features/contract_pricing.compute_cvss_probability` (imported, unmodified).")
    w("")
    w("## Setup")
    w("")
    w(f"- Packages: {len(names)} sampled npm packages, 5 popularity tiers x 50 (tiers by last-month downloads; "
      f"{n_cve_pkgs} of them have >=1 CVE in OSV).")
    w(f"- As-of dates: {len(dates)}, monthly from {dates[0]} to {dates[-1]} (every {STEP_DAYS} days); "
      f"outcomes observed through {END}.")
    w("- Horizons: 30 and 90 days. Event definitions: any CVE (threshold 0) and CVSS >= 7.")
    w(f"- Predictions: {len(names) * len(dates):,} per (horizon, threshold) combination.")
    w("- Walk-forward: at each as-of T the model sees only CVEs with publish date < T.")
    w("")
    w("## Headline metrics")
    w("")
    w("Brier and log loss: lower is better. Brier skill = 1 - Brier/Brier(constant); above 0 beats the constant baseline. "
      "AUC: ranking ability, 0.5 is chance. ECE: 10-bin expected calibration error. "
      "Brier CIs are 95% package-clustered bootstrap intervals for (model - baseline); "
      "negative means the model is better.")
    w("")
    w("| Event | Horizon | n | Base rate | Model Brier | 365d-only Brier | Constant Brier | Model skill vs const | Model logloss | 365d logloss | Const logloss | Model AUC | 365d AUC | Model ECE | Mean pred (model) | Brier diff vs 365d [95% CI] | Brier diff vs const [95% CI] |")
    w("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for k, m in results.items():
        D, thr = k.split("_thr")
        ev = "any CVE" if float(thr) == 0 else f"CVSS >= {float(thr):g}"
        mo, m3, mc = m["model"], m["365d_only"], m["constant"]
        skill = 1 - mo["brier"] / mc["brier"] if mc["brier"] > 0 else float("nan")
        lo, hi = m["boot_model_minus_365"]
        clo, chi = m["boot_model_minus_const"]
        w(f"| {ev} | {D} | {mo['n']:,} | {fmt_p(mo['base_rate'])} | {mo['brier']:.5f} | {m3['brier']:.5f} | "
          f"{mc['brier']:.5f} | {skill:+.3f} | {mo['logloss']:.4f} | {m3['logloss']:.4f} | {mc['logloss']:.4f} | "
          f"{mo['auc']:.3f} | {m3['auc']:.3f} | {mo['ece']:.4f} | {fmt_p(mo['mean_pred'])} | "
          f"{lo:+.5f} to {hi:+.5f} | {clo:+.5f} to {chi:+.5f} |")
    w("")
    w("## Calibration (model), 10 equal-width bins")
    w("")
    for k, m in results.items():
        w(f"### {k.replace('_thr', ' / threshold ').replace('d /', 'd,')}")
        w("")
        w("| Predicted bin | n | Mean predicted | Observed frequency |")
        w("|---|---|---|---|")
        for label, cnt, mp, mo_ in m["model"]["calib_table"]:
            w(f"| {label} | {cnt:,} | {fmt_p(mp)} | {fmt_p(mo_)} |")
        w("")
    w("## Per-tier Brier (model vs constant)")
    w("")
    w("| Config | Tier | n | Base rate | Model Brier | Constant Brier |")
    w("|---|---|---|---|---|---|")
    for k, m in results.items():
        for t, v in m["tiers"].items():
            w(f"| {k} | {t} | {v['n']:,} | {fmt_p(v['base_rate'])} | {v['brier_model']:.5f} | {v['brier_const']:.5f} |")
    w("")
    w("## Where the loss comes from: split by 365-day history")
    w("")
    w("| Config | History | n | Base rate | Model mean pred | 365d mean pred | Model Brier | Constant Brier |")
    w("|---|---|---|---|---|---|---|---|")
    for k, m in results.items():
        for h, v in m["history_split"].items():
            w(f"| {k} | {h} | {v['n']:,} | {fmt_p(v['base_rate'])} | {fmt_p(v['mean_pred_model'])} | "
              f"{fmt_p(v['mean_pred_365'])} | {v['brier_model']:.5f} | {v['brier_const']:.5f} |")
    w("")
    w("## Data sources")
    w("")
    w("- OSV npm bulk export: https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip (verified HTTP 200, "
      "~219 MB, ~230k advisories across npm). Advisory `published` date used as the point-in-time key.")
    w("- npm registry search: https://registry.npmjs.org/-/v1/search (name pool and current monthly downloads). "
      "Some queries rate-limited (HTTP 429) and were skipped; pool is 5,130 names.")
    w("- npm downloads: https://api.npmjs.org/downloads/point/last-month/ (monthly downloads for OSV-only unscoped names).")
    w("")
    w("## Caveats (read before quoting numbers)")
    w("")
    w("- Only advisories with a CVE alias are counted, and withdrawn advisories are dropped. This is a proxy for "
      "`cve_history`, not the production table. The OSV npm export is incomplete relative to NVD/CVE records.")
    w("- Event date = OSV `published` (advisory date), not CVE publication date.")
    w("- Popularity tiers use *current* downloads, which is survivorship and look-ahead: packages that are "
      "popular today were selected on the future. Quiet packages that later became popular or were abandoned "
      "are not represented correctly.")
    w("- The sample is 250 packages drawn from a pool that over-represents packages discovered through search "
      "terms and OSV names, and it is not a random draw from the npm registry. Results are not population estimates.")
    w("- The model constants (`HAZARD_*`, `HAZARD_W90`) were tuned on production data from 2024-04 to 2026-08. "
      "This backtest covers 2020 onward, so it is partly out-of-sample relative to the tuning window but not fully independent of the "
      "design choices.")
    w("- Unscored CVEs are treated as CVSS 5.0 (matching the model). CVSS is computed from the CVSS_V3 vector; "
      "entries without one fall back to the GHSA severity label.")
    w("- The constant baseline is a pool-wide Poisson rate over sampled packages. It is a weak, not strong, baseline; "
      "a stronger baseline would be a per-tier rate.")
    w("- Probabilities for a 90-day window are not independent across overlapping as-of dates (monthly steps overlap). "
      "Bootstrap CIs resample packages, not dates, so they are approximate.")
    w("- Calibration is judged on this sample only and was not checked against the live pricing path.")
    (HERE / "RESULTS.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
