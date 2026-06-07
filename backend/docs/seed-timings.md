# Seed Run Timings

## Future optimization

- **S3 snapshot**: Upload a pre-seeded `polydelve.duckdb` to S3 after a full seed run. New environments pull the snapshot (~80% of data already there) then run only the catch-up steps (EPSS delta, MAL, news). Cuts cold-start from ~30 min to ~5 min.

## Seed flow (ordered)

Target: `polydelve.test.duckdb`  
Machine: MacBook (local)  
Date: 2026-06-06

| Step               | Command                                     | Duration | Notes                                                                                                                                     |
| ------------------ | ------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Schema init     | `get_db_conn()`                             | 0.24s    | 12 tables created                                                                                                                         |
| 2. Seed packages   | `make seed-packages`                        | 2m 04s   | 28,628 packages (15k PyPI + 13.6k npm), 12,177 CVE records, 4,999 EPSS scores                                                             |
| 3. EPSS refresh    | `refresh_epss.py --latest-cached`           | 0.37s    | 5,123 CVEs → 1,359 packages scored, 1,359 history rows. Zero network (cached 2026-06-04).                                                 |
| 3b. EPSS history   | `ingest_epss_history.py --start 2021-04-14` | 1m 53s   | 1,471,184 rows loaded. 1,869 cached files + 1 downloaded (2026-06-05). 10 days 403 (missing from upstream). Part of seed flow.            |
| 4. MAL advisories  | `make ingest-mal`                           | 15s      | 225,094 MAL records (213k npm + 11k PyPI). 87 tracked packages flagged. Zips cached after first run.                                      |
| 5. Refresh downloads | `make refresh-downloads`                  | 21.6s    | 5,442 npm downloads fetched (266 scoped batches), 74 updated, 1,218 risk scores computed. No EPSS API calls (handled by refresh_epss.py). |
| 6. Enrich sectors  | `make enrich-sectors`                       | —        | —                                                                                                                                         |
| 7. News update     | `make news-update`                          | —        | —                                                                                                                                         |

## Findings

### Step 1 — Schema init

- 0.24s cold start including uv + Python boot
- All 12 tables present: bets, companies, contracts, cve_history, epss_history, mal_advisories, markets, news, news_duplicates, news_packages, packages, users

### Step 2 — Seed packages

- BQ PyPI: 21s for 15,000 packages (all matched)
- npm: 44.7s — 7,889 unscoped (62 batches) + 5,739 scoped (287 batches via npm-stat)
- OSV CVE bulk: npm zip 206MB, PyPI 24MB — 12,177 records across 1,375 packages
- EPSS: 4,999 scores fetched (packages with CVEs only)
- Top risk: cryptography, numpy, js-yaml, ws, aiohttp
- Bottleneck: npm scoped batch API (287 requests) — biggest time sink
