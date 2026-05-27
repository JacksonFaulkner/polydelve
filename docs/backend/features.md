# Features

## `features/db.py`
DuckDB connection and schema initialisation. Tables created on first run.

## `features/recent_news.py`
Exa-powered news fetcher. Runs LLM extraction (Gemini) to pull company names, sector labels, and referenced packages from each article.

## `features/news_repository.py`
Persistence layer for news — deduplication by URL, upsert into DuckDB.

## `features/cve_downloads.py`
Fetches weekly download counts from npm and PyPI APIs. Used to weight CVE impact.

## `features/cve_history.py`
Queries OSV API for historical CVEs against top npm/PyPI packages.

## `features/package_enrichment.py`
Enriches packages with description, download stats, and GitHub metadata.

## `features/package_sectors.py`
Classifies packages into tech sectors using:

1. PyPI Topic classifiers (heuristic rules)
2. Keyword matching
3. Package name substring rules

**Sectors:** AI / ML, Authentication, Build Tools, CLI / Utilities, Cryptography, Data Science, Database / ORM, Frontend / UI, HTTP Client, Infrastructure, Package Manager, Serialization, Testing, Web Framework

## `features/probability.py`
Calculates market probability scores based on CVE history and package download weight.

## `api/middleware/cors.py`
CORS config — allows `localhost:3000` and `localhost:5173` in development.
