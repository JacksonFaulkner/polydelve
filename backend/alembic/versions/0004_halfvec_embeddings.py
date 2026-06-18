"""migrate embed columns from vector to halfvec for index support at 3072 dims

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-18
"""

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.execute("ALTER TABLE news ALTER COLUMN embed_title TYPE halfvec(3072) USING embed_title::halfvec(3072)")
    op.execute("ALTER TABLE news ALTER COLUMN embed_description TYPE halfvec(3072) USING embed_description::halfvec(3072)")
    op.execute("ALTER TABLE news ALTER COLUMN embed_source TYPE halfvec(3072) USING embed_source::halfvec(3072)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_news_embed_desc ON news "
        "USING hnsw (embed_description halfvec_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_news_embed_desc")
    op.execute("ALTER TABLE news ALTER COLUMN embed_title TYPE vector(3072) USING embed_title::vector(3072)")
    op.execute("ALTER TABLE news ALTER COLUMN embed_description TYPE vector(3072) USING embed_description::vector(3072)")
    op.execute("ALTER TABLE news ALTER COLUMN embed_source TYPE vector(3072) USING embed_source::vector(3072)")
