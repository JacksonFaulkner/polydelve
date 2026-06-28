# POV: Reorganize the Docs

## Current structure

```
Polydelve
├── Introduction
├── Backend
│   ├── Prediction Markets       ← product concept
│   ├── Vulnerability Tracking   ← product concept + data
│   ├── Scoring & Leaderboard    ← product concept
│   ├── API Reference            ← reference
│   ├── ADR: Postgres + Alembic  ← project history
│   └── Local DB Setup           ← contributor setup
├── Frontend
│   ├── Pages & Navigation       ← product concept
│   └── Market UX                ← product concept
├── Data
│   ├── Data Pipeline            ← data internals
│   ├── Local Dev                ← contributor setup
│   └── Models                   ← reference
└── Lore                         ← project history
```

## Problem

Top-level nav mirrors the **codebase layout** (Backend / Frontend / Data), not the
**reader's intent**. Three consequences:

1. **Concepts are scattered.** "How a market works" spans
   `backend/prediction-markets`, `backend/scoring`, `backend/vulnerability-tracking`,
   and `frontend/market-ux`. A reader who wants to understand the product must hop
   across three sections that look like engineering buckets.

2. **Setup is split.** Contributor onboarding lives in both `backend/local-db` and
   `data/local-dev`. No single "get it running" path.

3. **Audience collision.** Product concepts, API reference, contributor setup, and
   project history all sit at the same depth under engineering labels. A first-time
   visitor lands on "Backend" and can't tell what's conceptual vs. internal.

The split also forces arbitrary calls — vulnerability-tracking is as much "data" as
"backend"; pages/market-ux are "frontend" but describe product behavior, not code.

## Proposed structure — organize by reader intent

```
Polydelve
├── Introduction                 (unchanged: what + demo video)
│
├── Concepts                     "understand the product"
│   ├── Prediction Markets       (from backend/prediction-markets)
│   ├── Vulnerability Tracking   (from backend/vulnerability-tracking)
│   ├── Scoring & Leaderboard    (from backend/scoring)
│   └── Using the App            (merge frontend/pages + frontend/market-ux)
│
├── Build                        "run + contribute"
│   ├── Local Setup              (merge backend/local-db + data/local-dev)
│   └── Data Pipeline            (from data/pipeline)
│
├── Reference                    "look up exact details"
│   ├── API                      (from backend/api)
│   └── Models                   (from data/models, auto-generated)
│
└── Project                      "history + decisions"
    ├── Lore                     (from lore)
    └── ADR: Postgres + Alembic  (from backend/adr-postgres-alembic)
```

### Why these four buckets

- **Concepts** — answers "what is Polydelve and how does it behave," product-first,
  no code required. Pulls the four scattered concept pages into one read.
- **Build** — single onboarding path. Kills the local-setup split.
- **Reference** — lookup material (API, models). Both are stable, both get linked
  to, both benefit from being findable without wading through prose.
- **Project** — lore + ADRs. Context, not instruction. Keeps history out of the
  task-oriented sections.

## Mapping (every current page has a home)

| Current                             | New                             |
| ----------------------------------- | ------------------------------- |
| introduction                        | introduction                    |
| backend/prediction-markets          | concepts/prediction-markets     |
| backend/vulnerability-tracking      | concepts/vulnerability-tracking |
| backend/scoring                     | concepts/scoring                |
| frontend/pages + frontend/market-ux | concepts/using-the-app (merge)  |
| backend/local-db + data/local-dev   | build/local-setup (merge)       |
| data/pipeline                       | build/data-pipeline             |
| backend/api                         | reference/api                   |
| data/models                         | reference/models                |
| lore                                | project/lore                    |
| backend/adr-postgres-alembic        | project/adr-postgres-alembic    |

No pages dropped. Two merges (using-the-app, local-setup) reduce 12 leaf pages → 10.

## Execution notes

- Pure Fumadocs file-tree + `meta.json` change. Move `.mdx` files into new dirs,
  rewrite the four `meta.json` (root + 4 sections → root + 4 new sections), update
  cross-links and any relative imports.
- Watch: `data/models.mdx` imports `../../../app/components/ModelReference` — depth
  unchanged (`reference/models`), import path stays valid. Verify after move.
- Add redirects from old `/docs/backend/*`, `/docs/frontend/*`, `/docs/data/*` slugs
  to avoid breaking external links.
- Two merges need a light edit pass to dedupe headings, not just concatenation.

## Open calls

1. **Naming.** "Build" vs "Contributing" vs "Development" for the engineering bucket.
2. **Merge depth.** Full merge of pages+market-ux, or keep as two pages under Concepts?
3. **ADR placement.** Project/ section, or a dedicated `decisions/` if more ADRs coming.

```

```

## Pages to add

Gaps the current 12 pages don't cover. Slotted into the proposed buckets.

### Concepts

- **Quickstart / "Place your first bet"** — 5-step walkthrough: land → pick package →
  read EPSS → buy → see payout. Current `using-the-app` is reference-style, not a
  guided first run. High-value top entry after Introduction.
- **Market Resolution** — how/when contracts settle. Touched in prediction-markets,
  but the OSV-confirms-CVE trigger, timing, and edge cases (no CVE before deadline,
  disputed advisories) deserve a focused page.
- **Glossary** — CVE, EPSS, CVSS, MAL advisory, contract, multiplier, max_payout,
  relevancy_score. These terms recur across every concept page with no single
  definition source.

### Build

- **Architecture Overview** — one diagram, the whole system: feed → API → Postgres →
  ETL → external data sources. Today the system is implied across api/pipeline pages;
  no single map. Belongs at the top of Build.
- **Deployment** — AWS topology, **rolling deploys with `min_healthy=0`, no
  canary/blue-green** (side project, no users). How a release ships.
- **Infrastructure (Terraform)** — IaC layout once Terraform lands. Currently
  next-step work; stub now, fill as it lands. Pair with the local-db nvim-dbee
  workflow note.
- **Auth0 Setup** — login gate appears in market-ux/api but config (tenant, callback
  URLs, env vars) is undocumented. Needed for any contributor running locally.

### Reference

- **Data Sources** — provenance table for every external feed: **EPSS via BigQuery
  bulk (never the FIRST API loop)**, OSV, npm/PyPI download APIs, news. Refresh
  cadence, owning ETL job, and gotchas per source.
- **ETL Jobs** — per-job reference (`packages`, `refresh_epss`,
  `ingest_epss_history`, news): command, inputs, outputs, schedule. Pipeline page is
  prose; this is the lookup table.
- **Environment Variables** — consolidated `.env` reference. Scattered across setup
  pages today.

### Project

- **Roadmap** — what's next (Terraform, more ADRs). Pairs with Lore for direction.

### Priority

If shipping a few: **Quickstart**, **Architecture Overview**, **Data Sources**,
**Glossary**. They close the biggest first-visit gaps (no guided start, no system
map, no provenance, no term defs).
