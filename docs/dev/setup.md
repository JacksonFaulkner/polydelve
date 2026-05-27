# Setup

## Prerequisites

- Python 3.14+
- [uv](https://docs.astral.sh/uv/) — Python package manager
- Node.js 20+
- npm

## Install

```bash
# Backend
make be-install

# Frontend
make fe-install

# Docs (optional)
cd backend && uv sync --group docs
```

## Environment

Copy secrets template and fill in API keys:

```bash
cp backend/secrets/.env.example backend/secrets/.env
```

Required keys:

| Key | Service |
|-----|---------|
| `EXA_API_KEY` | Exa news search |
| `GEMINI_API_KEY` | Google Gemini LLM |
| `OPENAI_API_KEY` | OpenAI (sector classification) |

## Run

```bash
make dev        # both servers concurrently
make be         # backend only (port 8000)
make fe         # frontend only (port 5173)
```
