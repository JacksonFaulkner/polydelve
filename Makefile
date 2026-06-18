# Polydelve — developer commands
# Usage: make <target>

.DEFAULT_GOAL := help

ifneq (,$(wildcard backend/.env))
	include backend/.env
	export DATABASE_URL OPENAI_API_KEY MOTHERDUCK_TOKEN EXA_API_KEY
endif

UV   := cd backend && uv run
NPM  := cd frontend &&
ANIM := cd docs/animation &&

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
dev: ## Start Postgres + backend + frontend; Ctrl-C stops all three
	@./scripts/dev.sh

.PHONY: be
be: ## Start backend dev server
	$(UV) uvicorn main:app --reload --port 8000

.PHONY: fe
fe: ## Start frontend dev server
	$(NPM) npm run dev

##@ Animation (Remotion intro)

.PHONY: anim
anim: ## Open Remotion studio (live preview of the intro)
	$(ANIM) npm run studio

.PHONY: anim-render
anim-render: ## Render intro → docs/animation/out/intro.mp4
	$(ANIM) npm run render

.PHONY: anim-docs
anim-docs: ## Render intro mp4 + poster stills into docs/public/
	$(ANIM) npx remotion render src/index.ts PolydelveIntro ../public/intro.mp4
	$(ANIM) npx remotion still src/index.ts PolydelveIntro ../public/intro-poster.png --frame=250

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

##@ Data pipeline — Resolution

.PHONY: resolve-contracts
resolve-contracts: ## Resolve open contracts (wins + expiries), credit schmeckles
	$(UV) python scripts/resolve_contracts.py

.PHONY: resolve-contracts-dry
resolve-contracts-dry: ## Dry-run contract resolution (no writes)
	$(UV) python scripts/resolve_contracts.py --dry-run

##@ Data pipeline — Onboarding (run once for new packages)

.PHONY: seed-packages
seed-packages: ## Seed packages from top npm + PyPI (CVEs + EPSS required to insert)
	$(UV) python -c "import asyncio; from etl.jobs.packages import run_seed; from features.db import get_db_conn; conn = get_db_conn(); conn.autocommit = True; asyncio.run(run_seed(conn)); conn.close()"


.PHONY: build-cve-history
build-cve-history: ## Backfill CVE history for all tracked packages (requires seed-packages first)
	$(UV) python scripts/build_cve_history.py

.PHONY: classify-sectors-llm
classify-sectors-llm: ## LLM sector classification — slow + costs money, run for new packages only
	$(UV) python scripts/classify_package_sectors_llm.py

##@ Data pipeline — Scheduled (daily/frequent)
# Target DB comes from DB_PATH in backend/.env. Override per-run for prod:
#   make etl DB_PATH=md:polydelve

.PHONY: etl
etl: seed-packages etl-news etl-epss etl-mal-cached etl-packages ## Run full ETL pipeline (seed + daily jobs)

.PHONY: etl-news
etl-news: ## Fetch news, generate + rerank featured contracts (daily)
	$(UV) python -m etl.run news

.PHONY: etl-epss
etl-epss: ## Refresh EPSS scores from daily bulk file (daily)
	$(UV) python -m etl.run epss

.PHONY: etl-mal
etl-mal: ## Ingest OSV MAL-* advisories for npm + PyPI (re-downloads zips)
	$(UV) python -m etl.run mal

.PHONY: etl-mal-cached
etl-mal-cached: ## Ingest OSV MAL-* advisories using cached zips (no download)
	$(UV) python -m etl.run mal --skip-download

.PHONY: etl-packages
etl-packages: ## Refresh package metadata (weekly)
	$(UV) python -m etl.run packages

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

.PHONY: fe-test
fe-test: ## Run frontend tests
	$(NPM) npm test

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

##@ Auth0

A0 := a0deploy --config_file=auth0/config.json

.PHONY: auth0-export
auth0-export: ## Export Auth0 tenant config → auth0/
	env -u AUTH0_DOMAIN -u AUTH0_CLIENT_ID -u AUTH0_CLIENT_SECRET -u AUTH0_AUDIENCE $(A0) export --format=yaml --output_folder=auth0/

.PHONY: auth0-import
auth0-import: ## Import Auth0 tenant config from auth0/tenant.yaml
	env -u AUTH0_DOMAIN -u AUTH0_CLIENT_ID -u AUTH0_CLIENT_SECRET -u AUTH0_AUDIENCE $(A0) import --input_file=auth0/tenant.yaml

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
