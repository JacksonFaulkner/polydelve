from contextlib import asynccontextmanager
from pathlib import Path
import os

# Load .env if present
_env = Path(__file__).parent / ".env"
if _env.exists():
    for _line in _env.read_text().splitlines():
        if _line.strip() and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

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

