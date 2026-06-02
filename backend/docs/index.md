# Polydelve

**Prediction market platform for software security events.**

Bet on whether a CVE will be published for a top npm or PyPI package. Markets resolve automatically when OSV data confirms a vulnerability.

## Quick Start

```bash
# Install deps
make be-install
make fe-install

# Start both servers
make dev

# Fetch latest news
make news-update
```

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI, DuckDB, uv |
| Frontend | React 19, Vite, Tailwind v4 |
| Data | Exa news, OSV CVE feed, PyPI/npm APIs |
| LLM | OpenAI, Google Gemini |

## Architecture

See [Architecture Overview](architecture/overview.md).
