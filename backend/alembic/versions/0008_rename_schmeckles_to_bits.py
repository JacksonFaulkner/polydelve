"""rename users.schmeckles column to bits

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-07
"""

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("ALTER TABLE users RENAME COLUMN schmeckles TO bits")


def downgrade() -> None:
    op.execute("ALTER TABLE users RENAME COLUMN bits TO schmeckles")
