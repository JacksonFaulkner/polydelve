"""Build a per-CVE daily EPSS panel from the cached FIRST daily CSV.gz files.

Candidate CVEs = seeded random sample of up to 5000 CVEs with latest EPSS >= 0.01
plus up to 2000 random CVEs from the rest (keeps the panel small; the full
universe is ~390k CVEs and ~150k have EPSS >= 0.01).
Output: data/panel.tsv.gz with columns: cve, date, epss  (only sampled CVEs).

Usage (from backend/):
  uv run python scripts/backtest/epss/build_panel.py
"""
import argparse
import csv
import gzip
import random
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
RAW = HERE / "data" / "raw"
OUT = HERE / "data" / "panel.tsv.gz"


def read_day(path: Path) -> dict[str, float]:
    out: dict[str, float] = {}
    with gzip.open(path, "rt") as f:
        next(f)
        for row in csv.DictReader(f):
            try:
                out[row["cve"]] = float(row["epss"])
            except (KeyError, ValueError):
                pass
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample-rest", type=int, default=2000)
    ap.add_argument("--sample-hot", type=int, default=5000)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    files = sorted(RAW.glob("epss_*.csv.gz"))
    days = [date.fromisoformat(p.name[5:15]) for p in files]
    latest = read_day(files[-1])
    rng = random.Random(args.seed)
    hot = sorted(c for c, s in latest.items() if s >= 0.01)
    rest = sorted(c for c, s in latest.items() if s < 0.01)
    cands = set(rng.sample(hot, min(args.sample_hot, len(hot))))
    cands |= set(rng.sample(rest, min(args.sample_rest, len(rest))))
    print(f"days={len(days)} {days[0]}..{days[-1]} candidates={len(cands)} "
          f"(hot pool={len(hot)}, rest pool={len(rest)})", flush=True)

    with gzip.open(OUT, "wt") as out:
        out.write("cve\tdate\tepss\n")
        for p, d in zip(files, days):
            scores = read_day(p)
            for c in cands:
                s = scores.get(c)
                if s is not None:
                    out.write(f"{c}\t{d.isoformat()}\t{s:.5f}\n")
    print(f"wrote {OUT}", flush=True)


if __name__ == "__main__":
    main()
