from datetime import date, timedelta
from typing import Literal

import duckdb
from fastapi import APIRouter, Depends, HTTPException, Query

from features.db import get_db

router = APIRouter(prefix="/packages")


@router.get("")
def list_packages(
    ecosystem: Literal["PyPI", "npm"] | None = None,
    sector: str | None = None,
    has_cves: bool | None = None,
    latest_cve_days: int | None = Query(None, ge=1, description="Only packages with a CVE in the last N days"),
    sort: Literal["risk_score", "weekly_downloads", "epss_score", "num_cves"] = "risk_score",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
    filters = ["p.ecosystem IN ('PyPI', 'npm')"]
    params: list = []

    if ecosystem:
        filters.append("p.ecosystem = ?")
        params.append(ecosystem)
    if sector:
        filters.append("list_contains(p.sectors, ?)")
        params.append(sector)
    if has_cves is True:
        filters.append("len(p.cve_ids) > 0")
    elif has_cves is False:
        filters.append("(p.cve_ids IS NULL OR len(p.cve_ids) = 0)")
    if latest_cve_days is not None:
        cutoff = (date.today() - timedelta(days=latest_cve_days)).isoformat()
        filters.append(
            "EXISTS (SELECT 1 FROM cve_history ch WHERE ch.name = p.name AND ch.ecosystem = p.ecosystem AND ch.published_date >= ?)"
        )
        params.append(cutoff)

    where = " AND ".join(filters)

    sort_col = {
        "risk_score": "p.risk_score",
        "weekly_downloads": "p.weekly_downloads",
        "epss_score": "p.epss_score",
        "num_cves": "len(p.cve_ids)",
    }[sort]

    offset = (page - 1) * page_size

    total = conn.execute(
        f"SELECT COUNT(*) FROM packages p WHERE {where}", params
    ).fetchone()[0]

    rows = conn.execute(
        f"""
        SELECT
            p.name,
            p.ecosystem,
            p.weekly_downloads,
            p.epss_score,
            p.risk_score,
            p.in_cisa_kev,
            p.has_mal_advisory,
            p.sectors,
            p.logo_url,
            len(p.cve_ids) AS num_cves,
            COUNT(DISTINCT np.news_id)  AS news_mentions,
            MAX(ch.published_date)      AS latest_cve_date,
            MAX(ch.severity)            AS worst_severity,
            MAX(ch.cvss_score)          AS max_cvss_score
        FROM packages p
        LEFT JOIN news_packages np
            ON np.name = p.name AND np.ecosystem = p.ecosystem
        LEFT JOIN cve_history ch
            ON ch.name = p.name AND ch.ecosystem = p.ecosystem
        WHERE {where}
        GROUP BY
            p.name, p.ecosystem, p.weekly_downloads, p.epss_score,
            p.risk_score, p.in_cisa_kev, p.has_mal_advisory, p.sectors, p.logo_url,
            len(p.cve_ids)
        ORDER BY {sort_col} DESC NULLS LAST
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()

    return {
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
                "in_cisa_kev": r[5],
                "has_mal_advisory": r[6],
                "sectors": r[7] or [],
                "logo_url": r[8],
                "num_cves": r[9] or 0,
                "news_mentions": r[10],
                "latest_cve_date": r[11].date().isoformat() if r[11] else None,
                "worst_severity": r[12],
                "max_cvss_score": round(r[13], 1) if r[13] is not None else None,
            }
            for r in rows
        ],
    }


@router.get("/{ecosystem}/{name}")
def get_package(
    ecosystem: str,
    name: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
    row = conn.execute(
        """
        SELECT
            p.name, p.ecosystem, p.weekly_downloads, p.epss_score,
            p.risk_score, p.in_cisa_kev, p.has_mal_advisory, p.sectors, p.logo_url,
            p.cve_ids, p.last_enriched_at
        FROM packages p
        WHERE p.name = ? AND p.ecosystem = ?
        """,
        [name, ecosystem],
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Package not found")

    cve_rows = conn.execute(
        """
        SELECT osv_id, cve_id, published_date, severity, cvss_vector, cvss_score
        FROM cve_history
        WHERE name = ? AND ecosystem = ?
        ORDER BY published_date DESC
        """,
        [name, ecosystem],
    ).fetchall()

    news_rows = conn.execute(
        """
        SELECT n.id, n.title, n.published_date, n.source_name,
               n.source_url, n.summary, n.exploit_status, n.severity
        FROM news n
        JOIN news_packages np ON np.news_id = n.id
        WHERE np.name = ? AND np.ecosystem = ?
        ORDER BY n.published_date DESC
        LIMIT 10
        """,
        [name, ecosystem],
    ).fetchall()

    epss_history_rows = conn.execute(
        """
        WITH windowed AS (
            SELECT recorded_at, epss_score,
                LAG(epss_score)    OVER (ORDER BY recorded_at) AS prev_epss,
                LAG(recorded_at)   OVER (ORDER BY recorded_at) AS prev_date
            FROM epss_history
            WHERE name = ? AND ecosystem = ?
        )
        SELECT recorded_at, epss_score
        FROM windowed
        WHERE prev_epss IS NULL
           OR round(prev_epss, 5) != round(epss_score, 5)
           OR datediff('day', prev_date, recorded_at) >= 10
        ORDER BY recorded_at ASC
        """,
        [name, ecosystem],
    ).fetchall()

    return {
        "name": row[0],
        "ecosystem": row[1],
        "weekly_downloads": row[2],
        "epss_score": round(row[3], 4) if row[3] is not None else None,
        "risk_score": round(row[4], 2) if row[4] is not None else None,
        "in_cisa_kev": row[5],
        "has_mal_advisory": row[6],
        "sectors": row[7] or [],
        "logo_url": row[8],
        "cve_ids": row[9] or [],
        "last_enriched_at": row[10].isoformat() if row[10] else None,
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
