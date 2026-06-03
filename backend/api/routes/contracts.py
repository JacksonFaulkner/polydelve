import uuid
from datetime import date, timedelta

import duckdb
from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_current_user
from features.contract_pricing import current_sell_value, price_contract, sell_value_at_day
from features.db import get_db
from models.models import (
    BuyRequest, BuyResponse, ContractDetail,
    QuoteRequest, QuoteResponse,
    SellResponse, SimCurvePoint, SimulateRequest, SimulateResponse,
)

router = APIRouter(prefix="/contracts", dependencies=[Depends(get_current_user)])


@router.post("/simulate", response_model=SimulateResponse)
def simulate_contract(req: SimulateRequest, conn: duckdb.DuckDBPyConnection = Depends(get_db)) -> SimulateResponse:
    """Return sell-value curve + three stacked win areas for the predict page chart."""
    try:
        terms = price_contract(
            conn=conn,
            package_name=req.package_name,
            ecosystem=req.ecosystem,
            cvss_threshold=req.cvss_threshold,
            epss_threshold=None,
            purchase_price=req.purchase_price,
            duration_days=req.duration_days,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    price = req.purchase_price
    dur = req.duration_days

    epss_payout = min(terms.max_payout, round(terms.epss_payout * max(req.epss_drift, 1.0)))
    epss_win = epss_payout - price
    cvss_win = terms.cvss_payout - price
    mal_win  = terms.mal_payout  - price
    max_loss = -price

    exponent = min(0.3 + max(0.0, dur / 7 - 1) * 0.55, 3.0)
    today = date.today()
    curve: list[SimCurvePoint] = []
    for day in range(dur + 1):
        sv = sell_value_at_day(price, day, dur, 1.0, terms.max_payout)
        days_remaining = max(dur - day, 0)
        time_factor = (days_remaining / dur) ** exponent if dur > 0 else 0.0
        if day == 0:
            label = "Now"
        elif day == dur:
            label = "EXP"
        else:
            d = today + timedelta(days=day)
            label = f"{d.month}/{d.day}"
        curve.append(SimCurvePoint(
            label=label,
            sell_pnl=sv - price,
            epss_win=round(epss_win * time_factor),
            cvss_win=round(cvss_win * time_factor),
            mal_win=round(mal_win * time_factor),
        ))

    max_win = max(epss_win, cvss_win, mal_win)
    return SimulateResponse(
        epss_payout=epss_payout,
        cvss_payout=terms.cvss_payout,
        mal_payout=terms.mal_payout,
        epss_win=epss_win,
        cvss_win=cvss_win,
        mal_win=mal_win,
        max_win=max_win,
        max_loss=max_loss,
        y_min=round(max_loss * 1.1),
        y_max=round(max_win * 1.1),
        curve=curve,
    )


@router.post("/quote", response_model=QuoteResponse)
def quote_contract(req: QuoteRequest, conn: duckdb.DuckDBPyConnection = Depends(get_db)) -> QuoteResponse:
    if req.purchase_price < 10:
        raise HTTPException(422, "minimum purchase_price is 10 schmeckles")
    try:
        terms = price_contract(
            conn=conn,
            package_name=req.package_name,
            ecosystem=req.ecosystem,
            cvss_threshold=req.cvss_threshold,
            epss_threshold=req.epss_threshold,
            purchase_price=req.purchase_price,
            duration_days=req.duration_days,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    expires_at = date.today() + timedelta(days=req.duration_days)
    return QuoteResponse(
        package_name=req.package_name,
        ecosystem=req.ecosystem,
        market_type="all",
        cvss_threshold=req.cvss_threshold,
        epss_threshold=req.epss_threshold,
        purchase_price=req.purchase_price,
        max_payout=terms.max_payout,
        opening_probability=terms.opening_probability,
        package_grade=terms.package_grade,
        expires_at=expires_at.isoformat(),
        description=terms.description,
        multiplier=round(terms.max_payout / req.purchase_price, 2),
    )


@router.post("", status_code=201, response_model=BuyResponse)
def buy_contract(req: BuyRequest, conn: duckdb.DuckDBPyConnection = Depends(get_db)) -> BuyResponse:
    user = conn.execute("SELECT schmeckles FROM users WHERE id = ?", [req.user_id]).fetchone()
    if not user:
        raise HTTPException(404, "User not found")
    if user[0] < req.purchase_price:
        raise HTTPException(409, "Insufficient schmeckles")

    try:
        terms = price_contract(
            conn=conn,
            package_name=req.package_name,
            ecosystem=req.ecosystem,
            cvss_threshold=req.cvss_threshold,
            epss_threshold=req.epss_threshold,
            purchase_price=req.purchase_price,
            duration_days=req.duration_days,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))

    contract_id = str(uuid.uuid4())
    expires_at = date.today() + timedelta(days=req.duration_days)

    opening_epss_row = conn.execute(
        "SELECT epss_score FROM packages WHERE name = ? AND ecosystem = ?",
        [req.package_name, req.ecosystem],
    ).fetchone()
    opening_epss = opening_epss_row[0] if opening_epss_row else None

    conn.execute(
        """
        INSERT INTO contracts (
            id, user_id, package_name, package_ecosystem, market_type,
            cvss_threshold, epss_threshold, purchase_price, max_payout,
            opening_probability, package_grade, expires_at, opening_epss
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            contract_id, req.user_id, req.package_name, req.ecosystem,
            "all", req.cvss_threshold, req.epss_threshold,
            req.purchase_price, terms.max_payout, terms.opening_probability,
            terms.package_grade, expires_at, opening_epss,
        ],
    )
    conn.execute(
        "UPDATE users SET schmeckles = schmeckles - ? WHERE id = ?",
        [req.purchase_price, req.user_id],
    )

    return BuyResponse(
        id=contract_id,
        max_payout=terms.max_payout,
        opening_probability=terms.opening_probability,
        package_grade=terms.package_grade,
        expires_at=expires_at.isoformat(),
        multiplier=round(terms.max_payout / req.purchase_price, 2),
        description=terms.description,
    )


@router.get("/me", response_model=list[ContractDetail])
def list_my_contracts(
    claims: dict = Depends(get_current_user),
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> list[ContractDetail]:
    return _list_contracts(claims["sub"], conn)


@router.get("/user/{user_id}", response_model=list[ContractDetail])
def list_user_contracts(
    user_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> list[ContractDetail]:
    return _list_contracts(user_id, conn)


def _list_contracts(user_id: str, conn: duckdb.DuckDBPyConnection) -> list[ContractDetail]:
    rows = conn.execute(
        """
        SELECT c.id, c.package_name, c.package_ecosystem, c.market_type,
               c.cvss_threshold, c.epss_threshold, c.purchase_price, c.max_payout,
               c.opening_probability, c.package_grade, c.expires_at,
               c.status, c.resolved_at, c.sell_price, c.created_at,
               c.opening_epss, p.epss_score AS current_epss
        FROM contracts c
        LEFT JOIN packages p ON p.name = c.package_name AND p.ecosystem = c.package_ecosystem
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
        """,
        [user_id],
    ).fetchall()

    result: list[ContractDetail] = []
    for row in rows:
        (cid, pkg, eco, mtype, cvss_t, epss_t, price, payout,
         open_prob, grade, expires, status, resolved_at, sell_price, created_at,
         opening_epss, current_epss) = row

        sell_val = None
        if status == "open":
            sell_val = current_sell_value(
                purchase_price=price,
                created_at=created_at.date() if hasattr(created_at, "date") else created_at,
                expires_at=expires if isinstance(expires, date) else date.fromisoformat(str(expires)),
                opening_epss=opening_epss,
                current_epss=current_epss,
            )

        result.append(ContractDetail(
            id=cid,
            package_name=pkg,
            ecosystem=eco,
            market_type=mtype,
            cvss_threshold=cvss_t,
            epss_threshold=epss_t,
            purchase_price=price,
            max_payout=payout,
            opening_probability=open_prob,
            package_grade=grade,
            expires_at=expires.isoformat() if hasattr(expires, "isoformat") else str(expires),
            status=status,
            resolved_at=resolved_at.isoformat() if resolved_at else None,
            sell_price=sell_price,
            created_at=created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
            current_sell_value=sell_val,
            multiplier=round(payout / price, 2),
        ))
    return result


@router.post("/{contract_id}/sell", response_model=SellResponse)
def sell_contract(
    contract_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db),
) -> SellResponse:
    row = conn.execute(
        """
        SELECT c.user_id, c.purchase_price, c.max_payout, c.opening_probability,
               c.expires_at, c.status, c.created_at,
               c.opening_epss, p.epss_score AS current_epss
        FROM contracts c
        LEFT JOIN packages p ON p.name = c.package_name AND p.ecosystem = c.package_ecosystem
        WHERE c.id = ?
        """,
        [contract_id],
    ).fetchone()
    if not row:
        raise HTTPException(404, "Contract not found")

    user_id, price, _payout, _open_prob, expires, status, created_at, opening_epss, current_epss = row
    if status != "open":
        raise HTTPException(409, f"Contract is {status}, cannot sell")

    sell_val = current_sell_value(
        purchase_price=price,
        created_at=created_at.date() if hasattr(created_at, "date") else created_at,
        expires_at=expires if isinstance(expires, date) else date.fromisoformat(str(expires)),
        opening_epss=opening_epss,
        current_epss=current_epss,
    )

    conn.execute(
        "UPDATE contracts SET status = 'sold', sell_price = ?, resolved_at = now() WHERE id = ?",
        [sell_val, contract_id],
    )
    conn.execute(
        "UPDATE users SET schmeckles = schmeckles + ? WHERE id = ?",
        [sell_val, user_id],
    )

    return SellResponse(sell_price=sell_val, status="sold")
