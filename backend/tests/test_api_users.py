"""Tests for /users/me, /users/leaderboard, and /users/{id}/timeline endpoints."""
import sys

sys.path.insert(0, ".")


# ── /users/me ─────────────────────────────────────────────────────────────────

def test_me_requires_auth(unauth_client):
    r = unauth_client.get("/users/me")
    assert r.status_code >= 400


def test_me_returns_user(client):
    r = client.get("/users/me")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "auth0|testuser123"
    assert body["schmeckles"] == 1000


def test_me_auto_creates_user_if_missing(db):
    """A valid JWT whose sub doesn't exist in users table should be auto-created."""
    from conftest import _make_client
    client = _make_client(db, authenticated=True)
    r = client.get("/users/me")
    assert r.status_code == 200
    assert r.json()["schmeckles"] == 1000


# ── /users/leaderboard ────────────────────────────────────────────────────────

def test_leaderboard_public(unauth_client):
    r = unauth_client.get("/users/leaderboard")
    assert r.status_code == 200
    body = r.json()
    assert "users" in body
    assert "total" in body


def test_leaderboard_pagination(client):
    r = client.get("/users/leaderboard?page=1&page_size=10")
    assert r.status_code == 200
    body = r.json()
    assert body["page"] == 1
    assert body["page_size"] == 10


def test_leaderboard_invalid_page_size(client):
    r = client.get("/users/leaderboard?page_size=999")
    assert r.status_code == 422


# ── /users/leaderboard/{user_id}/timeline ────────────────────────────────────

def test_timeline_requires_auth(unauth_client):
    r = unauth_client.get("/users/leaderboard/auth0|testuser123/timeline")
    assert r.status_code >= 400


def test_timeline_own_returns_data(client):
    r = client.get("/users/leaderboard/auth0|testuser123/timeline")
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == "auth0|testuser123"
    assert len(body["points"]) >= 1


def test_timeline_nonexistent_user_returns_404(client):
    r = client.get("/users/leaderboard/auth0|ghost/timeline")
    assert r.status_code == 404
