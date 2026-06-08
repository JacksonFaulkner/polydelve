"""Contract buy/sell flow, invalid input, auth enforcement."""
import sys
from datetime import date, timedelta

sys.path.insert(0, ".")


def _seed_contract(db, contract_id="contract-1", status="open", user_id="auth0|testuser123"):
    db.execute(f"""
        INSERT INTO contracts (
            id, user_id, package_name, package_ecosystem, market_type,
            cvss_threshold, epss_threshold, purchase_price, max_payout,
            opening_probability, package_grade, expires_at, status, created_at
        ) VALUES (
            '{contract_id}', '{user_id}', 'requests', 'PyPI', 'all',
            7.0, NULL, 100, 500,
            0.5, 5.0, '{date.today() + timedelta(days=7)}', '{status}', now()
        )
    """)


# ── Auth enforcement ──────────────────────────────────────────────────────────

def test_contracts_me_requires_auth(unauth_client):
    r = unauth_client.get("/contracts/me")
    assert r.status_code >= 400


def test_buy_contract_requires_auth(unauth_client):
    r = unauth_client.post("/contracts", json={
        "user_id": "auth0|testuser123",
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 30,
    })
    assert r.status_code >= 400


# ── Quote ─────────────────────────────────────────────────────────────────────

def test_quote_min_price_enforced(client):
    r = client.post("/contracts/quote", json={
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 5,
        "duration_days": 30,
    })
    assert r.status_code == 422


def test_quote_invalid_ecosystem(client):
    r = client.post("/contracts/quote", json={
        "package_name": "requests",
        "ecosystem": "maven",
        "purchase_price": 100,
        "duration_days": 30,
    })
    assert r.status_code == 422


def test_quote_invalid_duration(client):
    r = client.post("/contracts/quote", json={
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 99,
    })
    assert r.status_code == 422


def test_quote_unknown_package_returns_404(client):
    r = client.post("/contracts/quote", json={
        "package_name": "totally-fake-package-xyz",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 30,
    })
    assert r.status_code == 404


def test_quote_valid_returns_payout(client):
    r = client.post("/contracts/quote", json={
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 30,
    })
    assert r.status_code == 200
    body = r.json()
    assert body["max_payout"] > 100
    assert body["multiplier"] > 1.0


# ── Buy ───────────────────────────────────────────────────────────────────────

def test_buy_deducts_schmeckles(client, db_with_data):
    r = client.post("/contracts", json={
        "user_id": "auth0|testuser123",
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 30,
    })
    assert r.status_code == 201
    bal = db_with_data.execute(
        "SELECT schmeckles FROM users WHERE id = 'auth0|testuser123'"
    ).fetchone()[0]
    assert bal == 900


def test_buy_insufficient_schmeckles(client, db_with_data):
    db_with_data.execute(
        "UPDATE users SET schmeckles = 10 WHERE id = 'auth0|testuser123'"
    )
    r = client.post("/contracts", json={
        "user_id": "auth0|testuser123",
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 30,
    })
    assert r.status_code == 409


def test_buy_unknown_user_returns_404(client):
    r = client.post("/contracts", json={
        "user_id": "auth0|ghost",
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 30,
    })
    assert r.status_code == 404


# ── Sell ──────────────────────────────────────────────────────────────────────

def test_sell_open_contract_credits_user(client, db_with_data):
    _seed_contract(db_with_data)
    r = client.post("/contracts/contract-1/sell")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "sold"
    assert body["sell_price"] >= 0
    bal = db_with_data.execute(
        "SELECT schmeckles FROM users WHERE id = 'auth0|testuser123'"
    ).fetchone()[0]
    assert bal > 1000  # refunded some value


def test_sell_already_sold_contract_rejected(client, db_with_data):
    _seed_contract(db_with_data, status="sold")
    r = client.post("/contracts/contract-1/sell")
    assert r.status_code == 409


def test_sell_won_contract_rejected(client, db_with_data):
    _seed_contract(db_with_data, status="won")
    r = client.post("/contracts/contract-1/sell")
    assert r.status_code == 409


def test_sell_nonexistent_contract(client):
    r = client.post("/contracts/does-not-exist/sell")
    assert r.status_code == 404


# ── List my contracts ─────────────────────────────────────────────────────────

def test_list_my_contracts_returns_own_only(client, db_with_data):
    _seed_contract(db_with_data, "mine")
    _seed_contract(db_with_data, "theirs", user_id="auth0|otheruser")
    r = client.get("/contracts/me")
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert "mine" in ids
    assert "theirs" not in ids
