"""migrate news embed columns to pgvector

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-18
"""

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("ALTER TABLE news DROP COLUMN IF EXISTS embed_title")
    op.execute("ALTER TABLE news DROP COLUMN IF EXISTS embed_description")
    op.execute("ALTER TABLE news DROP COLUMN IF EXISTS embed_source")
    op.execute("ALTER TABLE news ADD COLUMN embed_title vector(3072)")
    op.execute("ALTER TABLE news ADD COLUMN embed_description vector(3072)")
    op.execute("ALTER TABLE news ADD COLUMN embed_source vector(3072)")
def downgrade() -> None:
    op.execute("ALTER TABLE news DROP COLUMN IF EXISTS embed_title")
    op.execute("ALTER TABLE news DROP COLUMN IF EXISTS embed_description")
    op.execute("ALTER TABLE news DROP COLUMN IF EXISTS embed_source")
    op.execute("ALTER TABLE news ADD COLUMN embed_title FLOAT[]")
    op.execute("ALTER TABLE news ADD COLUMN embed_description FLOAT[]")
    op.execute("ALTER TABLE news ADD COLUMN embed_source FLOAT[]")
