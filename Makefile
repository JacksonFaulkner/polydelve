# Polydelve — developer commands
# Usage: make <target>

.DEFAULT_GOAL := help

UV  := uv --directory backend run
NPM := cd frontend &&

##@ Help

.PHONY: help
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
	/^[a-zA-Z_0-9-]+:.*?##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 } \
	/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)

##@ Dev

.PHONY: dev
dev: ## Start backend + frontend concurrently
	@trap 'kill 0' SIGINT; \
	$(MAKE) be & $(MAKE) fe & wait

.PHONY: be
be: ## Start backend dev server
	$(UV) uvicorn main:app --reload --port 8000

.PHONY: fe
fe: ## Start frontend dev server
	$(NPM) npm run dev

##@ Setup

.PHONY: install
install: ## Install all dependencies (backend + frontend)
	uv --directory backend sync
	$(NPM) npm install

.PHONY: be-install
be-install: ## Install backend dependencies
	uv --directory backend sync

.PHONY: fe-install
fe-install: ## Install frontend dependencies
	$(NPM) npm install

##@ Data pipeline

.PHONY: seed-packages
seed-packages: ## Seed top 500 PyPI + npm packages (downloads, CVEs, EPSS, KEV, risk_score)
	$(UV) python scripts/seed_top_packages.py

.PHONY: news-update
news-update: ## Fetch and store latest security news
	$(UV) python scripts/news_update.py

.PHONY: enrich-packages
enrich-packages: ## Enrich packages with logo + GitHub org (run after seed-packages)
	$(UV) python scripts/enrich_packages.py

.PHONY: enrich-sectors
enrich-sectors: ## Classify package sectors via heuristics
	$(UV) python scripts/enrich_package_sectors.py

.PHONY: classify-sectors-llm
classify-sectors-llm: ## Classify package sectors via LLM (slow, optional)
	$(UV) python scripts/classify_package_sectors_llm.py

##@ Docs

.PHONY: docs
docs: ## Serve docs locally with live reload
	$(UV) --group docs mkdocs serve

.PHONY: docs-build
docs-build: ## Build static docs site
	$(UV) --group docs mkdocs build

.PHONY: docs-deploy
docs-deploy: ## Deploy docs to GitHub Pages
	$(UV) --group docs mkdocs gh-deploy

##@ Quality

.PHONY: be-test
be-test: ## Run backend tests
	$(UV) pytest

.PHONY: lint
lint: be-lint fe-lint ## Lint backend and frontend

.PHONY: be-lint
be-lint: ## Lint backend Python (ruff)
	uv --directory backend run ruff check .

.PHONY: fe-lint
fe-lint: ## Lint frontend TypeScript
	$(NPM) npx tsc --noEmit

.PHONY: fe-build
fe-build: ## Build frontend for production
	$(NPM) npm run build

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf frontend/dist backend/.venv backend/__pycache__
