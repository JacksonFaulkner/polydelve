# polydelve-backend

FastAPI backend for Polydelve. Ingests vulnerability, exploit-signal, package, and prediction-market data into MotherDuck (serverless DuckDB cloud).

## Dev

```bash
uv sync
uv run uvicorn api.main:app --reload --port 8000
```

Or from the repo root:

```bash
make be
```

## Structure

```
api/          FastAPI routes and middleware
etl/          ingestion and enrichment pipelines
models/       Pydantic models (field docs at /docs/data/models)
scripts/      seed and utility scripts
```

## Data pipeline

Daily cron: EventBridge → Step Functions → 6 sequential ECS tasks → MotherDuck.
See [pipeline docs](../docs/content/docs/data/pipeline.mdx) for the full flow.

## Deploy

```bash
make deploy-be    # build + push Docker image to ECR, update ECS service
```
