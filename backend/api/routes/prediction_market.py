import uuid
from datetime import datetime, timedelta, timezone

import duckdb
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import get_current_user, get_optional_user
from api.cache import cache_get, cache_set, ttl_for
from features.db import get_db
from features.prediction_market import calculate_payout

public_router = APIRouter()
router = APIRouter(dependencies=[Depends(get_current_user)])


# --- Request bodies ---

class CreateMarketRequest(BaseModel):
    company_id: str
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=1000)
    duration_days: int = Field(ge=1, le=31)
    price: int = Field(ge=10)


class PlaceBetRequest(BaseModel):
    market_id: str


# --- News ---

@public_router.get("/news")
def list_news(
    page: int = 1,
    page_size: int = 20,
    severity: str | None = None,
    exploit_status: str | None = None,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
) -> dict:
    cache_key = f"news:{page}:{page_size}:{severity}:{exploit_status}"
    if cached := cache_get(cache_key):
        return cached
    filters = ["published_date IS NOT NULL"]
    params: list = []
    if severity:
        filters.append("severity = ?")
        params.append(severity)
    if exploit_status:
        filters.append("exploit_status = ?")
        params.append(exploit_status)

    where = " AND ".join(filters)
    offset = (page - 1) * page_size

    total = conn.execute(f"SELECT COUNT(*) FROM news WHERE {where}", params).fetchone()[0]

    rows = conn.execute(
        f"""
        SELECT
            n.id, n.title, n.summary, n.source_url, n.source_name,
            n.published_date, n.sector_labels, n.company_labels,
            n.threat_actor, n.exploit_status, n.severity,
            array_agg(DISTINCT np.name || '::' || np.ecosystem)
                FILTER (WHERE np.name IS NOT NULL) AS packages
        FROM news n
        LEFT JOIN news_packages np ON np.news_id = n.id
        WHERE {where}
        GROUP BY
            n.id, n.title, n.summary, n.source_url, n.source_name,
            n.published_date, n.sector_labels, n.company_labels,
            n.threat_actor, n.exploit_status, n.severity
        ORDER BY n.published_date DESC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()

    def parse_packages(raw: list[str] | None) -> list[dict]:
        if not raw:
            return []
        out = []
        for entry in raw:
            parts = entry.split("::")
            if len(parts) == 2:
                out.append({"name": parts[0], "ecosystem": parts[1]})
        return out

    result = {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": r[0],
                "title": r[1],
                "summary": r[2],
                "url": r[3],
                "source_name": r[4],
                "published_at": r[5].isoformat() if r[5] else None,
                "sector_labels": r[6] or [],
                "company_labels": r[7] or [],
                "threat_actor": r[8],
                "exploit_status": r[9],
                "severity": r[10],
                "affected_packages": parse_packages(r[11]),
            }
            for r in rows
        ],
    }
    cache_set(cache_key, result, ttl_for(user))
    return result


# --- Companies ---

@public_router.get("/companies")
def list_companies(
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
) -> list[dict]:
    cache_key = "companies"
    if cached := cache_get(cache_key):
        return cached
    rows = conn.execute("SELECT id, title, logo, grade FROM companies").fetchall()
    result = [{"id": r[0], "title": r[1], "logo": r[2], "grade": r[3]} for r in rows]
    cache_set(cache_key, result, ttl_for(user))
    return result


# --- Markets ---

@public_router.get("/markets")
def list_markets(
    status: str = "open",
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
) -> list[dict]:
    cache_key = f"markets:{status}"
    if cached := cache_get(cache_key):
        return cached
    rows = conn.execute(
        """
        SELECT m.id, m.title, m.description, m.grade, m.price, m.payout,
               m.end_date, m.status, c.id, c.title, c.logo
        FROM markets m
        JOIN companies c ON c.id = m.company_id
        WHERE m.status = ?
        """,
        [status],
    ).fetchall()
    result = [
        {
            "id": r[0], "title": r[1], "description": r[2], "grade": r[3],
            "price": r[4], "payout": r[5], "end_date": r[6], "status": r[7],
            "company": {"id": r[8], "title": r[9], "logo": r[10]},
        }
        for r in rows
    ]
    cache_set(cache_key, result, ttl_for(user))
    return result


@public_router.get("/markets/{market_id}")
def get_market(
    market_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
) -> dict:
    cache_key = f"market:{market_id}"
    if cached := cache_get(cache_key):
        return cached
    row = conn.execute(
        """
        SELECT m.id, m.title, m.description, m.grade, m.price, m.payout,
               m.end_date, m.status, c.id, c.title, c.logo
        FROM markets m
        JOIN companies c ON c.id = m.company_id
        WHERE m.id = ?
        """,
        [market_id],
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Market not found")
    result = {
        "id": row[0], "title": row[1], "description": row[2], "grade": row[3],
        "price": row[4], "payout": row[5], "end_date": row[6], "status": row[7],
        "company": {"id": row[8], "title": row[9], "logo": row[10]},
    }
    cache_set(cache_key, result, ttl_for(user))
    return result


@router.post("/markets", status_code=201)
def create_market(
    req: CreateMarketRequest,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
    if not (1 <= req.duration_days <= 31):
        raise HTTPException(status_code=422, detail="duration_days must be between 1 and 31")

    company = conn.execute(
        "SELECT grade FROM companies WHERE id = ?", [req.company_id]
    ).fetchone()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    grade = company[0]
    payout = calculate_payout(grade, req.duration_days, req.price)
    market_id = str(uuid.uuid4())
    end_date = datetime.now(timezone.utc) + timedelta(days=req.duration_days)

    conn.execute(
        """
        INSERT INTO markets (id, company_id, title, description, grade, price, payout, end_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
        """,
        [market_id, req.company_id, req.title, req.description, grade, req.price, payout, end_date],
    )

    return {"id": market_id, "grade": grade, "payout": payout, "end_date": end_date}


# --- Bets ---

@router.post("/bets", status_code=201)
def place_bet(
    req: PlaceBetRequest,
    claims: dict = Depends(get_current_user),
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
    user_id = claims["sub"]

    market = conn.execute(
        "SELECT price, status FROM markets WHERE id = ?", [req.market_id]
    ).fetchone()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")
    if market[1] != "open":
        raise HTTPException(status_code=409, detail="Market is not open")

    price = market[0]
    user = conn.execute(
        "SELECT schmeckles FROM users WHERE id = ?", [user_id]
    ).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user[0] < price:
        raise HTTPException(status_code=409, detail="Insufficient schmeckles")

    bet_id = str(uuid.uuid4())
    try:
        conn.execute("BEGIN")
        conn.execute(
            "UPDATE users SET schmeckles = schmeckles - ? WHERE id = ? AND schmeckles >= ?",
            [price, user_id, price],
        )
        conn.execute(
            "INSERT INTO bets (id, user_id, market_id, placed_at) VALUES (?, ?, ?, ?)",
            [bet_id, user_id, req.market_id, datetime.now(timezone.utc)],
        )
        conn.execute("COMMIT")
    except Exception as e:
        conn.execute("ROLLBACK")
        raise HTTPException(500, "Failed to place bet") from e

    return {"id": bet_id, "market_id": req.market_id, "user_id": user_id}


# --- Users ---

@router.get("/users/{user_id}")
def get_user(
    user_id: str,
    claims: dict = Depends(get_current_user),
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
    if claims["sub"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    row = conn.execute(
        "SELECT id, username, schmeckles FROM users WHERE id = ?", [user_id]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": row[0], "username": row[1], "schmeckles": row[2]}