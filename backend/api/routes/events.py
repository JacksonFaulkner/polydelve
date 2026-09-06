"""Security events ledger — a timeline of past CVE/EPSS/MAL events, each
labeled with the contract type it would have won: "if a contract like this
existed, it would've hit." Read-only, no thresholds are user-specific."""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query

from api.auth import get_browse_user
from api.pagination import PageParams, page_query, paginated_response
from features.db import get_db

router = APIRouter(prefix="/events", dependencies=[Depends(get_browse_user)])

# EPSS-spike events are read from the epss_crossings table (materialized by
# the epss ETL job / scripts/backfill_epss_crossings.py) instead of running a
# LAG() window scan over all of epss_history on every request — that scan
# alone took ~1.2s over 1.5M rows, twice per page load (count + page query).
_EVENTS_CTE = """
WITH cvss_events AS (
    SELECT name, ecosystem, cve_id, severity, cvss_score,
           published_date AS event_date, 'cvss'::text AS event_type
    FROM cve_history
    WHERE published_date IS NOT NULL
      AND (%(since)s::timestamptz IS NULL OR published_date >= %(since)s)
),
mal_events AS (
    SELECT name, ecosystem, NULL::text AS cve_id, NULL::text AS severity, NULL::float AS cvss_score,
           published_at AS event_date, 'mal'::text AS event_type
    FROM mal_advisories
    WHERE published_at IS NOT NULL AND NOT withdrawn
      AND (%(since)s::timestamptz IS NULL OR published_at >= %(since)s)
),
epss_events AS (
    SELECT name, ecosystem, NULL::text AS cve_id, NULL::text AS severity, epss_score AS cvss_score,
           crossed_at::timestamptz AS event_date, 'epss'::text AS event_type
    FROM epss_crossings
    WHERE %(since)s::timestamptz IS NULL OR crossed_at >= %(since)s
),
all_events AS (
    SELECT * FROM cvss_events
    UNION ALL SELECT * FROM mal_events
    UNION ALL SELECT * FROM epss_events
)
"""


def _since_for(window: str) -> datetime | None:
    return datetime.now(timezone.utc) - timedelta(days=30) if window == "dense" else None


@router.get("")
def list_events(
    window: str = Query("dense", pattern="^(dense|shallow)$"),
    page_params: PageParams = Depends(page_query),
    conn: Any = Depends(get_db),
) -> dict:
    """`dense` = last 30 days. `shallow` = all time. Both paginated."""
    params = {"since": _since_for(window)}

    cur = conn.cursor()
    cur.execute(_EVENTS_CTE + "SELECT count(*) FROM all_events", params)
    total = cur.fetchone()[0]

    cur.execute(
        _EVENTS_CTE + "SELECT * FROM all_events ORDER BY event_date DESC LIMIT %(limit)s OFFSET %(offset)s",
        {**params, "limit": page_params.page_size, "offset": page_params.offset},
    )
    rows = cur.fetchall()
    events = [
        {
            "name": r[0],
            "ecosystem": r[1],
            "cve_id": r[2],
            "severity": r[3],
            "score": r[4],
            "date": r[5].isoformat() if r[5] else None,
            "type": r[6],
        }
        for r in rows
    ]
    return {"window": window, **paginated_response(events, total, page_params)}
