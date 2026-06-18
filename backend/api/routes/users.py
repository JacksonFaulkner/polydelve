from typing import Any
import os
import re
import uuid
from collections import defaultdict
from datetime import date as dt

import boto3
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from api.auth import get_current_user, get_optional_user
from api.cache import cache_get, cache_set, cache_invalidate, ttl_for
from features.db import get_db
from features.users_repo import (
    check_username_taken,
    count_users,
    get_contracts_for_users,
    get_ranked_users,
    get_user,
    get_user_basic,
    get_user_contract_history,
    get_user_schmeckles,
    set_avatar_url,
    set_username,
    upsert_user,
)
from models.models import (
    LeaderboardContract, LeaderboardResponse, LeaderboardUser,
    SchmecklePoint, SchmeckleTimeline, User,
)

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
_AVATARS_BUCKET = os.getenv("AVATARS_BUCKET", "")
_AVATARS_REGION = os.getenv("AVATARS_REGION", "us-east-1")
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


class UserUpdate(BaseModel):
    username: str | None = None
    avatar_url: str | None = None

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str | None) -> str | None:
        if v is not None and not _USERNAME_RE.match(v):
            raise ValueError("Username must be 3–20 characters: letters, numbers, underscores only.")
        return v

public_router = APIRouter(prefix="/users")
router = APIRouter(prefix="/users", dependencies=[Depends(get_current_user)])


@router.get("/me", response_model=User)
def get_me(
    claims: dict = Depends(get_current_user),
    conn: Any = Depends(get_db),
) -> User:
    sub = claims["sub"]
    email = claims.get("email")

    row = get_user(conn, sub)

    if not row:
        upsert_user(conn, sub, email)
        conn.commit()
        return User(id=sub, email=email, username=None, schmeckles=1000)

    return User(id=row[0], email=row[1], username=row[2], schmeckles=row[3], avatar_url=row[4])


@router.get("/me/avatar-upload-url")
def get_avatar_upload_url(
    content_type: str = Query(...),
    claims: dict = Depends(get_current_user),
) -> dict:
    if content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, f"content_type must be one of {sorted(_ALLOWED_CONTENT_TYPES)}")
    if not _AVATARS_BUCKET:
        raise HTTPException(503, "Avatar uploads not configured.")

    ext = content_type.split("/")[1].replace("jpeg", "jpg")
    key = f"avatars/{claims['sub']}/{uuid.uuid4()}.{ext}"
    public_url = f"https://{_AVATARS_BUCKET}.s3.{_AVATARS_REGION}.amazonaws.com/{key}"

    s3 = boto3.client("s3", region_name=_AVATARS_REGION)
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": _AVATARS_BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=300,
    )
    return {"upload_url": upload_url, "public_url": public_url}


@router.patch("/me", response_model=User)
def update_me(
    body: UserUpdate,
    claims: dict = Depends(get_current_user),
    conn: Any = Depends(get_db),
) -> User:
    sub = claims["sub"]

    if body.username is not None:
        if check_username_taken(conn, body.username, sub):
            raise HTTPException(409, "Username already taken.")
        set_username(conn, sub, body.username)
        # Invalidate leaderboard cache so new username appears immediately.
        for p in range(1, 6):
            for ps in [50, 100]:
                cache_invalidate(f"leaderboard:{p}:{ps}")

    if body.avatar_url is not None:
        set_avatar_url(conn, sub, body.avatar_url)

    conn.commit()
    row = get_user(conn, sub)
    if not row:
        raise HTTPException(404, "User not found.")

    return User(id=row[0], email=row[1], username=row[2], schmeckles=row[3], avatar_url=row[4])


@public_router.get("/leaderboard", response_model=LeaderboardResponse)
def get_leaderboard(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    conn: Any = Depends(get_db),
    user: dict | None = Depends(get_optional_user),
) -> LeaderboardResponse:
    cache_key = f"leaderboard:{page}:{page_size}"
    if cached := cache_get(cache_key):
        return cached

    offset = (page - 1) * page_size
    total = count_users(conn)
    ranked = get_ranked_users(conn, page_size, offset)

    if not ranked:
        return LeaderboardResponse(total=total, page=page, page_size=page_size, users=[])

    user_ids = [r[0] for r in ranked]
    contracts_rows = get_contracts_for_users(conn, user_ids)

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
    conn: Any = Depends(get_db),
) -> SchmeckleTimeline:
    schmeckles = get_user_schmeckles(conn, user_id)
    if schmeckles is None:
        raise HTTPException(404, "User not found")
    user_row = (schmeckles,)

    rows = get_user_contract_history(conn, user_id)

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
        current = int(schmeckles)
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
