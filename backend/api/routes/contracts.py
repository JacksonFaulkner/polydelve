from typing import Any
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_browse_user, get_current_user
from api.cache import cache_get, cache_invalidate, cache_set
from features.contract_pricing import current_sell_value, price_contract, sell_value_at_day
from features.contracts_repo import (
    buy_contract as repo_buy_contract,
    get_contract_for_sell,
    get_package_epss,
    get_user_schmeckles,
    list_contracts,
    sell_contract as repo_sell_contract,
)
from features.db import get_db
from models.models import (
    BuyRequest, BuyResponse, ContractDetail,
    QuoteRequest, QuoteResponse,
    SellResponse, SimCurvePoint, SimulateRequest, SimulateResponse,
)

# Browse-level: guests may simulate/quote. buy/sell/me each require a real
# Auth0 user via their own Depends(get_current_user), so guests can't bet.
router = APIRouter(prefix="/contracts", dependencies=[Depends(get_browse_user)])


def _reject_backward_epss(
    conn: Any,
    package_name: str,
    ecosystem: str,
    epss_threshold: float | None,
) -> None:
    """A contract can only bet EPSS rises. Reject a target below current EPSS
    (i.e. betting the package gets safer), even if the client edited the payload."""
    if epss_threshold is None:
        return
    current = get_package_epss(conn, package_name, ecosystem) or 0.0
    if epss_threshold < current:
        raise HTTPException(
            422,
            f"epss_threshold {epss_threshold:.4f} is below current EPSS {current:.4f}; "
            "contracts cannot bet on EPSS decreasing",
        )


@router.post("/simulate", response_model=SimulateResponse)
def simulate_contract(req: SimulateRequest, conn: Any = Depends(get_db)) -> SimulateResponse:
    """Return sell-value curve + three stacked win areas for the predict page chart."""
    # The EPSS slider sets a target = current_epss * drift. Price through the real
    # logit model so the payout actually moves as the user drags (higher target =
    # harder to reach = lower prob = bigger payout), instead of a clamped multiply.
    current_epss = get_package_epss(conn, req.package_name, req.ecosystem) or 0.0
    epss_target = min(current_epss * max(req.epss_drift, 1.0), 1.0) or None

    try:
        terms = price_contract(
            conn=conn,
            package_name=req.package_name,
            ecosystem=req.ecosystem,
            cvss_threshold=req.cvss_threshold,
            epss_threshold=epss_target,
            purchase_price=req.purchase_price,
            duration_days=req.duration_days,
        )
    except ValueError:
        raise HTTPException(404, "Package not found or insufficient data")

    price = req.purchase_price
    dur = req.duration_days

    epss_payout = terms.epss_payout
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
def quote_contract(req: QuoteRequest, conn: Any = Depends(get_db)) -> QuoteResponse:
    if req.purchase_price < 10:
        raise HTTPException(422, "minimum purchase_price is 10 schmeckles")
    _reject_backward_epss(conn, req.package_name, req.ecosystem, req.epss_threshold)
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
    except ValueError:
        raise HTTPException(404, "Package not found or insufficient data")

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
def buy_contract(
    req: BuyRequest,
    claims: dict = Depends(get_current_user),
    conn: Any = Depends(get_db),
) -> BuyResponse:
    user_id = claims["sub"]

    schmeckles = get_user_schmeckles(conn, user_id)
    if schmeckles is None:
        raise HTTPException(404, "User not found")
    if schmeckles < req.purchase_price:
        raise HTTPException(409, "Insufficient schmeckles")

    _reject_backward_epss(conn, req.package_name, req.ecosystem, req.epss_threshold)

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
    except ValueError:
        raise HTTPException(404, "Package not found or insufficient data")

    contract_id = str(uuid.uuid4())
    expires_at = date.today() + timedelta(days=req.duration_days)
    opening_epss = get_package_epss(conn, req.package_name, req.ecosystem)

    try:
        repo_buy_contract(
            conn, contract_id, user_id, req.package_name, req.ecosystem,
            "all", req.cvss_threshold, req.epss_threshold,
            req.purchase_price, terms.max_payout, terms.opening_probability,
            terms.package_grade, expires_at, opening_epss,
        )
    except ValueError:
        raise HTTPException(409, "Insufficient schmeckles")
    except Exception as e:
        raise HTTPException(500, "Failed to create contract") from e

    cache_invalidate(f"contracts:me:{user_id}")
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
    conn: Any = Depends(get_db),
) -> list[ContractDetail]:
    cache_key = f"contracts:me:{claims['sub']}"
    if cached := cache_get(cache_key):
        return cached
    result = _list_contracts(claims["sub"], conn)
    cache_set(cache_key, result, 15.0)
    return result


@router.get("/user/{user_id}", response_model=list[ContractDetail])
def list_user_contracts(
    user_id: str,
    conn: Any = Depends(get_db),
) -> list[ContractDetail]:
    return _list_contracts(user_id, conn)


def _list_contracts(user_id: str, conn: Any) -> list[ContractDetail]:
    rows = list_contracts(conn, user_id)

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
    claims: dict = Depends(get_current_user),
    conn: Any = Depends(get_db),
) -> SellResponse:
    caller_id = claims["sub"]
    row = get_contract_for_sell(conn, contract_id, caller_id)
    if not row:
        raise HTTPException(404, "Contract not found")

    user_id, price, expires, status, created_at, opening_epss, current_epss = row
    if status != "open":
        raise HTTPException(409, f"Contract is {status}, cannot sell")

    sell_val = current_sell_value(
        purchase_price=price,
        created_at=created_at.date() if hasattr(created_at, "date") else created_at,
        expires_at=expires if isinstance(expires, date) else date.fromisoformat(str(expires)),
        opening_epss=opening_epss,
        current_epss=current_epss,
    )

    try:
        repo_sell_contract(conn, contract_id, user_id, sell_val)
    except Exception as e:
        raise HTTPException(500, "Failed to sell contract") from e

    cache_invalidate(f"contracts:me:{caller_id}")
    return SellResponse(sell_price=sell_val, status="sold")
