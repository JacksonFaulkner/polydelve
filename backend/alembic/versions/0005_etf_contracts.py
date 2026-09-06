"""add etf_contracts + etf_contract_members for basket bets

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-01
"""

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("""
        CREATE TABLE etf_contracts (
            id                   TEXT PRIMARY KEY,
            user_id              TEXT NOT NULL,
            threshold_count      INTEGER NOT NULL,
            member_count         INTEGER NOT NULL,
            purchase_price       INTEGER NOT NULL,
            max_payout           INTEGER NOT NULL,
            opening_probability  FLOAT NOT NULL,
            avg_grade            FLOAT NOT NULL,
            expires_at           DATE NOT NULL,
            status               TEXT NOT NULL DEFAULT 'open',
            resolved_at          TIMESTAMPTZ,
            sell_price           INTEGER,
            created_at           TIMESTAMPTZ DEFAULT now()
        )
    """)
    op.execute("""
        CREATE TABLE etf_contract_members (
            id                   TEXT PRIMARY KEY,
            etf_contract_id      TEXT NOT NULL REFERENCES etf_contracts(id),
            package_name         TEXT NOT NULL,
            package_ecosystem    TEXT NOT NULL,
            cvss_threshold       FLOAT,
            epss_threshold       FLOAT,
            opening_probability  FLOAT NOT NULL,
            opening_epss         FLOAT,
            won                  BOOLEAN NOT NULL DEFAULT false,
            won_at               TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX idx_etf_contract_members_contract ON etf_contract_members(etf_contract_id)")
    op.execute("CREATE INDEX idx_etf_contracts_user ON etf_contracts(user_id)")
    op.execute("CREATE INDEX idx_etf_contracts_status ON etf_contracts(status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_etf_contracts_status")
    op.execute("DROP INDEX IF EXISTS idx_etf_contracts_user")
    op.execute("DROP INDEX IF EXISTS idx_etf_contract_members_contract")
    op.execute("DROP TABLE IF EXISTS etf_contract_members")
    op.execute("DROP TABLE IF EXISTS etf_contracts")
