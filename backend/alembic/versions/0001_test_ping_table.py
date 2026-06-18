"""test ping table

Revision ID: 0001
Revises:
Create Date: 2026-06-17
"""

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("""
        CREATE TABLE ping (
            id         SERIAL PRIMARY KEY,
            message    TEXT NOT NULL DEFAULT 'pong',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ping")
