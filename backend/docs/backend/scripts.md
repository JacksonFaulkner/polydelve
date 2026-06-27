# Scripts

One-off and scheduled data scripts. All run via `make` or directly with `uv run python scripts/<name>.py`.

| Script | Make target | Description |
|--------|-------------|-------------|
| `news_update.py` | `make news-update` | Fetch latest security news via Exa |
| `refresh_downloads.py` | `make refresh-downloads` | Refresh weekly_downloads + recompute risk_score |
| `classify_package_sectors_llm.py` | `make classify-sectors-llm` | LLM-based sector classification (slower, higher accuracy) |
| `export_schema_excel.py` | `make export-schema` | Export DB to Excel for analysis |

## Recommended run order (fresh DB)

```bash
make refresh-downloads
make news-update
```
