# Make Commands

Run `make help` to see all targets.

```
$ make help

Usage:
  make <target>

Help
  help                   Show this help message

Backend
  be                     Start backend dev server
  be-install             Install backend dependencies
  be-install-dev         Install backend + dev dependencies
  be-test                Run backend tests
  be-shell               Open Python shell in backend venv

Scripts
  news-update            Fetch and store latest news
  refresh-downloads      Refresh weekly_downloads + recompute risk_score
  classify-sectors-llm   Classify package sectors via LLM
  export-schema          Export DB schema to Excel

Frontend
  fe                     Start frontend dev server
  fe-install             Install frontend dependencies
  fe-build               Build frontend for production
  fe-preview             Preview production frontend build

Docs
  docs                   Serve docs locally with live reload
  docs-build             Build static docs site
  docs-deploy            Deploy docs to GitHub Pages

Dev
  dev                    Start backend + frontend concurrently
  lint                   Lint frontend TypeScript
  clean                  Remove build artifacts
```
