import logging
import os
from functools import lru_cache
from fastapi import Request
from fastapi_plugin.fast_api_client import Auth0FastAPI

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _auth0() -> Auth0FastAPI:
    return Auth0FastAPI(
        domain=os.environ["AUTH0_DOMAIN"],
        audience=os.environ["AUTH0_AUDIENCE"],
    )


async def get_current_user(request: Request) -> dict:
    return await _auth0().require_auth()(request)


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
