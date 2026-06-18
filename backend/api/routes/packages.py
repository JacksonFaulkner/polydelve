from datetime import date, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from api.auth import get_current_user
from api.cache import cache_get, cache_set
from features.db import get_db
from features.packages_repo import (
    count_packages as repo_count_packages,
    get_cve_history as repo_get_cve_history,
    get_epss_history as repo_get_epss_history,
    get_package as repo_get_package,
    get_package_news as repo_get_package_news,
    list_packages as repo_list_packages,
)

router = APIRouter(prefix="/packages", dependencies=[Depends(get_current_user)])


@router.get("")
def list_packages(
    ecosystem: Literal["PyPI", "npm"] | None = None,
    sector: str | None = None,
    has_cves: bool | None = None,
    latest_cve_days: int | None = Query(None, ge=1, description="Only packages with a CVE in the last N days"),
    search: str | None = Query(None, max_length=100, description="Filter by package name prefix"),
    sort: Literal["risk_score", "weekly_downloads", "epss_score", "num_cves"] = "risk_score",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    conn: Any = Depends(get_db),
) -> dict:
    cache_key = f"packages:{ecosystem}:{sector}:{has_cves}:{latest_cve_days}:{search}:{sort}:{page}:{page_size}"
    if cached := cache_get(cache_key):
        return cached
    filters = ["p.ecosystem IN ('PyPI', 'npm')"]
    params: list = []

    if ecosystem:
        filters.append("p.ecosystem = %s")
        params.append(ecosystem)
    if sector:
        filters.append("%s = ANY(p.sectors)")
        params.append(sector)
    if has_cves is True:
        filters.append("cardinality(p.cve_ids) > 0")
    elif has_cves is False:
        filters.append("(p.cve_ids IS NULL OR cardinality(p.cve_ids) = 0)")
    if search:
        filters.append("p.name ILIKE %s")
        params.append(f"%{search}%")
    if latest_cve_days is not None:
        cutoff = (date.today() - timedelta(days=latest_cve_days)).isoformat()
        filters.append(
            "EXISTS (SELECT 1 FROM cve_history ch WHERE ch.name = p.name AND ch.ecosystem = p.ecosystem AND ch.published_date >= %s)"
        )
        params.append(cutoff)

    where = " AND ".join(filters)

    sort_col = {
        "risk_score": "p.risk_score",
        "weekly_downloads": "p.weekly_downloads",
        "epss_score": "p.epss_score",
        "num_cves": "cardinality(p.cve_ids)",
    }[sort]

    offset = (page - 1) * page_size

    total = repo_count_packages(conn, where, params)
    rows = repo_list_packages(conn, where, params, sort_col, page_size, offset)

    result = {
        "total": total,
        "page": page,
        "page_size": page_size,
        "packages": [
            {
                "name": r[0],
                "ecosystem": r[1],
                "weekly_downloads": r[2],
                "epss_score": round(r[3], 4) if r[3] is not None else None,
                "risk_score": round(r[4], 2) if r[4] is not None else None,
                "has_mal_advisory": r[5],
                "sectors": r[6] or [],
                "logo_url": r[7],
                "num_cves": r[8] or 0,
                "news_mentions": r[9],
                "latest_cve_date": r[10].date().isoformat() if r[10] else None,
                "worst_severity": r[11],
                "max_cvss_score": round(r[12], 1) if r[12] is not None else None,
            }
            for r in rows
        ],
    }
    cache_set(cache_key, result, 60.0)
    return result


@router.get("/{ecosystem}/{name}")
def get_package(
    ecosystem: str,
    name: str,
    conn: Any = Depends(get_db),
) -> dict:
    cache_key = f"pkg:{ecosystem}:{name}"
    if cached := cache_get(cache_key):
        return cached

    row = repo_get_package(conn, name, ecosystem)

    if not row:
        raise HTTPException(status_code=404, detail="Package not found")

    cve_rows = repo_get_cve_history(conn, name, ecosystem)
    news_rows = repo_get_package_news(conn, name, ecosystem)
    epss_history_rows = repo_get_epss_history(conn, name, ecosystem)

    result = {
        "name": row[0],
        "ecosystem": row[1],
        "weekly_downloads": row[2],
        "epss_score": round(row[3], 4) if row[3] is not None else None,
        "risk_score": round(row[4], 2) if row[4] is not None else None,
        "has_mal_advisory": row[5],
        "sectors": row[6] or [],
        "logo_url": row[7],
        "cve_ids": row[8] or [],
        "last_enriched_at": row[9].isoformat() if row[9] else None,
        "max_cvss_score": max((c[5] for c in cve_rows if c[5] is not None), default=None),
        "cve_history": [
            {
                "osv_id": c[0],
                "cve_id": c[1],
                "published_date": c[2].date().isoformat() if c[2] else None,
                "severity": c[3],
                "cvss_vector": c[4],
                "cvss_score": c[5],
            }
            for c in cve_rows
        ],
        "epss_history": [
            {
                "date": e[0].isoformat() if hasattr(e[0], "isoformat") else str(e[0]),
                "epss": round(e[1], 4),
            }
            for e in epss_history_rows
        ],
        "recent_news": [
            {
                "id": n[0],
                "title": n[1],
                "published_date": n[2].isoformat() if n[2] else None,
                "source_name": n[3],
                "url": n[4],
                "summary": n[5],
                "exploit_status": n[6],
                "severity": n[7],
            }
            for n in news_rows
        ],
    }
    cache_set(cache_key, result, 120.0)
    return result
