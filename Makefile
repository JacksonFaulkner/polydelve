# Polydelve — developer commands
# Usage: make <target>

.DEFAULT_GOAL := help

ifneq (,$(wildcard backend/.env))
  include backend/.env
  export
endif

UV  := cd backend && uv run
NPM := cd frontend &&

##@ Help

.PHONY: help
help: ## Show this help message
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
	/^[a-zA-Z_0-9-]+:.*?##/ { \
		target = $$1; desc = $$2; \
		while (length(desc) > 42) { \
			split_at = 42; \
			while (split_at > 1 && substr(desc, split_at, 1) != " ") split_at--; \
			if (target != "") { printf "  \033[36m%-22s\033[0m %s\n", target, substr(desc, 1, split_at - 1); target = ""; } \
			else printf "  %-22s  %s\n", "", substr(desc, 1, split_at - 1); \
			desc = substr(desc, split_at + 1); \
		} \
		if (target == "") printf "  %-22s  %s\n", "", desc; \
		else printf "  \033[36m%-22s\033[0m %s\n", target, desc; \
	} \
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

##@ Data pipeline — Onboarding (run once for new packages)

.PHONY: seed-packages
seed-packages: ## Bulk seed PyPI + npm packages up to ~100k (downloads, CVEs, EPSS, risk_score)
	$(UV) python scripts/seed_top_packages.py

.PHONY: build-cve-history
build-cve-history: ## Backfill CVE history for all tracked packages (requires seed-packages first)
	$(UV) python scripts/build_cve_history.py

.PHONY: classify-sectors-llm
classify-sectors-llm: ## LLM sector classification — slow + costs money, run for new packages only
	$(UV) python scripts/classify_package_sectors_llm.py

##@ Data pipeline — Scheduled (daily/frequent)

.PHONY: refresh-epss
refresh-epss: ## Refresh EPSS scores from FIRST API (safe to run frequently)
	$(UV) python scripts/refresh_epss.py

.PHONY: ingest-mal
ingest-mal: ## Ingest OSV MAL-* advisories for npm + PyPI (daily)
	$(UV) python scripts/ingest_mal_advisories.py

.PHONY: news-update
news-update: ## Fetch + ingest structured security news via GPT (daily, 7-day window)
	$(UV) python scripts/news_update.py

.PHONY: refresh-downloads
refresh-downloads: ## Refresh weekly_downloads + recompute risk_score (daily)
	$(UV) python scripts/refresh_downloads.py

.PHONY: enrich-sectors
enrich-sectors: ## Heuristic sector classification for packages missing sectors (daily)
	$(UV) python scripts/enrich_package_sectors.py

##@ Data pipeline — Export

.PHONY: push-motherduck
push-motherduck: ## Sync local DuckDB → MotherDuck prod (run last, after all enrichment)
	$(UV) python scripts/push_to_motherduck.py

.PHONY: ingest-epss-history
ingest-epss-history: ## Bulk-load historical EPSS CSV files (weekly, expensive I/O)
	$(UV) python scripts/ingest_epss_history.py

##@ Docs

.PHONY: extract-models
extract-models: ## Extract Pydantic models → docs/model-manifest.json
	python3 scripts/extract_models.py

.PHONY: docs
docs: extract-models ## Serve docs locally (Next.js, port 3001)
	cd docs && npm run dev

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

##@ Deploy

.PHONY: deploy
deploy: deploy-be deploy-fe ## Deploy backend + frontend

.PHONY: deploy-be
deploy-be: ## Build + push backend Docker image, force new ECS deployment
	./scripts/deploy-backend.sh

.PHONY: deploy-fe
deploy-fe: ## Build frontend, sync to S3, invalidate CloudFront
	./scripts/deploy-frontend.sh

.PHONY: tf-init
tf-init: ## Initialize terraform
	terraform -chdir=terraform init

.PHONY: tf-plan
tf-plan: ## Plan terraform changes
	terraform -chdir=terraform plan

.PHONY: tf-apply
tf-apply: ## Apply terraform changes
	terraform -chdir=terraform apply

##@ Cleanup

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf frontend/dist backend/.venv backend/__pycache__
