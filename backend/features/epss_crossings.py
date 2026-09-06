"""Shared EPSS-spike-crossing logic: what counts as a "spike" event and how
it's recorded. Used by the epss ETL job (writes) and the events ledger (reads
epss_crossings directly instead of recomputing this over all of epss_history)."""
from datetime import date
from typing import Any

# Reference threshold for what counts as an "EPSS spike" event — not tied to
# any specific contract's epss_threshold, just a reasonable line for "this
# package's exploit probability got real."
EPSS_SPIKE_THRESHOLD = 0.5


def record_crossing_if_applicable(
    cur: Any, name: str, ecosystem: str, prev_score: float | None, new_score: float, day: date,
) -> None:
    """Insert an epss_crossings row iff `new_score` just crossed the threshold
    from below (or this is the first-ever recorded score and it's already
    above threshold)."""
    crossed = new_score >= EPSS_SPIKE_THRESHOLD and (prev_score is None or prev_score < EPSS_SPIKE_THRESHOLD)
    if not crossed:
        return
    cur.execute(
        """
        INSERT INTO epss_crossings (name, ecosystem, epss_score, crossed_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (name, ecosystem, crossed_at) DO NOTHING
        """,
        [name, ecosystem, new_score, day],
    )
