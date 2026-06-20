from typing import Any

from features.package_enrichment import validate_packages
from models.models import PackageRisk, RecentNews

_SIMILARITY_THRESHOLD = 0.08  # cosine distance threshold (lower = more similar)


def _exists(conn: Any, news_id: str) -> bool:
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM news WHERE id = %s", [news_id])
    return cur.fetchone() is not None


def _find_semantic_duplicate(
    conn: Any,
    embedding: list[float],
) -> tuple[str, float] | None:
    cur = conn.cursor()
    # pgvector <=> is cosine distance (0 = identical, 2 = opposite)
    cur.execute(
        """
        SELECT id, embed_description <=> %s::halfvec AS dist
        FROM news
        WHERE embed_description IS NOT NULL
        ORDER BY dist ASC
        LIMIT 1
        """,
        [embedding],
    )
    row = cur.fetchone()
    if row and row[1] <= _SIMILARITY_THRESHOLD:
        return (row[0], 1.0 - row[1])
    return None


def _log_duplicate(
    conn: Any,
    candidate_url: str,
    matched_news_id: str,
    score: float,
) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO news_duplicates (candidate_url, matched_news_id, similarity_score)
        VALUES (%s, %s, %s)
        ON CONFLICT (candidate_url, matched_news_id) DO NOTHING
        """,
        [candidate_url, matched_news_id, score],
    )


def _resolve_company_id(conn: Any, company_labels: list[str]) -> str | None:
    cur = conn.cursor()
    for label in company_labels:
        cur.execute("SELECT id FROM companies WHERE title = %s", [label])
        row = cur.fetchone()
        if row:
            return row[0]
    return None


def _insert_news(conn: Any, article: RecentNews) -> None:
    exa, gpt = article.analysis.exa, article.analysis.gpt
    primary_company_id = _resolve_company_id(conn, gpt.company_labels)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO news (
            id, title, description, summary, source_name,
            primary_company_id, published_date, source_url,
            threat_actor, exploit_status, severity, relevancy_score,
            company_labels, sector_labels,
            embed_title, embed_description, embed_source
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            article.id,
            exa.title,
            exa.description,
            article.summary,
            exa.source_name,
            primary_company_id,
            exa.published_date,
            exa.source_url,
            gpt.threat_actor,
            gpt.exploit_status,
            gpt.severity,
            gpt.relevancy_score,
            gpt.company_labels,
            gpt.sector_labels,
            article.embeddings.title,
            article.embeddings.description,
            article.embeddings.source,
        ],
    )


async def _insert_packages(
    conn: Any,
    news_id: str,
    packages: list[PackageRisk],
) -> None:
    if not packages:
        return
    candidates = [(p.name, p.ecosystem) for p in packages if p.ecosystem in ("npm", "PyPI")]
    valid = await validate_packages(candidates) if candidates else set()
    verified = [p for p in packages if (p.name, p.ecosystem) in valid]
    if not verified:
        return
    cur = conn.cursor()
    cur.executemany(
        """
        INSERT INTO packages (name, ecosystem, weekly_downloads, cve_ids, epss_score)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (name, ecosystem) DO NOTHING
        """,
        [(p.name, p.ecosystem, p.weekly_downloads, p.cve_ids, p.epss_score)
         for p in verified],
    )
    cur.executemany(
        """
        INSERT INTO news_packages (news_id, name, ecosystem)
        VALUES (%s, %s, %s)
        ON CONFLICT (news_id, name) DO NOTHING
        """,
        [(news_id, p.name, p.ecosystem) for p in verified],
    )


async def ingest(conn: Any, article: RecentNews) -> str:
    """Insert article if not already stored. Returns 'inserted', 'url_duplicate', 'semantic_duplicate', or 'too_old'."""
    from datetime import datetime, timedelta, timezone
    pub = article.analysis.exa.published_date
    if pub:
        pub_aware = pub if pub.tzinfo else pub.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - pub_aware
        if age > timedelta(days=14):
            return "too_old"

    if _exists(conn, article.id):
        return "url_duplicate"

    duplicate = _find_semantic_duplicate(conn, article.embeddings.description)
    if duplicate:
        matched_id, score = duplicate
        _log_duplicate(conn, article.analysis.exa.source_url, matched_id, score)
        return "semantic_duplicate"

    _insert_news(conn, article)
    await _insert_packages(conn, article.id, article.analysis.gpt.affected_packages)
    return "inserted"


async def ingest_many(conn: Any, articles: list[RecentNews]) -> dict[str, int]:
    counts: dict[str, int] = {"inserted": 0, "url_duplicate": 0, "semantic_duplicate": 0, "too_old": 0}
    for article in articles:
        result = await ingest(conn, article)
        counts[result] += 1
    return counts
