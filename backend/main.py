from contextlib import asynccontextmanager
import os
from pathlib import Path

import duckdb
import uvicorn
from fastapi import FastAPI

from api.middleware.cors import add_cors
from api.routes.health import router as health_router
from api.routes.contracts import router as contracts_router
from api.routes.packages import router as packages_router
from api.routes.prediction_market import public_router as pm_public_router
from api.routes.prediction_market import router as pm_router
from api.routes.users import public_router as users_public_router
from api.routes.users import router as users_router
from api.auth import _auth0
from features.db import DB_PATH, init_db, seed_companies


def _load_env() -> None:
    env = Path(__file__).parent / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        if line.strip() and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


_load_env()


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = duckdb.connect(DB_PATH)
    init_db(conn)
    seed_companies(conn)
    app.state.db = conn
    try:
        await _auth0().api_client._discover()
    except Exception:
        pass
    yield
    conn.close()


app = FastAPI(title="Action Odds", lifespan=lifespan)

add_cors(app)
app.include_router(health_router)
app.include_router(users_public_router)
app.include_router(users_router)
app.include_router(pm_public_router)
app.include_router(pm_router)
app.include_router(packages_router)
app.include_router(contracts_router)


def dev() -> None:
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, env_file=".env")


if __name__ == "__main__":
    dev()

