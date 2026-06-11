import duckdb

from features.package_enrichment import validate_packages
from models.models import PackageRisk, RecentNews

_SIMILARITY_THRESHOLD = 0.92


def _exists(conn: duckdb.DuckDBPyConnection, news_id: str) -> bool:
    row = conn.execute("SELECT 1 FROM news WHERE id = ?", [news_id]).fetchone()
    return row is not None


def _find_semantic_duplicate(
    conn: duckdb.DuckDBPyConnection,
    embedding: list[float],
) -> tuple[str, float] | None:
    """Returns (matched_news_id, score) if a duplicate is found, else None."""
    row = conn.execute(
        """
        SELECT id, list_cosine_similarity(embed_description, ?::FLOAT[3072]) AS score
        FROM news
        ORDER BY score DESC
        LIMIT 1
        """,
        [embedding],
    ).fetchone()
    if row and row[1] is not None and row[1] >= _SIMILARITY_THRESHOLD:
        return (row[0], row[1])
    return None


def _log_duplicate(
    conn: duckdb.DuckDBPyConnection,
    candidate_url: str,
    matched_news_id: str,
    score: float,
) -> None:
    conn.execute(
        """
        INSERT INTO news_duplicates (candidate_url, matched_news_id, similarity_score)
        VALUES (?, ?, ?)
        ON CONFLICT (candidate_url, matched_news_id) DO NOTHING
        """,
        [candidate_url, matched_news_id, score],
    )


def _resolve_company_id(
    conn: duckdb.DuckDBPyConnection,
    company_labels: list[str],
) -> str | None:
    """Match first company_label to a known company id."""
    for label in company_labels:
        row = conn.execute(
            "SELECT id FROM companies WHERE title = ?", [label]
        ).fetchone()
        if row:
            return row[0]
    return None


def _insert_news(conn: duckdb.DuckDBPyConnection, article: RecentNews) -> None:
    exa, gpt = article.analysis.exa, article.analysis.gpt
    primary_company_id = _resolve_company_id(conn, gpt.company_labels)
    conn.execute(
        """
        INSERT INTO news (
            id, title, description, summary, source_name,
            primary_company_id, published_date, source_url,
            threat_actor, exploit_status, severity, relevancy_score,
            company_labels, sector_labels,
            embed_title, embed_description, embed_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    conn: duckdb.DuckDBPyConnection,
    news_id: str,
    packages: list[PackageRisk],
) -> None:
    if not packages:
        return
    # only insert packages that actually exist on their registry
    candidates = [(p.name, p.ecosystem) for p in packages if p.ecosystem in ("npm", "PyPI")]
    valid = await validate_packages(candidates) if candidates else set()
    verified = [p for p in packages if (p.name, p.ecosystem) in valid]
    if not verified:
        return
    # upsert canonical package record
    conn.executemany(
        """
        INSERT INTO packages (name, ecosystem, weekly_downloads, cve_ids, epss_score)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (name, ecosystem) DO NOTHING
        """,
        [(p.name, p.ecosystem, p.weekly_downloads, p.cve_ids, p.epss_score)
         for p in verified],
    )
    # insert join rows
    conn.executemany(
        """
        INSERT INTO news_packages (news_id, name, ecosystem)
        VALUES (?, ?, ?)
        ON CONFLICT (news_id, name) DO NOTHING
        """,
        [(news_id, p.name, p.ecosystem) for p in verified],
    )


async def ingest(conn: duckdb.DuckDBPyConnection, article: RecentNews) -> str:
    """Insert article if not already stored. Returns 'inserted', 'url_duplicate', or 'semantic_duplicate'."""
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


async def ingest_many(conn: duckdb.DuckDBPyConnection, articles: list[RecentNews]) -> dict[str, int]:
    counts: dict[str, int] = {"inserted": 0, "url_duplicate": 0, "semantic_duplicate": 0}
    for article in articles:
        result = await ingest(conn, article)
        counts[result] += 1
    return counts
