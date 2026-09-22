from typing import Any
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_browse_user, get_current_user
from api.cache import cache_invalidate
from features.db import get_db
from features.etf_pricing import basket_value
from features.etf_repo import (
    MemberInput,
    build_member_terms,
    buy_etf_contract as repo_buy_etf_contract,
    member_remaining_probs,
    get_user_bits,
    list_etf_contracts,
    list_etf_members,
    price_etf,
)
from features.manifest_parser import ParsedDependency, parse_manifest
from features.packages_repo import get_package as repo_get_package
from models.models import (
    EtfBuyRequest, EtfBuyResponse,
    EtfContractDetail, EtfMemberDetail,
    EtfQuoteRequest, EtfQuoteResponse,
    EtfSimulateRequest, SimulateResponse,
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


def _check_no_duplicate_members(members) -> None:
    keys = [(m.ecosystem, m.package_name) for m in members]
    if len(keys) != len(set(keys)):
        raise HTTPException(422, "duplicate package in slip")


def _to_member_inputs(members) -> list[MemberInput]:
    return [
        MemberInput(m.package_name, m.ecosystem, m.cvss_threshold, m.epss_threshold)
        for m in members
    ]


@router.post("/quote", response_model=EtfQuoteResponse)
def quote_etf(req: EtfQuoteRequest, conn: Any = Depends(get_db)) -> EtfQuoteResponse:
    if req.purchase_price < 10:
        raise HTTPException(422, "minimum purchase_price is 10 bits")
    _check_no_duplicate_members(req.members)
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
    _check_no_duplicate_members(req.members)
    if req.threshold_count > len(req.members):
        raise HTTPException(422, "threshold_count cannot exceed member_count")
    try:
        member_terms = build_member_terms(conn, _to_member_inputs(req.members), req.duration_days)
    except ValueError as e:
        raise HTTPException(404, "One or more packages not found") from e

    terms = price_etf(member_terms, req.threshold_count, req.purchase_price, req.duration_days)
    price = req.purchase_price
    win = terms.max_payout - price

    return SimulateResponse(
        epss_payout=terms.max_payout,
        cvss_payout=terms.max_payout,
        mal_payout=terms.max_payout,
        epss_win=win,
        cvss_win=win,
        mal_win=win,
        max_win=win,
        max_loss=-price,
        win_probability=terms.combined_probability,
    )


@router.post("", status_code=201, response_model=EtfBuyResponse)
def buy_etf(
    req: EtfBuyRequest,
    claims: dict = Depends(get_current_user),
    conn: Any = Depends(get_db),
) -> EtfBuyResponse:
    user_id = claims["sub"]
    _check_no_duplicate_members(req.members)
    if req.threshold_count > len(req.members):
        raise HTTPException(422, "threshold_count cannot exceed member_count")

    bits = get_user_bits(conn, user_id)
    if bits is None:
        raise HTTPException(404, "User not found")
    if bits < req.purchase_price:
        raise HTTPException(409, "Insufficient bits")

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
        raise HTTPException(409, "Insufficient bits")
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

        value = None
        if status == "open":
            expires_date = expires if isinstance(expires, date) else date.fromisoformat(str(expires))
            created_date = created_at.date() if hasattr(created_at, "date") else created_at
            total_days = max((expires_date - created_date).days, 1)
            remaining = max(min((expires_date - date.today()).days, total_days), 0)
            probs = member_remaining_probs(conn, member_rows, total_days, remaining)
            value = basket_value(probs, threshold_count, payout)

        result.append(EtfContractDetail(
            id=cid, threshold_count=threshold_count, member_count=member_count,
            purchase_price=price, max_payout=payout, combined_probability=combined_prob,
            avg_grade=avg_grade,
            expires_at=expires.isoformat() if hasattr(expires, "isoformat") else str(expires),
            status=status,
            resolved_at=resolved_at.isoformat() if resolved_at else None,
            sell_price=sell_price,
            created_at=created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
            current_value=value,
            multiplier=round(payout / price, 2),
            members=members,
        ))
    return result
