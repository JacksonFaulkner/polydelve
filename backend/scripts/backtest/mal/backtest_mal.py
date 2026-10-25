"""
Point-in-time backtest of "new MAL advisory in next D days" for npm and PyPI.

Data: OSV bulk zips (npm/all.zip, PyPI/all.zip), cached under ./data/.
Timestamps are each advisory's `published` month. Only non-withdrawn MAL-*
advisories are events. The universe at anchor month t is every package named
in any OSV advisory first published before t. Packages that first appear
inside a window are "out-of-universe" events: no model here can price them.

Models (all use only information dated before the anchor month t):
  const        -- ecosystem monthly hazard h_t, expanding window over all
                  prior (universe package, month) exposure. Time-varying,
                  not constant over the sample; the name is historical.
  pkg_a<alpha> -- per-package gamma-Poisson hazard shrunk to h_t:
                  lambda_p = (k_p + alpha*h_t) / (e_p + alpha), with
                  k_p = prior MAL months for p, e_p = months observed since
                  first advisory. Monthly hazard converted to horizon D.

Alpha (prior strength, pseudo-months) is chosen by log loss on TUNE anchors
(before HOLDOUT_START) and then scored on HOLDOUT anchors. Holdout numbers
are the headline; tune numbers are shown only for transparency.

Horizons: D=30 (one month) and D=90 (three months). Outcome = any non-withdrawn
MAL advisory for the package published in the horizon months.

Outputs: ./metrics.json (schema: model, metrics, sample, date_range, sources,
caveats). Run:  python3 backtest_mal.py   (stdlib only; ~1-2 min)
"""
from __future__ import annotations

import bisect
import json
import math
import random
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = HERE / "metrics.json"

BULK = {
    "npm": ("npm_all.zip", "https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip"),
    "PyPI": ("pypi_all.zip", "https://osv-vulnerabilities.storage.googleapis.com/PyPI/all.zip"),
}
SOURCES = [
    "https://osv-vulnerabilities.storage.googleapis.com/npm/all.zip",
    "https://osv-vulnerabilities.storage.googleapis.com/PyPI/all.zip",
    "https://github.com/ossf/malicious-packages",
    "https://osv.dev/",
    "https://github.blog/security/supply-chain-security/how-we-took-malware-advisories-beyond-npm/",
    "https://www.reversinglabs.com/blog/operation-brainleeches-malicious-npm-packages-fuel-supply-chain-and-phishing-attacks",
]
HORIZONS = (30, 90)
ALPHA_GRID = (12.0, 60.0, 300.0, 1500.0, 6000.0, 30000.0, 150000.0)
EVAL_START = (2022, 1)     # first anchor: 12 months of history
HOLDOUT_START = (2024, 1)  # tune on anchors before this, score on/after
ANCHOR_END = (2026, 7)     # last anchor; its 90-day window ends 2026-09-30
BOOT_REPS = 2000
EPS = 1e-12
CAL_EDGES = [0.0, 1e-4, 1e-3, 3e-3, 1e-2, 3e-2, 0.1, 0.3, 1.0001]
N_AUC_BINS = 160           # log10 bins from 1e-8 to 1


def mi(y: int, m: int) -> int:
    return y * 12 + (m - 1)


def ym(idx: int) -> str:
    return f"{idx // 12}-{idx % 12 + 1:02d}"


def alpha_name(a: float) -> str:
    return f"pkg_a{int(a)}"


MODELS = ("const", "stratum") + tuple(alpha_name(a) for a in ALPHA_GRID)


def ensure_zip(eco: str) -> Path:
    fname, url = BULK[eco]
    path = DATA / fname
    if not path.exists():
        DATA.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}", flush=True)
        tmp = path.with_suffix(".part")
        with urllib.request.urlopen(url, timeout=900) as r, open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        tmp.rename(path)
    return path


def norm_name(eco: str, name: str) -> str:
    name = name.strip()
    if eco == "PyPI":
        return re.sub(r"[-_.]+", "-", name).lower()
    return name


def parse_month(s: str | None) -> int | None:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return mi(d.year, d.month)


def load_eco(eco: str):
    """Return (first_seen, mal_months, n_mal, n_withdrawn)."""
    path = ensure_zip(eco)
    first_seen: dict[str, int] = {}
    mal_months: dict[str, set[int]] = defaultdict(set)
    n_mal = n_withdrawn = 0
    with zipfile.ZipFile(path) as zf:
        for name in zf.namelist():
            if not name.endswith(".json"):
                continue
            try:
                d = json.loads(zf.read(name))
            except Exception:
                continue
            osv_id = d.get("id", "")
            m = parse_month(d.get("published"))
            if m is None:
                continue
            is_mal = osv_id.startswith("MAL-")
            withdrawn = d.get("withdrawn") is not None
            for aff in d.get("affected", []) or []:
                pkg = aff.get("package") or {}
                if (pkg.get("ecosystem") or "").lower() != eco.lower():
                    continue
                pname = norm_name(eco, pkg.get("name") or "")
                if not pname:
                    continue
                if pname not in first_seen or m < first_seen[pname]:
                    first_seen[pname] = m
                if is_mal:
                    if withdrawn:
                        n_withdrawn += 1
                    else:
                        n_mal += 1
                        mal_months[pname].add(m)
    return first_seen, mal_months, n_mal, n_withdrawn


def auc_from_bins(pos: list[int], neg: list[int]) -> float | None:
    P, N = sum(pos), sum(neg)
    if P == 0 or N == 0:
        return None
    below_pos = 0
    num = 0.0
    for b in range(len(pos)):
        num += neg[b] * (below_pos + 0.5 * pos[b])
        below_pos += pos[b]
    return num / (P * N)


def score_bin(p: float) -> int:
    p = min(max(p, 1e-8), 1.0)
    b = int((math.log10(p) + 8.0) * (N_AUC_BINS / 8.0))
    return min(max(b, 0), N_AUC_BINS - 1)


def cal_bin(p: float) -> int:
    for i in range(len(CAL_EDGES) - 1):
        if CAL_EDGES[i] <= p < CAL_EDGES[i + 1]:
            return i
    return len(CAL_EDGES) - 2


def new_acc():
    nb = len(CAL_EDGES) - 1
    return {
        "n": 0, "pos": 0, "brier": 0.0, "ll": 0.0, "psum": 0.0,
        "auc_pos": [0] * N_AUC_BINS, "auc_neg": [0] * N_AUC_BINS,
        "cal_n": [0] * nb, "cal_p": [0.0] * nb, "cal_y": [0] * nb,
    }


def add(acc, p: float, y: int):
    acc["n"] += 1
    acc["pos"] += y
    acc["psum"] += p
    acc["brier"] += (p - y) ** 2
    pc = min(max(p, EPS), 1 - EPS)
    acc["ll"] += -(y * math.log(pc) + (1 - y) * math.log(1 - pc))
    b = score_bin(p)
    if y:
        acc["auc_pos"][b] += 1
    else:
        acc["auc_neg"][b] += 1
    c = cal_bin(p)
    acc["cal_n"][c] += 1
    acc["cal_p"][c] += p
    acc["cal_y"][c] += y


def univ_end_index(pkgs: list[str], first_seen: dict[str, int], t: int) -> int:
    """pkgs sorted by first_seen; return count with first_seen < t."""
    lo, hi = 0, len(pkgs)
    while lo < hi:
        mid = (lo + hi) // 2
        if first_seen[pkgs[mid]] < t:
            lo = mid + 1
        else:
            hi = mid
    return lo


def run_eco(eco: str):
    first_seen, mal_months, n_mal, n_withdrawn = load_eco(eco)
    print(f"{eco}: {len(first_seen)} packages, {n_mal} non-withdrawn MAL rows, "
          f"{n_withdrawn} withdrawn MAL rows", flush=True)

    first_month = mi(*EVAL_START)
    last_month = mi(*ANCHOR_END) + max(HORIZONS) // 30
    start_month = min(first_seen.values())

    # Ecosystem-level monthly exposure and in-universe events (for const).
    fs_count = defaultdict(int)
    for fs in first_seen.values():
        fs_count[fs] += 1
    ev_in_univ = defaultdict(int)
    for p, months in mal_months.items():
        fs = first_seen[p]
        for s in months:
            if fs < s:
                ev_in_univ[s] += 1
    cum_exp: dict[int, int] = {}
    cum_ev: dict[int, int] = {}
    e_tot = v_tot = 0
    running = 0
    for s in range(start_month, last_month + 1):
        cum_exp[s] = e_tot
        cum_ev[s] = v_tot
        e_tot += running
        v_tot += ev_in_univ.get(s, 0)
        running += fs_count.get(s, 0)

    sorted_months = {p: sorted(m) for p, m in mal_months.items()}
    pkgs = sorted(first_seen, key=lambda p: first_seen[p])
    holdout_t0 = mi(*HOLDOUT_START)

    # Stratum monthly hazard (prior-MAL vs none), cumulative over months < t only.
    s_exp = {"prior_mal": defaultdict(int), "no_prior_mal": defaultdict(int)}
    s_ev = {"prior_mal": defaultdict(int), "no_prior_mal": defaultdict(int)}
    for p in pkgs:
        fs = first_seen[p]
        ms = sorted_months.get(p, [])
        mset = set(ms)
        for s in range(fs + 1, last_month + 1):
            k = bisect.bisect_left(ms, s)
            key = "prior_mal" if k > 0 else "no_prior_mal"
            s_exp[key][s] += 1
            if s in mset:
                s_ev[key][s] += 1
    s_cum = {}
    for key in s_exp:
        cum_e = cum_v = 0
        table = {}
        for s in range(start_month, last_month + 1):
            table[s] = (cum_e, cum_v)  # sums over months < s
            cum_e += s_exp[key].get(s, 0)
            cum_v += s_ev[key].get(s, 0)
        s_cum[key] = table

    agg = {}     # (D, model, period) -> acc
    out_univ = {}  # (D, period) -> count of out-of-universe events
    strata = defaultdict(lambda: [0, 0, 0.0])  # (D, period, stratum) -> [n, pos, sum const pred]
    per_anchor = {}  # (D, period) -> list of {model: (brier_sum, n)} per anchor
    hazards = []
    for D in HORIZONS:
        for period in ("tune", "holdout"):
            out_univ[(D, period)] = 0
            per_anchor[(D, period)] = []
            for m in MODELS:
                agg[(D, m, period)] = new_acc()

    for t in range(first_month, mi(*ANCHOR_END) + 1):
        if cum_exp.get(t, 0) == 0:
            continue
        period = "holdout" if t >= holdout_t0 else "tune"
        h = cum_ev[t] / cum_exp[t]
        hazards.append((ym(t), h))
        u_end = univ_end_index(pkgs, first_seen, t)
        for D in HORIZONS:
            H = D // 30
            lam_eco = -math.log(max(1.0 - h, 1e-12))
            for p in pkgs[:u_end]:
                ms = sorted_months.get(p)
                lo = bisect.bisect_left(ms, t) if ms else 0
                hi = bisect.bisect_left(ms, t + H) if ms else 0
                y = 1 if hi > lo else 0
                k_p = lo  # MAL months strictly before t
                e_p = t - first_seen[p]  # months observed since first advisory
                pc_const = 1.0 - math.exp(-lam_eco * H)
                add(agg[(D, "const", period)], pc_const, y)
                stratum = "prior_mal" if k_p > 0 else "no_prior_mal"
                st = strata[(D, period, stratum)]
                st[0] += 1
                st[1] += y
                st[2] += pc_const
                se, sv = s_cum[stratum][t]
                h_str = sv / se if se else h
                add(agg[(D, "stratum", period)], 1.0 - math.exp(-(-math.log(max(1.0 - h_str, 1e-12))) * H), y)
                for a in ALPHA_GRID:
                    lam = (k_p + a * h) / (e_p + a)
                    pr = 1.0 - math.exp(-lam * H)
                    add(agg[(D, alpha_name(a), period)], pr, y)
            # Cumulative Brier/n snapshot per model; differenced later for block bootstrap.
            per_anchor[(D, period)].append({m: (agg[(D, m, period)]["brier"], agg[(D, m, period)]["n"])
                                            for m in MODELS})
            # Events from packages not yet in the universe (first advisory inside window).
            new_events = 0
            for p in pkgs[u_end:]:
                ms = sorted_months.get(p)
                if ms and bisect.bisect_left(ms, t + H) > bisect.bisect_left(ms, t):
                    new_events += 1
            out_univ[(D, period)] += new_events
    return {
        "n_packages": len(first_seen),
        "n_mal_rows": n_mal,
        "n_withdrawn_rows": n_withdrawn,
        "agg": agg,
        "out_univ": out_univ,
        "per_anchor": per_anchor,
        "hazards": hazards,
        "strata": dict(strata),
    }


def anchor_brier_sums(per_anchor_list, model: str):
    """Convert cumulative per-anchor (brier, n) to per-anchor increments."""
    out = []
    prev_b, prev_n = 0.0, 0
    for row in per_anchor_list:
        b, n = row[model]
        out.append((b - prev_b, n - prev_n))
        prev_b, prev_n = b, n
    return out


def bootstrap_skill(res, D: int, model: str, rng: random.Random):
    base = anchor_brier_sums(res["per_anchor"][(D, "holdout")], "const")
    mod = anchor_brier_sums(res["per_anchor"][(D, "holdout")], model)
    n = len(base)
    if n == 0:
        return None
    stats = []
    for _ in range(BOOT_REPS):
        idx = [rng.randrange(n) for _ in range(n)]
        bc = sum(base[i][0] for i in idx)
        bm = sum(mod[i][0] for i in idx)
        if bc > 0:
            stats.append(1.0 - bm / bc)
    if not stats:
        return None
    stats.sort()
    return stats[int(0.025 * len(stats))], stats[min(int(0.975 * len(stats)), len(stats) - 1)]


def summarize(eco: str, res: dict, rng: random.Random, metrics: dict, sample: dict):
    # Choose alpha on tune-period log loss (pooled over horizons, per ecosystem).
    tune_ll = {a: 0.0 for a in ALPHA_GRID}
    for a in ALPHA_GRID:
        for D in HORIZONS:
            acc = res["agg"][(D, alpha_name(a), "tune")]
            tune_ll[a] += acc["ll"] / acc["n"] if acc["n"] else 0.0
    best_alpha = min(ALPHA_GRID, key=lambda a: tune_ll[a])
    best = alpha_name(best_alpha)
    sample[f"{eco}_tune_logloss_by_alpha"] = {str(int(a)): tune_ll[a] / len(HORIZONS) for a in ALPHA_GRID}
    sample[f"{eco}_chosen_alpha"] = best_alpha

    for D in HORIZONS:
        for m_label, m in (("const", "const"), ("stratum", "stratum"), ("pkg_bayes", best)):
            acc = res["agg"][(D, m, "holdout")]
            n = acc["n"]
            key = f"{eco}_d{D}_{m_label}"
            metrics[f"{key}_brier"] = acc["brier"] / n
            metrics[f"{key}_logloss"] = acc["ll"] / n
            metrics[f"{key}_auc"] = auc_from_bins(acc["auc_pos"], acc["auc_neg"])
            metrics[f"{key}_mean_pred"] = acc["psum"] / n
            sample[f"{eco}_calibration_d{D}_{m_label}_holdout"] = [
                {"bin_lo": CAL_EDGES[i], "bin_hi": min(CAL_EDGES[i + 1], 1.0), "n": acc["cal_n"][i],
                 "mean_pred": (acc["cal_p"][i] / acc["cal_n"][i]) if acc["cal_n"][i] else None,
                 "obs_rate": (acc["cal_y"][i] / acc["cal_n"][i]) if acc["cal_n"][i] else None}
                for i in range(len(acc["cal_n"]))
            ]
        cacc = res["agg"][(D, "const", "holdout")]
        metrics[f"{eco}_d{D}_holdout_positive_labels"] = cacc["pos"]
        metrics[f"{eco}_d{D}_holdout_pkg_windows"] = cacc["n"]
        metrics[f"{eco}_d{D}_holdout_base_rate"] = cacc["pos"] / cacc["n"]
        metrics[f"{eco}_d{D}_holdout_out_of_universe_events"] = res["out_univ"][(D, "holdout")]
        bc = cacc["brier"]
        for label, model in (("stratum", "stratum"), ("pkg_bayes", best)):
            bm = res["agg"][(D, model, "holdout")]["brier"]
            metrics[f"{eco}_d{D}_brier_skill_{label}_vs_const"] = 1.0 - bm / bc if bc else None
            ci = bootstrap_skill(res, D, model, rng)
            if ci:
                metrics[f"{eco}_d{D}_brier_skill_{label}_vs_const_ci95_lo"] = ci[0]
                metrics[f"{eco}_d{D}_brier_skill_{label}_vs_const_ci95_hi"] = ci[1]
        sample[f"{eco}_d{D}_tune_pos_labels"] = res["agg"][(D, "const", "tune")]["pos"]
        sample[f"{eco}_d{D}_tune_out_of_universe_events"] = res["out_univ"][(D, "tune")]
    sample[f"{eco}_strata_holdout"] = {
        f"d{D}_{stratum}": {
            "pkg_windows": v[0], "positives": v[1],
            "obs_rate": v[1] / v[0] if v[0] else None,
            "mean_const_pred": v[2] / v[0] if v[0] else None,
        }
        for (D, period, stratum), v in res["strata"].items() if period == "holdout"
    }
    sample[f"{eco}_packages_in_osv"] = res["n_packages"]
    sample[f"{eco}_mal_rows_nonwithdrawn"] = res["n_mal_rows"]
    sample[f"{eco}_mal_rows_withdrawn"] = res["n_withdrawn_rows"]
    sample[f"{eco}_hazard_monthly_const"] = [{"month": m, "h": h} for m, h in res["hazards"]]


def main() -> int:
    metrics: dict = {}
    sample: dict = {}
    rng = random.Random(20261022)
    for eco in ("npm", "PyPI"):
        res = run_eco(eco)
        summarize(eco, res, rng, metrics, sample)
    sample["windows"] = {
        "eval_start": ym(mi(*EVAL_START)), "holdout_start": ym(mi(*HOLDOUT_START)),
        "eval_end_anchor": ym(mi(*ANCHOR_END)), "alpha_grid": list(ALPHA_GRID),
        "bootstrap_reps": BOOT_REPS,
    }
    caveats = [
        "Very few in-universe events: holdout positives are a few dozen package-window hits "
        "(see *_holdout_positive_labels). Events cluster in campaigns, so the effective sample "
        "is smaller still. Significance is weak; treat CIs as rough.",
        "Most MAL events are out-of-universe: the package's first advisory lands inside the "
        "window. Neither model can price those, so the reported base rates describe only "
        "packages already listed in OSV before the anchor.",
        "Universe = packages named in any OSV advisory in the bulk zip. npm GHSA entries are a "
        "small share, so the universe is mostly MAL-listed packages; it is not the registry.",
        "The OSV zip is a 2026-10 snapshot. Published dates are used, but withdrawals and "
        "re-listings after each anchor are not reconstructed.",
        "Alpha is chosen on tune-period (pre-2024) log loss and then scored on holdout. Holdout "
        "is still one period; the choice is not re-validated across regimes.",
        "The const model is an expanding-window monthly hazard per ecosystem, not a fixed "
        "constant; it is a baseline, not a market price.",
        "Bootstrap resamples evaluation months (anchors) and ignores within-month correlation "
        "between packages, so intervals are optimistic if campaigns cluster across packages.",
    ]
    result = {
        "model": "mal_hazard_gamma_poisson_v2",
        "metrics": metrics,
        "sample": sample,
        "date_range": ["2022-01-01", "2026-09-30"],
        "sources": SOURCES,
        "caveats": caveats,
    }
    OUT.write_text(json.dumps(result, indent=2))
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
