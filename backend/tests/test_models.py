import sys
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

sys.path.insert(0, ".")

from models.models import BuyRequest, Market, QuoteRequest


def _future(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


# ── Market.end_date validator ─────────────────────────────────────────────────

def _market(days: int) -> Market:
    return Market(
        id="m1",
        title="Test",
        description="desc",
        grade="B",
        price=100,
        payout=500,
        end_date=_future(days),
        status="open",
    )


def test_market_end_date_31_days_accepted():
    m = _market(31)
    assert m.end_date is not None


def test_market_end_date_32_days_rejected():
    with pytest.raises(ValidationError, match="end_date cannot be more than 1 month"):
        _market(32)


def test_market_end_date_1_day_accepted():
    m = _market(1)
    assert m.end_date is not None


# ── ContractBase ecosystem / duration validation ──────────────────────────────

def _quote(**kwargs) -> QuoteRequest:
    base = dict(
        package_name="requests",
        ecosystem="PyPI",
        purchase_price=100,
        duration_days=30,
    )
    base.update(kwargs)
    return QuoteRequest(**base)


def test_quote_valid():
    q = _quote()
    assert q.ecosystem == "PyPI"


def test_quote_invalid_ecosystem():
    with pytest.raises(ValidationError):
        _quote(ecosystem="maven")


def test_quote_invalid_duration():
    with pytest.raises(ValidationError):
        _quote(duration_days=32)


def test_quote_valid_durations():
    for d in (7, 14, 30):
        q = _quote(duration_days=d)
        assert q.duration_days == d


# ── BuyRequest ────────────────────────────────────────────────────────────────

def test_buy_request_requires_user_id():
    with pytest.raises(ValidationError):
        BuyRequest(
            package_name="requests",
            ecosystem="PyPI",
            purchase_price=100,
            duration_days=30,
        )
