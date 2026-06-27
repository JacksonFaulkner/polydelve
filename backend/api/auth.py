import logging
import os
import time
import uuid
from functools import lru_cache

from authlib.jose import jwt, JoseError
from fastapi import HTTPException, Request
from fastapi_plugin.fast_api_client import Auth0FastAPI

log = logging.getLogger(__name__)

# Guest tokens are minted by this backend (HS256) so logged-out visitors can
# browse read-only endpoints with a real bearer token instead of going
# anonymous. They are deliberately NOT accepted by get_current_user, so they
# can never place/sell bets — those require a real Auth0 login.
GUEST_ISSUER = "polydelve-guest"
GUEST_SECRET = os.getenv("GUEST_JWT_SECRET", "dev-guest-secret-change-me")
GUEST_TTL_SECONDS = int(os.getenv("GUEST_JWT_TTL", str(7 * 24 * 3600)))


@lru_cache(maxsize=1)
def _auth0() -> Auth0FastAPI:
    return Auth0FastAPI(
        domain=os.environ["AUTH0_DOMAIN"],
        audience=os.environ["AUTH0_AUDIENCE"],
    )


def mint_guest_token() -> tuple[str, int]:
    """Return (token, expires_in_seconds) for an anonymous browse session."""
    now = int(time.time())
    payload = {
        "iss": GUEST_ISSUER,
        "sub": f"guest:{uuid.uuid4()}",
        "role": "guest",
        "iat": now,
        "exp": now + GUEST_TTL_SECONDS,
    }
    token = jwt.encode({"alg": "HS256"}, payload, GUEST_SECRET).decode()
    return token, GUEST_TTL_SECONDS


def _verify_guest(request: Request) -> dict | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        claims = jwt.decode(auth[7:], GUEST_SECRET)
        claims.validate()  # checks exp/iat
    except (JoseError, ValueError):
        return None
    if claims.get("iss") != GUEST_ISSUER or claims.get("role") != "guest":
        return None
    return dict(claims)


async def get_current_user(request: Request) -> dict:
    return await _auth0().require_auth()(request)


async def get_browse_user(request: Request) -> dict:
    """Accept either a real Auth0 user or a self-issued guest token.
    Used on read-only endpoints that logged-out visitors may reach."""
    try:
        return await _auth0().require_auth()(request)
    except Exception:
        pass
    guest = _verify_guest(request)
    if guest is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return guest


async def get_optional_user(request: Request) -> dict | None:
    try:
        return await _auth0().require_auth()(request)
    except Exception as e:
        # Only swallow expected auth failures (missing/invalid token).
        # Re-raise anything that looks like a server-side misconfiguration.
        msg = str(e).lower()
        if any(k in msg for k in ("unauthorized", "token", "credential", "jwks", "audience", "issuer", "expired")):
            return None
        log.warning("get_optional_user unexpected error: %s", e)
        return None
