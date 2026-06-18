"""full schema

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-17
"""

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("""
        CREATE TABLE companies (
            id    TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            logo  TEXT,
            grade TEXT NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE markets (
            id          TEXT PRIMARY KEY,
            company_id  TEXT NOT NULL,
            title       TEXT NOT NULL,
            description TEXT NOT NULL,
            grade       TEXT NOT NULL,
            price       INTEGER NOT NULL,
            payout      INTEGER NOT NULL,
            end_date    TIMESTAMP NOT NULL,
            status      TEXT NOT NULL DEFAULT 'open'
        )
    """)

    op.execute("""
        CREATE TABLE users (
            id         TEXT PRIMARY KEY,
            username   TEXT,
            schmeckles INTEGER NOT NULL DEFAULT 1000,
            email      TEXT,
            avatar_url TEXT
        )
    """)

    op.execute("""
        CREATE TABLE bets (
            id        TEXT PRIMARY KEY,
            user_id   TEXT NOT NULL,
            market_id TEXT NOT NULL,
            placed_at TIMESTAMP NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE news (
            id                 TEXT PRIMARY KEY,
            title              TEXT NOT NULL,
            description        TEXT,
            summary            TEXT,
            source_name        TEXT,
            primary_company_id TEXT,
            published_date     TIMESTAMPTZ,
            source_url         TEXT NOT NULL,
            threat_actor       TEXT,
            exploit_status     TEXT,
            severity           TEXT,
            company_labels     TEXT[],
            sector_labels      TEXT[],
            embed_title        FLOAT[],
            embed_description  FLOAT[],
            embed_source       FLOAT[],
            relevancy_score    FLOAT DEFAULT 0.5,
            ingested_at        TIMESTAMPTZ DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE packages (
            name                      TEXT NOT NULL,
            ecosystem                 TEXT NOT NULL,
            github_org                TEXT,
            logo_url                  TEXT,
            weekly_downloads          INTEGER,
            cve_ids                   TEXT[],
            epss_score                FLOAT,
            has_mal_advisory          BOOLEAN NOT NULL DEFAULT false,
            risk_score                FLOAT,
            last_enriched_at          TIMESTAMPTZ,
            sectors                   TEXT[],
            mal_advisory_published_at TIMESTAMPTZ,
            PRIMARY KEY (name, ecosystem)
        )
    """)

    op.execute("""
        CREATE TABLE epss_history (
            name        TEXT NOT NULL,
            ecosystem   TEXT NOT NULL,
            epss_score  FLOAT NOT NULL,
            recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
            PRIMARY KEY (name, ecosystem, recorded_at)
        )
    """)

    op.execute("""
        CREATE TABLE news_packages (
            news_id   TEXT NOT NULL,
            name      TEXT NOT NULL,
            ecosystem TEXT NOT NULL,
            PRIMARY KEY (news_id, name)
        )
    """)

    op.execute("""
        CREATE TABLE cve_history (
            osv_id         TEXT NOT NULL,
            cve_id         TEXT,
            name           TEXT NOT NULL,
            ecosystem      TEXT NOT NULL,
            published_date TIMESTAMPTZ,
            modified_date  TIMESTAMPTZ,
            severity       TEXT,
            cvss_vector    TEXT,
            cvss_score     FLOAT,
            PRIMARY KEY (osv_id, name, ecosystem)
        )
    """)

    op.execute("""
        CREATE TABLE contracts (
            id                   TEXT PRIMARY KEY,
            user_id              TEXT NOT NULL,
            package_name         TEXT NOT NULL,
            package_ecosystem    TEXT NOT NULL,
            market_type          TEXT NOT NULL,
            cvss_threshold       FLOAT,
            epss_threshold       FLOAT,
            purchase_price       INTEGER NOT NULL,
            max_payout           INTEGER NOT NULL,
            opening_probability  FLOAT NOT NULL,
            package_grade        FLOAT NOT NULL,
            expires_at           DATE NOT NULL,
            status               TEXT NOT NULL DEFAULT 'open',
            resolved_at          TIMESTAMPTZ,
            sell_price           INTEGER,
            created_at           TIMESTAMPTZ DEFAULT now(),
            opening_epss         FLOAT
        )
    """)

    op.execute("""
        CREATE TABLE news_duplicates (
            candidate_url    TEXT NOT NULL,
            matched_news_id  TEXT NOT NULL,
            similarity_score FLOAT NOT NULL,
            detected_at      TIMESTAMPTZ DEFAULT now(),
            PRIMARY KEY (candidate_url, matched_news_id)
        )
    """)

    op.execute("""
        CREATE TABLE featured_contracts (
            id                  TEXT PRIMARY KEY,
            package_name        TEXT NOT NULL,
            package_ecosystem   TEXT NOT NULL,
            cvss_threshold      FLOAT,
            epss_threshold      FLOAT,
            purchase_price      INTEGER NOT NULL DEFAULT 100,
            duration_days       INTEGER NOT NULL,
            max_payout          INTEGER NOT NULL,
            opening_probability FLOAT NOT NULL,
            package_grade       FLOAT NOT NULL,
            expires_at          DATE NOT NULL,
            status              TEXT NOT NULL DEFAULT 'open',
            created_at          TIMESTAMPTZ DEFAULT now(),
            news_id             TEXT,
            relevancy_score     FLOAT NOT NULL DEFAULT 0.5
        )
    """)

    op.execute("""
        CREATE TABLE mal_advisories (
            osv_id       TEXT NOT NULL,
            name         TEXT NOT NULL,
            ecosystem    TEXT NOT NULL,
            published_at TIMESTAMPTZ,
            modified_at  TIMESTAMPTZ,
            withdrawn    BOOLEAN NOT NULL DEFAULT false,
            summary      TEXT,
            PRIMARY KEY (osv_id, name, ecosystem)
        )
    """)

    # Indexes
    op.execute("CREATE INDEX idx_contracts_user_id ON contracts (user_id)")
    op.execute("CREATE INDEX idx_contracts_status ON contracts (status)")
    op.execute("CREATE INDEX idx_contracts_expires_at ON contracts (expires_at)")
    op.execute("CREATE INDEX idx_packages_epss ON packages (epss_score)")
    op.execute("CREATE INDEX idx_news_published ON news (published_date)")
    op.execute("CREATE INDEX idx_epss_history_pkg ON epss_history (name, ecosystem)")


def downgrade() -> None:
    for table in [
        "mal_advisories",
        "featured_contracts",
        "news_duplicates",
        "contracts",
        "cve_history",
        "news_packages",
        "epss_history",
        "packages",
        "news",
        "bets",
        "users",
        "markets",
        "companies",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {table}")
