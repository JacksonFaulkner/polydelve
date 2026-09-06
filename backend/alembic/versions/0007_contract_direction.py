"""add direction to contracts — 'yes' (default, existing behavior) or 'no'
(bet that a package with a recent CVSS event will NOT get another one)

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-07
"""

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("ALTER TABLE contracts ADD COLUMN direction TEXT NOT NULL DEFAULT 'yes'")


def downgrade() -> None:
    op.execute("ALTER TABLE contracts DROP COLUMN IF EXISTS direction")
