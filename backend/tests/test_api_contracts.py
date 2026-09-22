"""Contract buy flow, invalid input, auth enforcement."""
import sys
from datetime import date, timedelta

sys.path.insert(0, ".")


def _seed_contract(db, contract_id="contract-1", status="open", user_id="auth0|testuser123"):
    cur = db.cursor()
    cur.execute(
        """
        INSERT INTO contracts (
            id, user_id, package_name, package_ecosystem, market_type,
            cvss_threshold, epss_threshold, purchase_price, max_payout,
            opening_probability, package_grade, expires_at, status, created_at
        ) VALUES (%s, %s, 'requests', 'PyPI', 'all', 7.0, NULL, 100, 500, 0.5, 5.0, %s, %s, now())
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, user_id = EXCLUDED.user_id,
            expires_at = EXCLUDED.expires_at, created_at = EXCLUDED.created_at
        """,
        (contract_id, user_id, date.today() + timedelta(days=7), status),
    )


# ── Auth enforcement ──────────────────────────────────────────────────────────

def test_contracts_me_requires_auth(unauth_client):
    r = unauth_client.get("/contracts/me")
    assert r.status_code >= 400


def test_buy_contract_requires_auth(unauth_client):
    r = unauth_client.post("/contracts", json={
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


# ── Simulate ──────────────────────────────────────────────────────────────────

def _simulate(client, drift):
    return client.post("/contracts/simulate", json={
        "package_name": "requests",
        "ecosystem": "PyPI",
        "cvss_threshold": 7.0,
        "purchase_price": 100,
        "duration_days": 30,
        "epss_drift": drift,
    })


def test_simulate_epss_payout_increases_with_drift(client):
    # Higher drift = higher EPSS target = harder to reach = bigger payout.
    # Regression lock: the route used to clamp epss_payout to max_payout, so
    # dragging the slider did nothing.
    payouts = []
    for drift in (1.0, 2.0, 5.0):
        r = _simulate(client, drift)
        assert r.status_code == 200, r.text
        payouts.append(r.json()["epss_payout"])
    assert payouts[0] < payouts[1] < payouts[2], payouts


def test_simulate_returns_payouts_and_probability(client):
    r = _simulate(client, 2.0)
    assert r.status_code == 200
    body = r.json()
    assert body["max_loss"] == -100
    assert body["epss_payout"] > 100
    assert body["max_win"] == body["cvss_payout"] - 100
    assert 0.0 < body["win_probability"] < 1.0


def test_simulate_baseline_drift_has_no_epss_leg(client):
    r = _simulate(client, 1.0)
    assert r.status_code == 200
    body = r.json()
    # slider at baseline: no EPSS leg, so no "already reached" free win
    assert body["epss_payout"] == 0 and body["epss_win"] == 0
    assert body["cvss_payout"] == body["mal_payout"] == body["max_win"] + 100
    assert body["max_win"] > 100


# ── Buy ───────────────────────────────────────────────────────────────────────

def test_buy_deducts_bits(client, db_with_data):
    r = client.post("/contracts", json={
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 30,
    })
    assert r.status_code == 201
    cur = db_with_data.cursor()
    cur.execute("SELECT bits FROM users WHERE id = 'auth0|testuser123'")
    bal = cur.fetchone()[0]
    assert bal == 900


def test_buy_insufficient_bits(client, db_with_data):
    db_with_data.cursor().execute(
        "UPDATE users SET bits = 10 WHERE id = 'auth0|testuser123'"
    )
    r = client.post("/contracts", json={
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 30,
    })
    assert r.status_code == 409


def test_buy_user_not_in_db_returns_404(client, db_with_data):
    # Authenticated user whose sub isn't in the users table
    db_with_data.cursor().execute("DELETE FROM users WHERE id = 'auth0|testuser123'")
    r = client.post("/contracts", json={
        "package_name": "requests",
        "ecosystem": "PyPI",
        "purchase_price": 100,
        "duration_days": 30,
    })
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
