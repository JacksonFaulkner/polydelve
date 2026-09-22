from typing import Any
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_browse_user, get_current_user
from api.cache import cache_get, cache_invalidate, cache_set
from features.contract_pricing import current_value, price_contract
from features.contracts_repo import (
    buy_contract as repo_buy_contract,
    get_package_epss,
    get_user_bits,
    is_no_bet_eligible,
    list_contracts,
)
from features.db import get_db
from models.models import (
    NO_BET_ELIGIBILITY_DAYS,
    BuyRequest, BuyResponse, ContractDetail,
    QuoteRequest, QuoteResponse,
    SimulateRequest, SimulateResponse,
)

# Browse-level: guests may simulate/quote. buy/me each require a real
# Auth0 user via their own Depends(get_current_user), so guests can't bet.
router = APIRouter(prefix="/contracts", dependencies=[Depends(get_browse_user)])


def _validate_direction(conn: Any, package_name: str, ecosystem: str, direction: str) -> None:
    if direction != "no":
        return
    if not is_no_bet_eligible(conn, package_name, ecosystem, NO_BET_ELIGIBILITY_DAYS):
        raise HTTPException(
            422,
            f"NO bets require a CVE in the last {NO_BET_ELIGIBILITY_DAYS} days for {package_name}/{ecosystem}",
        )


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
    if epss_threshold <= current:
        raise HTTPException(
            422,
            f"epss_threshold {epss_threshold:.4f} is not above current EPSS {current:.4f}; "
            "contracts must bet on EPSS rising",
        )


@router.post("/simulate", response_model=SimulateResponse)
def simulate_contract(req: SimulateRequest, conn: Any = Depends(get_db)) -> SimulateResponse:
    """Price a hypothetical contract: per-leg payouts, profit/loss, and P(win)."""
    # The EPSS slider sets a target = current_epss * drift. Price through the real
    # logit model so the payout actually moves as the user drags (higher target =
    # harder to reach = lower prob = bigger payout), instead of a clamped multiply.
    _validate_direction(conn, req.package_name, req.ecosystem, req.direction)
    current_epss = get_package_epss(conn, req.package_name, req.ecosystem) or 0.0
    # Baseline drift (<= 1) means "no EPSS leg" — a target equal to the current
    # score would count as already reached and price as a near-certain win.
    epss_target = None
    if req.direction != "no" and req.epss_drift > 1.0 and current_epss > 0:
        epss_target = min(current_epss * req.epss_drift, 1.0)

    try:
        terms = price_contract(
            conn=conn,
            package_name=req.package_name,
            ecosystem=req.ecosystem,
            cvss_threshold=req.cvss_threshold,
            epss_threshold=epss_target,
            purchase_price=req.purchase_price,
            duration_days=req.duration_days,
            direction=req.direction,
        )
    except ValueError:
        raise HTTPException(404, "Package not found or insufficient data")

    price = req.purchase_price
    # epss_payout is 0 when there's no EPSS leg (NO bet, or slider at baseline)
    epss_win = terms.epss_payout - price if terms.epss_payout else 0
    cvss_win = terms.cvss_payout - price
    mal_win  = 0 if req.direction == "no" else terms.mal_payout - price

    return SimulateResponse(
        epss_payout=terms.epss_payout,
        cvss_payout=terms.cvss_payout,
        mal_payout=terms.mal_payout,
        epss_win=epss_win,
        cvss_win=cvss_win,
        mal_win=mal_win,
        max_win=terms.max_payout - price,
        max_loss=-price,
        win_probability=terms.opening_probability,
    )


@router.post("/quote", response_model=QuoteResponse)
def quote_contract(req: QuoteRequest, conn: Any = Depends(get_db)) -> QuoteResponse:
    if req.purchase_price < 10:
        raise HTTPException(422, "minimum purchase_price is 10 bits")
    _validate_direction(conn, req.package_name, req.ecosystem, req.direction)
    epss_threshold = None if req.direction == "no" else req.epss_threshold
    _reject_backward_epss(conn, req.package_name, req.ecosystem, epss_threshold)
    try:
        terms = price_contract(
            conn=conn,
            package_name=req.package_name,
            ecosystem=req.ecosystem,
            cvss_threshold=req.cvss_threshold,
            epss_threshold=epss_threshold,
            purchase_price=req.purchase_price,
            duration_days=req.duration_days,
            direction=req.direction,
        )
    except ValueError:
        raise HTTPException(404, "Package not found or insufficient data")

    expires_at = date.today() + timedelta(days=req.duration_days)
    return QuoteResponse(
        package_name=req.package_name,
        ecosystem=req.ecosystem,
        market_type="all",
        direction=req.direction,
        cvss_threshold=req.cvss_threshold,
        epss_threshold=epss_threshold,
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

    bits = get_user_bits(conn, user_id)
    if bits is None:
        raise HTTPException(404, "User not found")
    if bits < req.purchase_price:
        raise HTTPException(409, "Insufficient bits")

    _validate_direction(conn, req.package_name, req.ecosystem, req.direction)
    epss_threshold = None if req.direction == "no" else req.epss_threshold
    _reject_backward_epss(conn, req.package_name, req.ecosystem, epss_threshold)

    try:
        terms = price_contract(
            conn=conn,
            package_name=req.package_name,
            ecosystem=req.ecosystem,
            cvss_threshold=req.cvss_threshold,
            epss_threshold=epss_threshold,
            purchase_price=req.purchase_price,
            duration_days=req.duration_days,
            direction=req.direction,
        )
    except ValueError:
        raise HTTPException(404, "Package not found or insufficient data")

    contract_id = str(uuid.uuid4())
    expires_at = date.today() + timedelta(days=req.duration_days)
    opening_epss = get_package_epss(conn, req.package_name, req.ecosystem)

    try:
        repo_buy_contract(
            conn, contract_id, user_id, req.package_name, req.ecosystem,
            "all", req.cvss_threshold, epss_threshold,
            req.purchase_price, terms.max_payout, terms.opening_probability,
            terms.package_grade, expires_at, opening_epss, req.direction,
        )
    except ValueError:
        raise HTTPException(409, "Insufficient bits")
    except Exception as e:
        raise HTTPException(500, "Failed to create contract") from e

    cache_invalidate(f"contracts:me:{user_id}")
    return BuyResponse(
        id=contract_id,
        direction=req.direction,
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
         opening_epss, current_epss, direction) = row

        value = None
        if status == "open":
            try:
                value = current_value(
                    conn, pkg, eco, cvss_t, epss_t, price, payout,
                    created_at=created_at.date() if hasattr(created_at, "date") else created_at,
                    expires_at=expires if isinstance(expires, date) else date.fromisoformat(str(expires)),
                    direction=direction,
                )
            except ValueError:
                value = None  # package vanished from the catalog

        result.append(ContractDetail(
            id=cid,
            package_name=pkg,
            ecosystem=eco,
            market_type=mtype,
            direction=direction,
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
            current_value=value,
            multiplier=round(payout / price, 2),
        ))
    return result
