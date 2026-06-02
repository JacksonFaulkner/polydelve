import duckdb
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.auth import get_current_user
from features.db import get_db

router = APIRouter(prefix="/users", dependencies=[Depends(get_current_user)])


class User(BaseModel):
    id: str
    email: str | None = None
    username: str | None = None
    schmeckles: int = 1000


class LeaderboardContract(BaseModel):
    id: str
    package_name: str
    package_ecosystem: str
    market_type: str
    purchase_price: int
    max_payout: int
    opening_probability: float
    status: str
    expires_at: str
    created_at: str | None = None


class LeaderboardUser(BaseModel):
    rank: int
    id: str
    username: str | None = None
    schmeckles: int
    total_contracts: int
    open_contracts: int
    won_contracts: int
    contracts: list[LeaderboardContract]


class LeaderboardResponse(BaseModel):
    total: int
    page: int
    page_size: int
    users: list[LeaderboardUser]


class SchmecklePoint(BaseModel):
    date: str
    balance: int
    event: str | None = None  # "buy", "won", "sold"


class SchmeckleTimeline(BaseModel):
    user_id: str
    points: list[SchmecklePoint]


@router.get("/me", response_model=User)
def get_me(
    claims: dict = Depends(get_current_user),
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> User:
    sub = claims["sub"]
    email = claims.get("email")

    row = conn.execute(
        "SELECT id, email, username, schmeckles FROM users WHERE id = ?", [sub]
    ).fetchone()

    if not row:
        conn.execute(
            "INSERT INTO users (id, email, username, schmeckles) VALUES (?, ?, ?, 1000)",
            [sub, email, None],
        )
        return User(id=sub, email=email, schmeckles=1000)

    return User(id=row[0], email=row[1], username=row[2], schmeckles=row[3])


@router.get("/leaderboard", response_model=LeaderboardResponse)
def get_leaderboard(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> LeaderboardResponse:
    offset = (page - 1) * page_size

    total_row = conn.execute("SELECT COUNT(*) FROM users").fetchone()
    total = total_row[0] if total_row else 0

    ranked = conn.execute(
        """
        SELECT id, username, schmeckles,
               ROW_NUMBER() OVER (ORDER BY schmeckles DESC) AS rank
        FROM users
        ORDER BY schmeckles DESC
        LIMIT ? OFFSET ?
        """,
        [page_size, offset],
    ).fetchall()

    if not ranked:
        return LeaderboardResponse(total=total, page=page, page_size=page_size, users=[])

    user_ids = [r[0] for r in ranked]
    placeholders = ", ".join("?" * len(user_ids))

    contracts_rows = conn.execute(
        f"""
        SELECT user_id, id, package_name, package_ecosystem, market_type,
               purchase_price, max_payout, opening_probability, status,
               expires_at::VARCHAR, created_at::VARCHAR
        FROM contracts
        WHERE user_id IN ({placeholders})
        ORDER BY created_at DESC
        """,
        user_ids,
    ).fetchall()

    from collections import defaultdict
    contracts_by_user: dict[str, list] = defaultdict(list)
    for row in contracts_rows:
        uid, cid, pkg_name, pkg_eco, mtype, price, payout, prob, status, expires, created = row
        contracts_by_user[uid].append(LeaderboardContract(
            id=cid,
            package_name=pkg_name,
            package_ecosystem=pkg_eco,
            market_type=mtype,
            purchase_price=price,
            max_payout=payout,
            opening_probability=prob,
            status=status,
            expires_at=expires,
            created_at=created,
        ))

    users = []
    for uid, username, schmeckles, rank in ranked:
        ctrs = contracts_by_user[uid]
        users.append(LeaderboardUser(
            rank=int(rank),
            id=uid,
            username=username,
            schmeckles=schmeckles,
            total_contracts=len(ctrs),
            open_contracts=sum(1 for c in ctrs if c.status == "open"),
            won_contracts=sum(1 for c in ctrs if c.status == "won"),
            contracts=ctrs,
        ))

    return LeaderboardResponse(total=total, page=page, page_size=page_size, users=users)


@router.get("/leaderboard/{user_id}/timeline", response_model=SchmeckleTimeline)
def get_schmeckle_timeline(
    user_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> SchmeckleTimeline:
    user_row = conn.execute(
        "SELECT schmeckles FROM users WHERE id = ?", [user_id]
    ).fetchone()
    if not user_row:
        raise HTTPException(404, "User not found")

    rows = conn.execute(
        """
        SELECT
            created_at::VARCHAR,
            resolved_at::VARCHAR,
            purchase_price,
            max_payout,
            sell_price,
            status
        FROM contracts
        WHERE user_id = ?
        ORDER BY created_at ASC
        """,
        [user_id],
    ).fetchall()

    # Build events list: (date_str, delta, event_label)
    events: list[tuple[str, int, str]] = []
    for created, resolved, price, payout, sell_price, status in rows:
        if created:
            day = created[:10]
            events.append((day, -price, "buy"))
        if status == "won" and resolved:
            day = resolved[:10]
            events.append((day, payout, "won"))
        elif status == "sold" and resolved and sell_price:
            day = resolved[:10]
            events.append((day, sell_price, "sold"))

    events.sort(key=lambda e: e[0])

    # Start at 1000 and walk forward
    STARTING_BALANCE = 1000
    balance = STARTING_BALANCE
    points: list[SchmecklePoint] = [
        SchmecklePoint(date=events[0][0] if events else "2025-01-01", balance=balance, event=None)
    ] if events else []

    for date, delta, label in events:
        balance += delta
        points.append(SchmecklePoint(date=date, balance=balance, event=label))

    # Append today as final point with current balance to reflect any manual adjustments
    from datetime import date as dt
    today = dt.today().isoformat()
    current = int(user_row[0])
    if points and points[-1].date != today:
        points.append(SchmecklePoint(date=today, balance=current, event=None))
    elif not points:
        points.append(SchmecklePoint(date=today, balance=current, event=None))

    return SchmeckleTimeline(user_id=user_id, points=points)
