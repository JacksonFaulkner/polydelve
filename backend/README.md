# polydelve-backend

FastAPI service and ETL pipeline for Polydelve. Postgres 16 + pgvector, schema managed by Alembic.

## Dev

```bash
cp .env.example .env
docker compose up -d          # Postgres + pgvector on :5432
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload --port 8000
```

Or from the repo root: `make dev` (Postgres + backend + frontend).

## Structure

```
main.py       app entry point, lifespan (DB pool, Auth0 discovery)
api/          routes, auth (Auth0 + guest tokens), middleware, cache
features/     pricing, settlement, repositories, DB pool
etl/          fetch/ (OSV, EPSS, npm/PyPI, Exa) + jobs/; CLI: python -m etl.run <job>
models/       Pydantic models
alembic/      migrations
scripts/      one-off CLIs (EPSS backfill, pricing backtest, fake users)
tests/        pytest
```

## ETL

```bash
uv run python -m etl.run refresh   # epss → news → mal → cve → resolve (what prod runs)
uv run python -m etl.run resolve   # settle contracts only
```

See the [data pipeline docs](https://docs.polydelve.com/docs/build/data-pipeline).

## Tests and lint

```bash
uv run pytest        # needs Postgres at DATABASE_URL with migrations applied
uv run ruff check .
```

## Deploy

```bash
make deploy-be    # build + push image to ECR, roll the ECS service
```
