# Scripts

One-off and scheduled data scripts. All run via `make` or directly with `uv run python scripts/<name>.py`.

| Script | Make target | Description |
|--------|-------------|-------------|
| `news_update.py` | `make news-update` | Fetch latest security news via Exa |
| `build_cve_history.py` | `make build-cve-history` | Build CVE history for top 500 npm + PyPI packages |
| `enrich_packages.py` | `make enrich-packages` | Add download stats + descriptions to packages |
| `enrich_package_sectors.py` | `make enrich-sectors` | Classify package sectors via heuristics |
| `classify_package_sectors_llm.py` | `make classify-sectors-llm` | LLM-based sector classification (slower, higher accuracy) |
| `export_schema_excel.py` | `make export-schema` | Export DB to Excel for analysis |

## Recommended run order (fresh DB)

```bash
make build-cve-history
make enrich-packages
make enrich-sectors
make news-update
```
