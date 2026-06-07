# Polydelve

Prediction markets for software security risk. Open contracts on whether a package gets a new CVE, crosses an EPSS threshold, or lands on the KEV list. Built as a research and demo platform for exploring exploit-signal forecasting over the npm and PyPI ecosystems.

Live at [polydelve.com](https://polydelve.com)

## What it does

- **CVE tracking** — monitor packages across npm and PyPI for known vulnerabilities
- **EPSS trend charts** — exploitation probability over time with CVE scatter overlay
- **Exploit signals** — OSV malicious advisory detection, PoC and active exploit flags
- **Prediction markets** — open contracts on security events; Schmeckle-denominated, no real money
- **Leaderboard** — users ranked by prediction accuracy

## Stack

| Layer | Tech |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind, Shadcn, Recharts |
| Backend | FastAPI, Python 3.14, DuckDB |
| Database | MotherDuck (serverless DuckDB cloud) |
| Infra | AWS ECS Fargate, CloudFront, S3, Step Functions, EventBridge |
| Auth | Auth0 |

## Local dev

```bash
make install    # install all deps
make dev        # backend (8000) + frontend (5173)
make docs       # docs site (3001)
make help       # all targets
```

See the [docs](./docs) for architecture, API reference, data pipeline, and model docs.

## License

GPL-3.0
