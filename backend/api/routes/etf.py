from typing import Any
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_browse_user, get_current_user
from api.cache import cache_invalidate
from features.db import get_db
from features.contract_pricing import sell_value_at_day
from features.etf_pricing import current_basket_sell_value
from features.etf_repo import (
    MemberInput,
    build_member_terms,
    buy_etf_contract as repo_buy_etf_contract,
    get_etf_contract_for_sell,
    get_package_epss,
    get_user_schmeckles,
    list_etf_contracts,
    list_etf_members,
    price_etf,
    sell_etf_contract as repo_sell_etf_contract,
)
from features.manifest_parser import ParsedDependency, parse_manifest
from features.packages_repo import get_package as repo_get_package
from models.models import (
    EtfBuyRequest, EtfBuyResponse,
    EtfContractDetail, EtfMemberDetail,
    EtfQuoteRequest, EtfQuoteResponse,
    EtfSimulateRequest, SellResponse,
    SimCurvePoint, SimulateResponse,
)

router = APIRouter(prefix="/etf", dependencies=[Depends(get_browse_user)])


@router.post("/parse")
def parse_manifest_upload(req: dict, conn: Any = Depends(get_db)) -> dict:
    filename = req.get("filename", "")
    content = req.get("content", "")
    try:
        deps: list[ParsedDependency] = parse_manifest(filename, content)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e

    matched = []
    unmatched = []
    for dep in deps:
        pkg = repo_get_package(conn, dep.name, dep.ecosystem)
        if pkg:
            name, ecosystem, weekly_downloads, epss_score, risk_score, has_mal_advisory, sectors, logo_url, last_enriched_at = pkg
            matched.append({
                "name": name,
                "ecosystem": ecosystem,
                "weekly_downloads": weekly_downloads,
                "epss_score": epss_score,
                "risk_score": risk_score,
                "has_mal_advisory": has_mal_advisory,
            })
        else:
            unmatched.append(dep.name)
    return {"matched": matched, "unmatched": unmatched}


def _to_member_inputs(members) -> list[MemberInput]:
    return [
        MemberInput(m.package_name, m.ecosystem, m.cvss_threshold, m.epss_threshold)
        for m in members
    ]


@router.post("/quote", response_model=EtfQuoteResponse)
def quote_etf(req: EtfQuoteRequest, conn: Any = Depends(get_db)) -> EtfQuoteResponse:
    if req.purchase_price < 10:
        raise HTTPException(422, "minimum purchase_price is 10 schmeckles")
    if req.threshold_count > len(req.members):
        raise HTTPException(422, "threshold_count cannot exceed member_count")

    try:
        member_terms = build_member_terms(conn, _to_member_inputs(req.members), req.duration_days)
    except ValueError as e:
        raise HTTPException(404, "One or more packages not found") from e

    terms = price_etf(member_terms, req.threshold_count, req.purchase_price, req.duration_days)
    expires_at = date.today() + timedelta(days=req.duration_days)

    return EtfQuoteResponse(
        threshold_count=req.threshold_count,
        member_count=len(req.members),
        purchase_price=req.purchase_price,
        max_payout=terms.max_payout,
        combined_probability=terms.combined_probability,
        avg_grade=terms.avg_grade,
        expires_at=expires_at.isoformat(),
        multiplier=round(terms.max_payout / req.purchase_price, 2),
    )


@router.post("/simulate", response_model=SimulateResponse)
def simulate_etf(req: EtfSimulateRequest, conn: Any = Depends(get_db)) -> SimulateResponse:
    if req.threshold_count > len(req.members):
        raise HTTPException(422, "threshold_count cannot exceed member_count")
    try:
        member_terms = build_member_terms(conn, _to_member_inputs(req.members), req.duration_days)
    except ValueError as e:
        raise HTTPException(404, "One or more packages not found") from e

    terms = price_etf(member_terms, req.threshold_count, req.purchase_price, req.duration_days)
    price = req.purchase_price
    dur = req.duration_days
    win = terms.max_payout - price
    max_loss = -price

    exponent = min(0.3 + max(0.0, dur / 7 - 1) * 0.55, 3.0)
    today = date.today()
    curve = []
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
            epss_win=round(win * time_factor),
            cvss_win=round(win * time_factor),
            mal_win=round(win * time_factor),
        ))

    return SimulateResponse(
        epss_payout=terms.max_payout,
        cvss_payout=terms.max_payout,
        mal_payout=terms.max_payout,
        epss_win=win,
        cvss_win=win,
        mal_win=win,
        max_win=win,
        max_loss=max_loss,
        y_min=round(max_loss * 1.1),
        y_max=round(win * 1.1),
        curve=curve,
    )


@router.post("", status_code=201, response_model=EtfBuyResponse)
def buy_etf(
    req: EtfBuyRequest,
    claims: dict = Depends(get_current_user),
    conn: Any = Depends(get_db),
) -> EtfBuyResponse:
    user_id = claims["sub"]
    if req.threshold_count > len(req.members):
        raise HTTPException(422, "threshold_count cannot exceed member_count")

    schmeckles = get_user_schmeckles(conn, user_id)
    if schmeckles is None:
        raise HTTPException(404, "User not found")
    if schmeckles < req.purchase_price:
        raise HTTPException(409, "Insufficient schmeckles")

    try:
        member_terms = build_member_terms(conn, _to_member_inputs(req.members), req.duration_days)
    except ValueError as e:
        raise HTTPException(404, "One or more packages not found") from e

    terms = price_etf(member_terms, req.threshold_count, req.purchase_price, req.duration_days)
    expires_at = date.today() + timedelta(days=req.duration_days)

    try:
        contract_id = repo_buy_etf_contract(
            conn, user_id, req.threshold_count, member_terms,
            req.purchase_price, terms.max_payout, terms.combined_probability,
            terms.avg_grade, expires_at,
        )
    except ValueError:
        raise HTTPException(409, "Insufficient schmeckles")
    except Exception as e:
        raise HTTPException(500, "Failed to create ETF contract") from e

    cache_invalidate(f"etf:me:{user_id}")
    return EtfBuyResponse(
        id=contract_id,
        max_payout=terms.max_payout,
        combined_probability=terms.combined_probability,
        avg_grade=terms.avg_grade,
        expires_at=expires_at.isoformat(),
        multiplier=round(terms.max_payout / req.purchase_price, 2),
    )


@router.get("/me", response_model=list[EtfContractDetail])
def list_my_etf_contracts(
    claims: dict = Depends(get_current_user),
    conn: Any = Depends(get_db),
) -> list[EtfContractDetail]:
    user_id = claims["sub"]
    rows = list_etf_contracts(conn, user_id)
    result = []
    for row in rows:
        (cid, threshold_count, member_count, price, payout, combined_prob,
         avg_grade, expires, status, resolved_at, sell_price, created_at) = row

        member_rows = list_etf_members(conn, cid)
        members = [
            EtfMemberDetail(
                package_name=m[0], ecosystem=m[1], cvss_threshold=m[2], epss_threshold=m[3],
                opening_probability=m[4], opening_epss=m[5], won=m[6],
                won_at=m[7].isoformat() if m[7] else None,
            )
            for m in member_rows
        ]

        sell_val = None
        if status == "open":
            expires_date = expires if isinstance(expires, date) else date.fromisoformat(str(expires))
            created_date = created_at.date() if hasattr(created_at, "date") else created_at
            drift_pairs = [
                (m.opening_epss, get_package_epss(conn, m.package_name, m.ecosystem))
                for m in members
            ]
            sell_val = current_basket_sell_value(price, created_date, expires_date, drift_pairs)

        result.append(EtfContractDetail(
            id=cid, threshold_count=threshold_count, member_count=member_count,
            purchase_price=price, max_payout=payout, combined_probability=combined_prob,
            avg_grade=avg_grade,
            expires_at=expires.isoformat() if hasattr(expires, "isoformat") else str(expires),
            status=status,
            resolved_at=resolved_at.isoformat() if resolved_at else None,
            sell_price=sell_price,
            created_at=created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
            current_sell_value=sell_val,
            multiplier=round(payout / price, 2),
            members=members,
        ))
    return result


@router.post("/{etf_contract_id}/sell", response_model=SellResponse)
def sell_etf(
    etf_contract_id: str,
    claims: dict = Depends(get_current_user),
    conn: Any = Depends(get_db),
) -> SellResponse:
    caller_id = claims["sub"]
    row = get_etf_contract_for_sell(conn, etf_contract_id, caller_id)
    if not row:
        raise HTTPException(404, "ETF contract not found")
    user_id, price, status = row
    if status != "open":
        raise HTTPException(409, f"ETF contract is {status}, cannot sell")

    member_rows = list_etf_members(conn, etf_contract_id)
    drift_pairs = [(m[5], get_package_epss(conn, m[0], m[1])) for m in member_rows]

    cur = conn.cursor()
    cur.execute("SELECT expires_at, created_at FROM etf_contracts WHERE id = %s", [etf_contract_id])
    expires, created_at = cur.fetchone()
    expires_date = expires if isinstance(expires, date) else date.fromisoformat(str(expires))
    created_date = created_at.date() if hasattr(created_at, "date") else created_at

    sell_val = current_basket_sell_value(price, created_date, expires_date, drift_pairs)

    try:
        repo_sell_etf_contract(conn, etf_contract_id, user_id, sell_val)
    except Exception as e:
        raise HTTPException(500, "Failed to sell ETF contract") from e

    cache_invalidate(f"etf:me:{caller_id}")
    return SellResponse(sell_price=sell_val, status="sold")
