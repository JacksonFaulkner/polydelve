import uuid
from datetime import datetime, timedelta, timezone

import duckdb
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from features.db import get_db
from features.prediction_market import calculate_payout

router = APIRouter()


# --- Request bodies ---

class CreateMarketRequest(BaseModel):
    company_id: str
    title: str
    description: str
    duration_days: int
    price: int


class PlaceBetRequest(BaseModel):
    user_id: str
    market_id: str


class CreateUserRequest(BaseModel):
    username: str


# --- Companies ---

@router.get("/companies")
def list_companies(conn: duckdb.DuckDBPyConnection = Depends(get_db)) -> list[dict]:
    rows = conn.execute("SELECT id, title, logo, grade FROM companies").fetchall()
    return [{"id": r[0], "title": r[1], "logo": r[2], "grade": r[3]} for r in rows]


# --- Markets ---

@router.get("/markets")
def list_markets(
    status: str = "open",
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> list[dict]:
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
    return [
        {
            "id": r[0], "title": r[1], "description": r[2], "grade": r[3],
            "price": r[4], "payout": r[5], "end_date": r[6], "status": r[7],
            "company": {"id": r[8], "title": r[9], "logo": r[10]},
        }
        for r in rows
    ]


@router.get("/markets/{market_id}")
def get_market(
    market_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
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
    return {
        "id": row[0], "title": row[1], "description": row[2], "grade": row[3],
        "price": row[4], "payout": row[5], "end_date": row[6], "status": row[7],
        "company": {"id": row[8], "title": row[9], "logo": row[10]},
    }


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
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
    market = conn.execute(
        "SELECT price, status FROM markets WHERE id = ?", [req.market_id]
    ).fetchone()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")
    if market[1] != "open":
        raise HTTPException(status_code=409, detail="Market is not open")

    price = market[0]
    user = conn.execute(
        "SELECT schmeckles FROM users WHERE id = ?", [req.user_id]
    ).fetchone()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user[0] < price:
        raise HTTPException(status_code=409, detail="Insufficient schmeckles")

    bet_id = str(uuid.uuid4())
    conn.execute(
        "UPDATE users SET schmeckles = schmeckles - ? WHERE id = ?",
        [price, req.user_id],
    )
    conn.execute(
        "INSERT INTO bets (id, user_id, market_id, placed_at) VALUES (?, ?, ?, ?)",
        [bet_id, req.user_id, req.market_id, datetime.now(timezone.utc)],
    )

    return {"id": bet_id, "market_id": req.market_id, "user_id": req.user_id}


# --- Users ---

@router.get("/users/{user_id}")
def get_user(
    user_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
    row = conn.execute(
        "SELECT id, username, schmeckles FROM users WHERE id = ?", [user_id]
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": row[0], "username": row[1], "schmeckles": row[2]}


@router.post("/users", status_code=201)
def create_user(
    req: CreateUserRequest,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> dict:
    user_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO users (id, username, schmeckles) VALUES (?, ?, 1000)",
        [user_id, req.username],
    )
    return {"id": user_id, "username": req.username, "schmeckles": 1000}