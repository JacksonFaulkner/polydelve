# Architecture Overview

```
┌─────────────────┐     ┌──────────────────────────────┐
│   Frontend      │────▶│  FastAPI (port 8000)          │
│   React + Vite  │     │  /news  /markets  /companies  │
│   (port 5173)   │     └──────────────┬───────────────┘
└─────────────────┘                    │
                                       ▼
                            ┌──────────────────┐
                            │  DuckDB          │
                            │  action_odds.db  │
                            └──────────────────┘
                                       ▲
                            ┌──────────┴─────────┐
                            │  Data Pipeline      │
                            │  Exa → news         │
                            │  OSV → CVE history  │
                            │  PyPI/npm → packages│
                            └────────────────────┘
```

## Key Tables

| Table | Description |
|-------|-------------|
| `news` | Security news articles with LLM-extracted package/sector tags |
| `packages` | Top npm + PyPI packages with CVE history and sector classification |
| `companies` | Software companies with security grade |
| `markets` | Prediction markets linked to companies |
| `bets` | User bets on markets |
| `users` | User accounts with Schmeckle balance |
