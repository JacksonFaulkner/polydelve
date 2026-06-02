from contextlib import asynccontextmanager

import duckdb
import uvicorn
from fastapi import FastAPI

from api.middleware.cors import add_cors
from api.routes.health import router as health_router
from api.routes.contracts import router as contracts_router
from api.routes.packages import router as packages_router
from api.routes.prediction_market import router as pm_router
from api.routes.users import router as users_router
from features.db import DB_PATH, init_db, seed_companies


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = duckdb.connect(DB_PATH)
    init_db(conn)
    seed_companies(conn)
    app.state.db = conn
    yield
    conn.close()


app = FastAPI(title="Action Odds", lifespan=lifespan)

add_cors(app)
app.include_router(health_router)
app.include_router(users_router)
app.include_router(pm_router)
app.include_router(packages_router)
app.include_router(contracts_router)


def dev() -> None:
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, env_file=".env")


if __name__ == "__main__":
    dev()

