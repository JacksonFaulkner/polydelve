"""add epss_crossings — materialized EPSS-spike events for the events ledger,
avoiding a LAG() window scan over all of epss_history on every request.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-07
"""

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("""
        CREATE TABLE epss_crossings (
            name         TEXT NOT NULL,
            ecosystem    TEXT NOT NULL,
            epss_score   FLOAT NOT NULL,
            crossed_at   DATE NOT NULL,
            PRIMARY KEY (name, ecosystem, crossed_at)
        )
    """)
    op.execute("CREATE INDEX idx_epss_crossings_date ON epss_crossings(crossed_at)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_epss_crossings_date")
    op.execute("DROP TABLE IF EXISTS epss_crossings")
