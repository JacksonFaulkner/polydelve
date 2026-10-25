"""Download FIRST daily EPSS snapshots (CSV.gz) for a date range.

Same URL pattern as scripts/ingest_epss_history.py (BULK_URL). Files are cached
under data/raw/ and skipped when already present.

Usage (from backend/):
  uv run python scripts/backtest/epss/fetch_history.py --start 2025-01-01 --end 2026-10-20
"""
import argparse
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import httpx

BULK_URL = "https://epss.empiricalsecurity.com/epss_scores-{date}.csv.gz"
RAW_DIR = Path(__file__).parent / "data" / "raw"


def fetch_one(day: date) -> tuple[date, str]:
    dest = RAW_DIR / f"epss_{day.isoformat()}.csv.gz"
    if dest.exists() and dest.stat().st_size > 1000:
        return day, "cached"
    try:
        r = httpx.get(BULK_URL.format(date=day.isoformat()), timeout=60, follow_redirects=True)
        r.raise_for_status()
        tmp = dest.with_suffix(".part")
        tmp.write_bytes(r.content)
        tmp.rename(dest)
        return day, "ok"
    except Exception as e:  # noqa: BLE001
        return day, f"missing: {e}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default="2025-01-01")
    ap.add_argument("--end", default=(date.today() - timedelta(days=1)).isoformat())
    ap.add_argument("--workers", type=int, default=12)
    args = ap.parse_args()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    s, e = date.fromisoformat(args.start), date.fromisoformat(args.end)
    days = [s + timedelta(days=i) for i in range((e - s).days + 1)]
    counts: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for fut in as_completed([pool.submit(fetch_one, d) for d in days]):
            _, status = fut.result()
            key = status.split(":")[0]
            counts[key] = counts.get(key, 0) + 1
            if status.startswith("missing"):
                print(f"  {fut.result()[0]} {status}", file=sys.stderr, flush=True)
    print(f"days={len(days)} {counts}", flush=True)


if __name__ == "__main__":
    main()
