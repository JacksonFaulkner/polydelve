# Data Pipeline

## News Pipeline

```
Exa search (security queries)
    │
    ▼
LLM extraction (Gemini)
    │  → company_labels, sector_labels, packages[]
    ▼
DuckDB news table
    │
    ▼
GET /news  →  Frontend RecentNews component
```

Run: `make news-update`

## CVE / Package Pipeline

```
Top 500 npm + PyPI packages fetched
    │
    ▼
OSV API  →  CVE history per package
    │
    ▼
PyPI/npm APIs  →  downloads, description
    │
    ▼
LLM / heuristics  →  sector classification
    │
    ▼
DuckDB packages table
```

Run order:
```bash
make build-cve-history      # 1. fetch CVE data
make enrich-packages        # 2. add metadata
make enrich-sectors         # 3. heuristic sector tags
make classify-sectors-llm   # 4. LLM sector tags (optional, slower)
```
