from collections import defaultdict
from datetime import date as dt

import duckdb
from fastapi import APIRouter, Depends, HTTPException, Query

from api.auth import get_current_user, get_optional_user
from api.cache import cache_get, cache_set, ttl_for
from features.db import get_db
from models.models import (
    LeaderboardContract, LeaderboardResponse, LeaderboardUser,
    SchmecklePoint, SchmeckleTimeline, User,
)

public_router = APIRouter(prefix="/users")
router = APIRouter(prefix="/users", dependencies=[Depends(get_current_user)])


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
            "INSERT OR IGNORE INTO users (id, email, username, schmeckles) VALUES (?, ?, ?, 1000)",
            [sub, email, email or sub],
        )
        return User(id=sub, email=email, schmeckles=1000)

    return User(id=row[0], email=row[1], username=row[2], schmeckles=row[3])


@public_router.get("/leaderboard", response_model=LeaderboardResponse)
def get_leaderboard(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
) -> LeaderboardResponse:
    cache_key = f"leaderboard:{page}:{page_size}"
    if cached := cache_get(cache_key):
        return cached

    offset = (page - 1) * page_size
    total = (conn.execute("SELECT COUNT(*) FROM users").fetchone() or (0,))[0]

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

    contracts_by_user: dict[str, list[LeaderboardContract]] = defaultdict(list)
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

    users = [
        LeaderboardUser(
            rank=int(rank),
            id=uid,
            username=username,
            schmeckles=schmeckles,
            total_contracts=len(contracts_by_user[uid]),
            open_contracts=sum(1 for c in contracts_by_user[uid] if c.status == "open"),
            won_contracts=sum(1 for c in contracts_by_user[uid] if c.status == "won"),
            contracts=contracts_by_user[uid],
        )
        for uid, username, schmeckles, rank in ranked
    ]

    result = LeaderboardResponse(total=total, page=page, page_size=page_size, users=users)
    cache_set(cache_key, result, ttl_for(user))
    return result


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
        SELECT created_at::VARCHAR, resolved_at::VARCHAR,
               purchase_price, max_payout, sell_price, status
        FROM contracts
        WHERE user_id = ?
        ORDER BY created_at ASC
        """,
        [user_id],
    ).fetchall()

    events: list[tuple[str, int, str]] = []
    for created, resolved, price, payout, sell_price, status in rows:
        if created:
            events.append((created[:10], -price, "buy"))
        if status == "won" and resolved:
            events.append((resolved[:10], payout, "won"))
        elif status == "sold" and resolved and sell_price:
            events.append((resolved[:10], sell_price, "sold"))

    events.sort(key=lambda e: e[0])

    today = dt.today().isoformat()
    try:
        current = int(user_row[0])
    except (ValueError, TypeError):
        current = 1000

    # Derive starting balance from actual DB balance so chart always anchors correctly.
    total_delta = sum(delta for _, delta, _ in events)
    starting_balance = current - total_delta

    points: list[SchmecklePoint] = (
        [SchmecklePoint(date=events[0][0], balance=starting_balance, event=None)] if events else []
    )
    balance = starting_balance
    for event_date, delta, label in events:
        balance += delta
        points.append(SchmecklePoint(date=event_date, balance=balance, event=label))  # type: ignore[arg-type]

    # Always end at today with the real DB balance so the chart's final value is authoritative.
    if not points or points[-1].date != today or points[-1].event is not None:
        points.append(SchmecklePoint(date=today, balance=current, event=None))

    return SchmeckleTimeline(user_id=user_id, points=points)
