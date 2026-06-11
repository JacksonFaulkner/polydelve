"""Featured contracts endpoint — home screen market data."""
from datetime import date

import duckdb
from fastapi import APIRouter, Depends

from api.cache import cache_get, cache_set
from features.db import get_db

router = APIRouter()


def _grade_letter(grade: float) -> str:
    """Map 0-10 package grade to letter. High grade = long odds = riskier bet."""
    for cutoff, letter in ((8, "A"), (6, "B"), (4, "C"), (2, "D")):
        if grade >= cutoff:
            return letter
    return "F"


def _market_title(package: str, cvss: float | None, epss: float | None, days: int) -> str:
    if cvss is not None:
        condition = f"a CVE with CVSS ≥ {cvss:g}"
    elif epss is not None:
        condition = f"a CVE reaching EPSS ≥ {epss:.0%}"
    else:
        condition = "a new CVE"
    return f"Will {package} get {condition} within {days} days?"


def _to_market(r: tuple) -> dict:
    """Shape a featured_contracts row into the frontend Market interface."""
    created = r[11].isoformat() if hasattr(r[11], "isoformat") else str(r[11])
    return {
        "id": r[0],
        "title": _market_title(r[1], r[3], r[4], r[6]),
        "description": "",
        "grade": _grade_letter(r[9]),
        "max_payout": r[7],
        "opening_probability": round(r[8], 4),
        "status": "open",
        "bet_count": 0,
        "relevancy_score": round(r[16], 3),
        "expires_at": r[10].isoformat() if r[10] else None,
        "created_at": created,
        "package": {
            "name": r[1],
            "ecosystem": r[2],
            "weekly_downloads": r[12],
            "epss_score": round(r[13], 4) if r[13] is not None else None,
            "has_mal_advisory": r[14],
            "logo_url": r[15],
        },
        "contract": {
            "cvss_threshold": r[3],
            "epss_threshold": r[4],
            "duration_days": r[6],
            "purchase_price": r[5],
        },
        "probability_history": [
            {"date": date.today().isoformat(), "prob": round(r[8], 4)}
        ],
        "events": [],
    }


@router.get("/featured-contracts")
def list_featured_contracts(
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> list[dict]:
    cache_key = "featured_contracts:open"
    if cached := cache_get(cache_key):
        return cached

    rows = conn.execute(
        """
        SELECT
            fc.id,
            fc.package_name,
            fc.package_ecosystem,
            fc.cvss_threshold,
            fc.epss_threshold,
            fc.purchase_price,
            fc.duration_days,
            fc.max_payout,
            fc.opening_probability,
            fc.package_grade,
            fc.expires_at,
            fc.created_at,
            p.weekly_downloads,
            p.epss_score,
            p.has_mal_advisory,
            p.logo_url,
            fc.relevancy_score
        FROM featured_contracts fc
        LEFT JOIN packages p ON p.name = fc.package_name AND p.ecosystem = fc.package_ecosystem
        WHERE fc.status = 'open'
        ORDER BY fc.relevancy_score DESC, fc.opening_probability DESC
        LIMIT 12
        """
    ).fetchall()

    result = [_to_market(r) for r in rows]

    cache_set(cache_key, result, ttl=60.0)
    return result
