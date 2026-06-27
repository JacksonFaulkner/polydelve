"""Guest-token browse flow: logged-out visitors get a self-issued JWT that
unlocks read-only endpoints but never betting."""
import sys
sys.path.insert(0, ".")

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.auth import mint_guest_token
from features.db import get_db
from main import app


class _FakeAuth0:
    """Stand-in for Auth0 that rejects everything, so get_browse_user falls
    through to guest verification and get_current_user 401s — no JWKS network."""

    def require_auth(self):
        async def _dep(request):
            raise HTTPException(status_code=401, detail="no auth0 token")
        return _dep


@pytest.fixture(autouse=True)
def _no_auth0(monkeypatch):
    monkeypatch.setattr("api.auth._auth0", lambda: _FakeAuth0())


@pytest.fixture
def gclient(db_with_data):
    def override_db():
        yield db_with_data

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app, raise_server_exceptions=False)
    yield client
    app.dependency_overrides.clear()


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Token issuance ────────────────────────────────────────────────────────────

def test_guest_token_issued(gclient):
    r = gclient.post("/auth/guest")
    assert r.status_code == 200
    body = r.json()
    assert body["token"]
    assert body["token_type"] == "Bearer"
    assert body["expires_in"] > 0


# ── Browse access with a guest token ──────────────────────────────────────────

def test_guest_can_browse_packages(gclient):
    token, _ = mint_guest_token()
    r = gclient.get("/packages?ecosystem=PyPI&page_size=5", headers=_bearer(token))
    assert r.status_code == 200


def test_guest_can_simulate(gclient):
    token, _ = mint_guest_token()
    r = gclient.post(
        "/contracts/simulate",
        headers=_bearer(token),
        json={
            "package_name": "requests",
            "ecosystem": "PyPI",
            "cvss_threshold": 7.0,
            "epss_drift": 2.0,
            "purchase_price": 100,
            "duration_days": 30,
        },
    )
    # 200 when pricing data is sufficient, 404 if the package lacks history —
    # either way it is NOT an auth rejection.
    assert r.status_code in (200, 404)


# ── Rejections ────────────────────────────────────────────────────────────────

def test_no_token_rejected(gclient):
    r = gclient.get("/packages?ecosystem=PyPI")
    assert r.status_code == 401


def test_garbage_token_rejected(gclient):
    r = gclient.get("/packages?ecosystem=PyPI", headers=_bearer("not-a-jwt"))
    assert r.status_code == 401


def test_guest_cannot_buy(gclient):
    token, _ = mint_guest_token()
    r = gclient.post(
        "/contracts",
        headers=_bearer(token),
        json={
            "package_name": "requests",
            "ecosystem": "PyPI",
            "cvss_threshold": 7.0,
            "epss_threshold": 0.1,
            "purchase_price": 100,
            "duration_days": 30,
        },
    )
    assert r.status_code == 401
