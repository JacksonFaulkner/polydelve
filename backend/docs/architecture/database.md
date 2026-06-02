# Database

DuckDB single-file database at `backend/action_odds.duckdb`.

## Schema

### `news`
| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR | UUID |
| `title` | VARCHAR | Article headline |
| `summary` | VARCHAR | LLM-generated summary |
| `source_url` | VARCHAR | Original article URL |
| `source_name` | VARCHAR | Publisher name |
| `published_date` | TIMESTAMP | Publication datetime |
| `sector_labels` | VARCHAR[] | e.g. `["Cybersecurity", "Cloud Computing"]` |
| `company_labels` | VARCHAR[] | e.g. `["Microsoft", "Google"]` |
| `primary_company_id` | VARCHAR | FK → companies |
| `packages` | STRUCT[] | Extracted package references |

### `packages`
| Column | Type | Description |
|--------|------|-------------|
| `name` | VARCHAR | Package name |
| `ecosystem` | VARCHAR | `npm` \| `PyPI` \| `composer` |
| `downloads_last_week` | BIGINT | Weekly download count |
| `description` | VARCHAR | Package description |
| `sectors` | VARCHAR[] | Tech sectors (LLM-classified) |
| `cve_count_1y` | INTEGER | CVEs in last 12 months |

### `companies`
| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR | UUID |
| `title` | VARCHAR | Company name |
| `logo` | VARCHAR | Logo URL |
| `grade` | VARCHAR | Security grade: A–D |

### `markets`
| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR | UUID |
| `company_id` | VARCHAR | FK → companies |
| `title` | VARCHAR | Market question |
| `grade` | VARCHAR | Inherited from company |
| `price` | INTEGER | Cost to enter (Schmeckles) |
| `payout` | INTEGER | Payout if resolved YES |
| `end_date` | TIMESTAMP | Resolution deadline |
| `status` | VARCHAR | `open` \| `closed` \| `resolved` |
