# Architecture Overview

## Production

```
                    ┌─────────────────────────────────────────────┐
                    │  AWS                                         │
  Users ──────────▶ │  CloudFront (polydelve.com)                  │
                    │    /api/* ──CF function strips prefix──────▶ │
                    │    ECS Express Gateway (FastAPI, 512c/1GB)   │
                    │      ↓ secrets from Secrets Manager          │
                    │    /* ──────────────────────────────────────▶│
                    │    S3 (React SPA, private + OAC)             │
                    └──────────────────────────────────────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │  MotherDuck           │
                            │  md:polydelve (DuckDB)│
                            └──────────────────────┘
                                       ▲
                            ┌──────────┴──────────┐
                            │  ETL (python -m etl) │
                            │  Exa + GPT → news    │
                            │  BigQuery → EPSS     │
                            │  OSV → CVE history   │
                            │  PyPI/npm → packages │
                            └─────────────────────┘
```

**ECS service:** `aws_ecs_express_gateway_service` — serverless, auto-scales 1–5 tasks on avg CPU ≥ 70%.  
**Secrets:** `motherduck_token`, `openai_api_key`, `exa_api_key`, `gcp_sa_json`, `auth0_domain`, `auth0_audience` — injected via Secrets Manager at task start.

## Local Dev

```
React + Vite (port 5173) ──▶ FastAPI (port 8000) ──▶ DuckDB (polydelve.dev.duckdb)
```

## Key Tables

| Table | Description |
|-------|-------------|
| `news` | Security articles; GPT-extracted sector/package tags + `relevancy_score` |
| `packages` | Top npm + PyPI packages with CVE history, EPSS, sector classification |
| `featured_contracts` | Auto-generated prediction markets ranked by `relevancy_score` |
| `contracts` | User-purchased prediction contracts with thresholds and resolution status |
| `users` | User accounts with Schmeckle balance |
| `companies` | Software companies with security grade |
