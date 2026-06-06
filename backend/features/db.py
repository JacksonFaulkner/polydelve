import os

import duckdb
from fastapi import Request

# Switch to "md:polydelve" for MotherDuck
DB_PATH = os.getenv("DB_PATH", "polydelve.dev.duckdb")


def get_db(request: Request) -> duckdb.DuckDBPyConnection:
    return request.app.state.db


def get_db_conn() -> duckdb.DuckDBPyConnection:
    """Direct connection for scripts (no FastAPI Request context)."""
    conn = duckdb.connect(DB_PATH)
    init_db(conn)
    return conn


def init_db(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS companies (
            id      VARCHAR PRIMARY KEY,
            title   VARCHAR NOT NULL,
            logo    VARCHAR,
            grade   VARCHAR NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS markets (
            id          VARCHAR PRIMARY KEY,
            company_id  VARCHAR NOT NULL,
            title       VARCHAR NOT NULL,
            description VARCHAR NOT NULL,
            grade       VARCHAR NOT NULL,
            price       INTEGER NOT NULL,
            payout      INTEGER NOT NULL,
            end_date    TIMESTAMP NOT NULL,
            status      VARCHAR NOT NULL DEFAULT 'open'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id         VARCHAR PRIMARY KEY,
            username   VARCHAR NOT NULL,
            schmeckles INTEGER NOT NULL DEFAULT 1000
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS bets (
            id         VARCHAR PRIMARY KEY,
            user_id    VARCHAR NOT NULL,
            market_id  VARCHAR NOT NULL,
            placed_at  TIMESTAMP NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS news (
            id                 VARCHAR PRIMARY KEY,
            title              VARCHAR NOT NULL,
            description        VARCHAR,
            summary            VARCHAR,
            source_name        VARCHAR,
            primary_company_id VARCHAR,
            published_date     TIMESTAMPTZ,
            source_url         VARCHAR NOT NULL,
            threat_actor       VARCHAR,
            exploit_status     VARCHAR,
            severity           VARCHAR,
            company_labels     VARCHAR[],
            sector_labels      VARCHAR[],
            embed_title        FLOAT[3072],
            embed_description  FLOAT[3072],
            embed_source       FLOAT[3072],
            ingested_at        TIMESTAMPTZ DEFAULT now()
        )
    """)
    # Migrate existing DBs that predate summary/source_name/primary_company_id columns
    for col in ("summary VARCHAR", "source_name VARCHAR", "primary_company_id VARCHAR"):
        try:
            conn.execute(f"ALTER TABLE news ADD COLUMN {col}")
        except Exception:
            pass
    conn.execute("""
        CREATE TABLE IF NOT EXISTS packages (
            name             VARCHAR NOT NULL,
            ecosystem        VARCHAR NOT NULL,
            github_org       VARCHAR,
            logo_url         VARCHAR,
            weekly_downloads INTEGER,
            cve_ids          VARCHAR[],
            epss_score       FLOAT,
            has_mal_advisory BOOLEAN NOT NULL DEFAULT false,
            risk_score       FLOAT,
            last_enriched_at TIMESTAMPTZ,
            sectors          VARCHAR[],
            PRIMARY KEY (name, ecosystem)
        )
    """)

    # Migrate existing DBs that predate new columns
    def _safe(sql: str) -> None:
        try:
            conn.execute(sql)
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except Exception:
                pass

    _safe("ALTER TABLE packages ADD COLUMN sectors VARCHAR[]")
    _safe("ALTER TABLE packages ADD COLUMN risk_score FLOAT")
    _safe("ALTER TABLE packages ADD COLUMN has_mal_advisory BOOLEAN DEFAULT false")
    _safe("UPDATE packages SET has_mal_advisory = false WHERE has_mal_advisory IS NULL")
    _safe("ALTER TABLE packages DROP COLUMN in_cisa_kev")
    _safe("ALTER TABLE packages ADD COLUMN mal_advisory_published_at TIMESTAMPTZ")
    _safe("ALTER TABLE contracts ADD COLUMN opening_epss FLOAT")
    _safe("ALTER TABLE users ADD COLUMN email VARCHAR")
    _safe("ALTER TABLE users ALTER COLUMN username DROP NOT NULL")
    # epss_history: daily snapshot per package for drift tracking
    conn.execute("""
        CREATE TABLE IF NOT EXISTS epss_history (
            name        VARCHAR NOT NULL,
            ecosystem   VARCHAR NOT NULL,
            epss_score  FLOAT NOT NULL,
            recorded_at DATE NOT NULL DEFAULT current_date,
            PRIMARY KEY (name, ecosystem, recorded_at)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS news_packages (
            news_id   VARCHAR NOT NULL,
            name      VARCHAR NOT NULL,
            ecosystem VARCHAR NOT NULL,
            PRIMARY KEY (news_id, name)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cve_history (
            osv_id         VARCHAR NOT NULL,
            cve_id         VARCHAR,
            name           VARCHAR NOT NULL,
            ecosystem      VARCHAR NOT NULL,
            published_date TIMESTAMPTZ,
            modified_date  TIMESTAMPTZ,
            severity       VARCHAR,
            cvss_vector    VARCHAR,
            PRIMARY KEY (osv_id, name, ecosystem)
        )
    """)
    # Migrate cve_history to add cvss_score
    try:
        conn.execute("ALTER TABLE cve_history ADD COLUMN cvss_score FLOAT")
    except Exception:
        pass
    conn.execute("""
        CREATE TABLE IF NOT EXISTS contracts (
            id                   VARCHAR PRIMARY KEY,
            user_id              VARCHAR NOT NULL,
            package_name         VARCHAR NOT NULL,
            package_ecosystem    VARCHAR NOT NULL,
            market_type          VARCHAR NOT NULL,  -- new_cve | kev_listing | epss_threshold
            cvss_threshold       FLOAT,             -- for new_cve type
            epss_threshold       FLOAT,             -- for epss_threshold type
            purchase_price       INTEGER NOT NULL,
            max_payout           INTEGER NOT NULL,
            opening_probability  FLOAT NOT NULL,
            package_grade        FLOAT NOT NULL,
            expires_at           DATE NOT NULL,
            status               VARCHAR NOT NULL DEFAULT 'open',  -- open | won | lost | sold
            resolved_at          TIMESTAMPTZ,
            sell_price           INTEGER,
            created_at           TIMESTAMPTZ DEFAULT now()
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS news_duplicates (
            candidate_url    VARCHAR NOT NULL,
            matched_news_id  VARCHAR NOT NULL,
            similarity_score FLOAT NOT NULL,
            detected_at      TIMESTAMPTZ DEFAULT now(),
            PRIMARY KEY (candidate_url, matched_news_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS mal_advisories (
            osv_id       VARCHAR NOT NULL,
            name         VARCHAR NOT NULL,
            ecosystem    VARCHAR NOT NULL,
            published_at TIMESTAMPTZ,
            modified_at  TIMESTAMPTZ,
            withdrawn    BOOLEAN NOT NULL DEFAULT false,
            summary      VARCHAR,
            PRIMARY KEY (osv_id, name, ecosystem)
        )
    """)


_CDN = "https://cdn.simpleicons.org"

COMPANIES = [
    # Grade A — massive security orgs, slow to adopt unvetted deps
    {"id": "google", "title": "Google", "logo": f"{_CDN}/google", "grade": "A"},
    {
        "id": "microsoft",
        "title": "Microsoft",
        "logo": "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",
        "grade": "A",
    },
    # Grade B — strong security, but broader open-source surface
    {"id": "stripe", "title": "Stripe", "logo": f"{_CDN}/stripe", "grade": "B"},
    {
        "id": "cloudflare",
        "title": "Cloudflare",
        "logo": f"{_CDN}/cloudflare",
        "grade": "B",
    },
    {"id": "github", "title": "GitHub", "logo": f"{_CDN}/github", "grade": "B"},
    # Grade C — medium exposure, real third-party integration risk
    {"id": "shopify", "title": "Shopify", "logo": f"{_CDN}/shopify", "grade": "C"},
    {"id": "twilio", "title": "Twilio", "logo": f"{_CDN}/twilio", "grade": "C"},
    {"id": "okta", "title": "Okta", "logo": f"{_CDN}/okta", "grade": "C"},
    # Grade D — high npm/pip dependency count, fast-moving teams
    {
        "id": "robinhood",
        "title": "Robinhood",
        "logo": f"{_CDN}/robinhood",
        "grade": "D",
    },
    {"id": "coinbase", "title": "Coinbase", "logo": f"{_CDN}/coinbase", "grade": "D"},
    # Grade F — open source everything, huge transitive dep surface
    {"id": "vercel", "title": "Vercel", "logo": f"{_CDN}/vercel", "grade": "F"},
    {
        "id": "huggingface",
        "title": "Hugging Face",
        "logo": f"{_CDN}/huggingface",
        "grade": "F",
    },
    {"id": "replit", "title": "Replit", "logo": f"{_CDN}/replit", "grade": "F"},
]


def seed_companies(conn: duckdb.DuckDBPyConnection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
    if count >= len(COMPANIES):
        return
    conn.executemany(
        """
        INSERT INTO companies (id, title, logo, grade) VALUES (?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET title = excluded.title, logo = excluded.logo, grade = excluded.grade
        """,
        [(c["id"], c["title"], c["logo"], c["grade"]) for c in COMPANIES],
    )
    print(f"Seeded {len(COMPANIES)} companies.")


if __name__ == "__main__":
    conn = duckdb.connect(DB_PATH)
    init_db(conn)
    seed_companies(conn)
    conn.close()

