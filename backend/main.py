import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from api.auth import _auth0
from api.middleware.cors import add_cors
from api.otel import setup_otel
from api.routes.auth_guest import public_router as auth_guest_router
from api.routes.contracts import router as contracts_router
from api.routes.etf import router as etf_router
from api.routes.events import router as events_router
from api.routes.featured import router as featured_router
from api.routes.health import router as health_router
from api.routes.packages import router as packages_router
from api.routes.prediction_market import public_router as pm_public_router
from api.routes.prediction_market import router as pm_router
from api.routes.users import public_router as users_public_router
from api.routes.users import router as users_router
from features.db import close_pool, open_pool, pooled_conn, seed_companies


def _load_env() -> None:
    env = Path(__file__).parent / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        if line.strip() and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


_load_env()


class _HealthFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return "GET /health" not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(_HealthFilter())


@asynccontextmanager
async def lifespan(app: FastAPI):
    open_pool()
    with pooled_conn() as conn:
        seed_companies(conn)
    try:
        await _auth0().api_client._discover()
    except Exception as e:
        # Non-fatal: JWKS discovery retries lazily on the first authed request.
        logging.getLogger(__name__).warning("Auth0 discovery failed at startup: %s", e)
    yield
    close_pool()


limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(title="Polydelve", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

add_cors(app)
app.include_router(health_router)
app.include_router(auth_guest_router)
app.include_router(users_public_router)
app.include_router(users_router)
app.include_router(pm_public_router)
app.include_router(pm_router)
app.include_router(packages_router)
app.include_router(contracts_router)
app.include_router(etf_router)
app.include_router(featured_router)
app.include_router(events_router)

setup_otel(app)


def dev() -> None:
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, env_file=".env")


if __name__ == "__main__":
    dev()
