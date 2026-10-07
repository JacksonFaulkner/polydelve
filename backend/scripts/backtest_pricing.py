"""
Backtest the CVE hazard model in features/contract_pricing.py against history.

For every tracked package and a grid of past start dates T, price a
hypothetical YES contract using only CVEs published on or before T, then check
whether a qualifying CVE actually landed in (T, T + D]. Reports Brier score
(vs. a constant-rate baseline), log loss, a calibration table by predicted
probability, and observed-vs-predicted by how busy the package's history was —
the last one answers "are quiet packages priced right?".

Run: uv run python scripts/backtest_pricing.py [--months 30] [--step-days 30]
"""
from __future__ import annotations

import argparse
import math
import random
import sys
from bisect import bisect_right
from collections import defaultdict
from datetime import date, timedelta

sys.path.insert(0, ".")

from features.contract_pricing import compute_cvss_probability
from features.db import get_db_conn

DURATIONS = (7, 14, 30)
THRESHOLDS = (5.0, 7.0)


def load_histories(conn, max_quiet: int) -> dict[tuple[str, str], list[tuple[date, float | None]]]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT name, ecosystem, published_date::date, cvss_score
        FROM cve_history
        WHERE published_date IS NOT NULL
        ORDER BY published_date
        """
    )
    hist: dict[tuple[str, str], list[tuple[date, float | None]]] = defaultdict(list)
    for name, eco, pub, cvss in cur.fetchall():
        hist[(name, eco)].append((pub, float(cvss) if cvss is not None else None))

    # Packages with no CVE ever are the bulk of the catalog; sample them so the
    # "quiet" bucket is represented without dominating the run.
    cur.execute("SELECT name, ecosystem FROM packages WHERE ecosystem IN ('npm', 'PyPI')")
    quiet = [k for k in cur.fetchall() if k not in hist]
    random.seed(7)
    for k in random.sample(quiet, min(max_quiet, len(quiet))):
        hist[k] = []
    return hist


def run(conn, months: int, step_days: int, max_quiet: int) -> None:
    hist = load_histories(conn, max_quiet)
    today = date.today()
    last_start = today - timedelta(days=max(DURATIONS))
    starts = [last_start - timedelta(days=i) for i in range(0, months * 30, step_days)]

    # per (duration, threshold): list of (p, outcome, k365)
    samples: dict[tuple[int, float], list[tuple[float, int, int]]] = defaultdict(list)

    for (_, _), rows in hist.items():
        dates = [r[0] for r in rows]
        for T in starts:
            cut = bisect_right(dates, T)
            past = [((T - d).days, c) for d, c in rows[:cut] if (T - d).days <= 365]
            future = rows[cut:]
            for thr in THRESHOLDS:
                k365 = sum(1 for _, c in past if (5.0 if c is None else c) >= thr)
                for D in DURATIONS:
                    p = compute_cvss_probability(past, thr, D)
                    end = T + timedelta(days=D)
                    hit = any(d <= end and (5.0 if c is None else c) >= thr for d, c in future)
                    samples[(D, thr)].append((p, int(hit), k365))

    print(f"packages={len(hist)}  start dates={len(starts)}  "
          f"({starts[-1]} → {starts[0]}, every {step_days}d)\n")

    for (D, thr), rows in sorted(samples.items()):
        n = len(rows)
        base = sum(o for _, o, _ in rows) / n
        brier = sum((p - o) ** 2 for p, o, _ in rows) / n
        brier_base = sum((base - o) ** 2 for _, o, _ in rows) / n
        eps = 1e-6
        logloss = -sum(o * math.log(p + eps) + (1 - o) * math.log(1 - p + eps) for p, o, _ in rows) / n
        skill = 1 - brier / brier_base if brier_base > 0 else float("nan")
        print(f"=== duration {D:2}d, CVSS >= {thr}  (n={n:,}, base rate {base:.3%})")
        print(f"    Brier {brier:.4f}  vs constant {brier_base:.4f}  →  skill {skill:+.3f}   logloss {logloss:.4f}")

        # Calibration by predicted-probability bucket
        buckets: dict[str, list[tuple[float, int]]] = defaultdict(list)
        edges = [0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.01]
        for p, o, _ in rows:
            for lo, hi in zip(edges, edges[1:]):
                if lo <= p < hi:
                    buckets[f"{lo:.2f}–{min(hi, 1):.2f}"].append((p, o))
                    break
        print("    predicted bucket   n       mean pred   observed")
        for label in [f"{lo:.2f}–{min(hi, 1):.2f}" for lo, hi in zip(edges, edges[1:])]:
            b = buckets.get(label)
            if not b:
                continue
            mp = sum(p for p, _ in b) / len(b)
            mo = sum(o for _, o in b) / len(b)
            flag = "" if abs(mp - mo) < 0.03 else ("  ▲ under" if mo > mp else "  ▼ over")
            print(f"    {label:<16} {len(b):>7,}   {mp:8.3%}   {mo:8.3%}{flag}")

        # Quiet vs busy history: is the payout for quiet packages fair?
        tiers = [(0, 0, "0 CVEs/365d"), (1, 1, "1"), (2, 3, "2–3"), (4, 9, "4–9"), (10, 10**9, "10+")]
        print("    history tier       n       mean pred   observed   fair mult   model mult")
        for lo, hi, label in tiers:
            b = [(p, o) for p, o, k in rows if lo <= k <= hi]
            if not b:
                continue
            mp = sum(p for p, _ in b) / len(b)
            mo = sum(o for _, o in b) / len(b)
            fair = (1 / mo) if mo > 0 else float("inf")
            print(f"    {label:<16} {len(b):>7,}   {mp:8.3%}   {mo:8.3%}   {fair:8.1f}×   {1 / mp:8.1f}×")
        print()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=30, help="how far back to sample start dates")
    ap.add_argument("--step-days", type=int, default=30, help="spacing between start dates")
    ap.add_argument("--max-quiet", type=int, default=3000, help="sample size of zero-CVE packages")
    args = ap.parse_args()
    conn = get_db_conn()
    try:
        run(conn, args.months, args.step_days, args.max_quiet)
    finally:
        conn.close()
