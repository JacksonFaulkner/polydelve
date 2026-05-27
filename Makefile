# Polydelve — developer commands
# Usage: make <target>

.DEFAULT_GOAL := help

##@ Help

.PHONY: help
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
	/^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 } \
	/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Backend

.PHONY: be
be: ## Start backend dev server
	cd backend && uv run uvicorn main:app --reload --port 8000

.PHONY: be-install
be-install: ## Install backend dependencies
	cd backend && uv sync

.PHONY: be-install-dev
be-install-dev: ## Install backend + dev dependencies
	cd backend && uv sync --group dev

.PHONY: be-test
be-test: ## Run backend tests
	cd backend && uv run pytest

.PHONY: be-shell
be-shell: ## Open Python shell in backend venv
	cd backend && uv run python

##@ Scripts

.PHONY: news-update
news-update: ## Fetch and store latest news
	cd backend && uv run python scripts/news_update.py

.PHONY: build-cve-history
build-cve-history: ## Build CVE history for top npm/PyPI packages
	cd backend && uv run python scripts/build_cve_history.py

.PHONY: enrich-packages
enrich-packages: ## Enrich packages with metadata (downloads, description)
	cd backend && uv run python scripts/enrich_packages.py

.PHONY: enrich-sectors
enrich-sectors: ## Classify package sectors via heuristics
	cd backend && uv run python scripts/enrich_package_sectors.py

.PHONY: classify-sectors-llm
classify-sectors-llm: ## Classify package sectors via LLM
	cd backend && uv run python scripts/classify_package_sectors_llm.py

.PHONY: export-schema
export-schema: ## Export DB schema to Excel
	cd backend && uv run --group schema-export python scripts/export_schema_excel.py

##@ Frontend

.PHONY: fe
fe: ## Start frontend dev server
	cd frontend && npm run dev

.PHONY: fe-install
fe-install: ## Install frontend dependencies
	cd frontend && npm install

.PHONY: fe-build
fe-build: ## Build frontend for production
	cd frontend && npm run build

.PHONY: fe-preview
fe-preview: ## Preview production frontend build
	cd frontend && npm run preview

##@ Docs

.PHONY: docs
docs: ## Serve docs locally with live reload
	cd backend && uv run --group docs mkdocs serve

.PHONY: docs-build
docs-build: ## Build static docs site
	cd backend && uv run --group docs mkdocs build

.PHONY: docs-deploy
docs-deploy: ## Deploy docs to GitHub Pages
	cd backend && uv run --group docs mkdocs gh-deploy

##@ Dev

.PHONY: dev
dev: ## Start backend + frontend concurrently
	@trap 'kill 0' SIGINT; \
	$(MAKE) be & $(MAKE) fe & wait

.PHONY: lint
lint: ## Lint frontend TypeScript
	cd frontend && npx tsc --noEmit

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf frontend/dist backend/.venv backend/__pycache__
