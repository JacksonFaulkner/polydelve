"""
One-time backfill: populate epss_crossings from existing epss_history so the
events ledger doesn't have to run a LAG() window scan over all of
epss_history on every request. Safe to re-run (ON CONFLICT DO NOTHING).

Run: uv run python scripts/backfill_epss_crossings.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from features.db import get_db_conn  # noqa: E402
from features.epss_crossings import EPSS_SPIKE_THRESHOLD  # noqa: E402


def main() -> None:
    conn = get_db_conn(autocommit=True)
    cur = conn.cursor()
    cur.execute(
        """
        WITH crossings AS (
            SELECT name, ecosystem, epss_score, recorded_at,
                   LAG(epss_score) OVER (PARTITION BY name, ecosystem ORDER BY recorded_at) AS prev_score
            FROM epss_history
        )
        INSERT INTO epss_crossings (name, ecosystem, epss_score, crossed_at)
        SELECT name, ecosystem, epss_score, recorded_at
        FROM crossings
        WHERE epss_score >= %s AND (prev_score IS NULL OR prev_score < %s)
        ON CONFLICT (name, ecosystem, crossed_at) DO NOTHING
        """,
        [EPSS_SPIKE_THRESHOLD, EPSS_SPIKE_THRESHOLD],
    )
    print(f"[backfill_epss_crossings] inserted {cur.rowcount} rows", flush=True)


if __name__ == "__main__":
    main()
