"""Tests for markets, bets, and users endpoints in prediction_market router."""
import sys

sys.path.insert(0, ".")


def _seed_company(db):
    db.cursor().execute(
        "INSERT INTO companies (id, title, logo, grade) VALUES ('google', 'Google', '', 'A') ON CONFLICT (id) DO NOTHING"
    )


def _seed_market(db, market_id="mkt-1", status="open", price=100):
    _seed_company(db)
    db.cursor().execute(
        """
        INSERT INTO markets (id, company_id, title, description, grade, price, payout, end_date, status)
        VALUES (%s, 'google', 'Test Market', 'Desc', 'A', %s, 300, now() + INTERVAL '7 days', %s)
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, price = EXCLUDED.price
        """,
        (market_id, price, status),
    )


# ── Markets (public) ──────────────────────────────────────────────────────────

def test_list_markets_public(unauth_client):
    r = unauth_client.get("/markets")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_market_not_found(unauth_client):
    r = unauth_client.get("/markets/does-not-exist")
    assert r.status_code == 404


def test_get_market_exists(client, db_with_data):
    _seed_market(db_with_data)
    r = client.get("/markets/mkt-1")
    assert r.status_code == 200
    assert r.json()["id"] == "mkt-1"


# ── Create market (auth required) ─────────────────────────────────────────────

def test_create_market_requires_auth(unauth_client):
    r = unauth_client.post("/markets", json={
        "company_id": "google", "title": "T", "description": "D",
        "duration_days": 7, "price": 100,
    })
    assert r.status_code >= 400


def test_create_market_invalid_duration(client):
    r = client.post("/markets", json={
        "company_id": "google", "title": "T", "description": "D",
        "duration_days": 99, "price": 100,
    })
    assert r.status_code == 422


def test_create_market_invalid_price(client):
    r = client.post("/markets", json={
        "company_id": "google", "title": "T", "description": "D",
        "duration_days": 7, "price": 5,
    })
    assert r.status_code == 422


def test_create_market_unknown_company(client):
    r = client.post("/markets", json={
        "company_id": "unknown-co", "title": "T", "description": "D",
        "duration_days": 7, "price": 100,
    })
    assert r.status_code == 404


# ── Bets ──────────────────────────────────────────────────────────────────────

def test_place_bet_requires_auth(unauth_client, db_with_data):
    _seed_market(db_with_data)
    r = unauth_client.post("/bets", json={"market_id": "mkt-1"})
    assert r.status_code >= 400


def test_place_bet_market_not_found(client):
    r = client.post("/bets", json={"market_id": "ghost-market"})
    assert r.status_code == 404


def test_place_bet_closed_market(client, db_with_data):
    _seed_market(db_with_data, status="won")
    r = client.post("/bets", json={"market_id": "mkt-1"})
    assert r.status_code == 409


def test_place_bet_insufficient_funds(client, db_with_data):
    _seed_market(db_with_data, price=5000)
    r = client.post("/bets", json={"market_id": "mkt-1"})
    assert r.status_code == 409


def test_place_bet_deducts_schmeckles(client, db_with_data):
    _seed_market(db_with_data, price=100)
    r = client.post("/bets", json={"market_id": "mkt-1"})
    assert r.status_code == 201
    cur = db_with_data.cursor()
    cur.execute("SELECT schmeckles FROM users WHERE id = 'auth0|testuser123'")
    bal = cur.fetchone()[0]
    assert bal == 900


# ── /users/{user_id} ownership ────────────────────────────────────────────────

def test_get_user_own_profile_allowed(client):
    r = client.get("/users/auth0|testuser123")
    assert r.status_code == 200
    assert r.json()["id"] == "auth0|testuser123"


def test_get_user_other_profile_forbidden(client):
    r = client.get("/users/auth0|someone-else")
    assert r.status_code == 403


def test_get_user_requires_auth(unauth_client):
    r = unauth_client.get("/users/auth0|testuser123")
    assert r.status_code >= 400
