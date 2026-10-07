# Polydelve

[![Tests](https://github.com/JacksonFaulkner/polydelve/actions/workflows/test.yml/badge.svg)](https://github.com/JacksonFaulkner/polydelve/actions/workflows/test.yml)
[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)

Prediction markets for software supply-chain risk. Bet (with play money) on whether a package gets a new CVE above a CVSS threshold, crosses an EPSS threshold, or picks up a malicious-package (MAL) advisory, or bundle several packages into one basket bet. Covers the npm, PyPI and Composer ecosystems.

**Live at [polydelve.com](https://polydelve.com)** · Docs at [docs.polydelve.com](https://docs.polydelve.com)

![Polydelve home: spotlight markets with EPSS trend and CVE history, plus security news feed](https://assets.polydelve.com/screenshots/qs-1-home.png)

## Interesting bits

- **Hazard-based pricing.** Each package's CVE rate is a blend of 90-day and 365-day Poisson rates with a prior and burst damping, so one noisy week doesn't dominate. Contract odds come from `P(≥1 event in N days) = 1 − e^(−λN)` and are re-marked daily as the window shrinks (`backend/features/contract_pricing.py`).
- **Basket (ETF) contracts priced like a parlay.** "At least K of N legs fire" is computed with an exact Poisson-binomial distribution; for K = N it reduces to the sportsbook parlay formula (`backend/features/etf_pricing.py`).
- **Semantic news dedup.** Articles are embedded and deduplicated by pgvector cosine distance before an LLM tags affected packages and generates featured markets (`backend/features/news_repository.py`).
- **Automatic settlement.** A scheduled ECS task ingests EPSS, news, MAL advisories and CVEs three times a day, then settles any contract whose condition fired and credits payouts in the same transaction (`backend/features/settlement.py`).

## Stack

| Layer    | Tech                                                                     |
| -------- | ------------------------------------------------------------------------ |
| Frontend | React, Vite, TypeScript, Tailwind, Recharts                              |
| Backend  | FastAPI, Python 3.14, psycopg2                                           |
| Database | PostgreSQL 16 + pgvector (RDS in prod, Docker locally), Alembic          |
| Infra    | Terraform: ECS Fargate, CloudFront, S3, RDS, EventBridge Scheduler       |
| Auth     | Auth0, plus backend-minted guest tokens for logged-out browsing           |
| Docs     | Fumadocs (Next.js)                                                       |

## Repo layout

```
polydelve/
├── backend/
│   ├── main.py            # FastAPI app entry point
│   ├── api/routes/        # contracts, etf, packages, prediction_market, users, ...
│   ├── features/          # pricing, settlement, repositories, DB pool
│   ├── etl/               # fetchers + jobs; CLI: python -m etl.run <job>
│   ├── alembic/           # schema migrations
│   ├── scripts/           # one-off CLIs (EPSS backfill, pricing backtest, ...)
│   └── tests/             # pytest suite (runs against Postgres)
├── frontend/src/
│   ├── components/        # pages and UI components
│   └── lib/               # API client, auth, utils
├── terraform/             # AWS infra
├── docs/                  # Fumadocs site
└── Makefile               # all dev commands (make help)
```

## Local dev

```bash
cp backend/.env.example backend/.env       # fill in Auth0 + API keys
cp frontend/.env.example frontend/.env.local
make install    # uv + npm deps
make dev        # Postgres (Docker) + backend :8000 + frontend :5173
make help       # full target list
```

See [docs: Local Setup](https://docs.polydelve.com/docs/build/local-setup) for details.

## Data flows

| Job | Source → table |
| --- | --- |
| `cve` | OSV bulk data → `cve_history` (defines the tracked package universe) |
| `packages` | npm/PyPI download stats + CVE/MAL checks → `packages.risk_score` |
| `epss` | FIRST EPSS via BigQuery → `epss_history` |
| `mal` | OSV `MAL-*` advisories → `mal_advisories` |
| `news` | Exa → embed + dedup → LLM tagging → featured contracts |
| `resolve` | the tables above → settles open contracts, credits bits |

The scheduled `refresh` job runs `epss → news → mal → cve → resolve`.

## Deployment

- **Backend:** Docker → ECR → ECS Fargate (`make deploy-be`)
- **Frontend:** Vite build → S3 → CloudFront (`make deploy-fe`)
- **ETL:** EventBridge Scheduler → Fargate task at 9am / 12pm / 5pm ET
- **Infra:** `cd terraform && terraform plan && terraform apply`

More in [docs: Deployment](https://docs.polydelve.com/docs/build/deployment) and [docs: Infrastructure](https://docs.polydelve.com/docs/build/infrastructure).

## Tests

```bash
make be-test    # pytest; needs Postgres (make dev starts it, or set DATABASE_URL)
make fe-test    # vitest
make lint       # ruff + eslint + tsc
```

CI runs all three on every pull request, with migrations applied to a fresh pgvector container.
