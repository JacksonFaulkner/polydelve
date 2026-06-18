import duckdb


def count_packages(conn: duckdb.DuckDBPyConnection, where: str, params: list) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM packages p WHERE {where}", params).fetchone()[0]


def list_packages(
    conn: duckdb.DuckDBPyConnection,
    where: str,
    params: list,
    sort_col: str,
    page_size: int,
    offset: int,
) -> list[tuple]:
    return conn.execute(
        f"""
        SELECT
            p.name,
            p.ecosystem,
            p.weekly_downloads,
            p.epss_score,
            p.risk_score,
            p.has_mal_advisory,
            p.sectors,
            p.logo_url,
            len(p.cve_ids) AS num_cves,
            COUNT(DISTINCT np.news_id)  AS news_mentions,
            MAX(ch.published_date)      AS latest_cve_date,
            MAX(ch.severity)            AS worst_severity,
            MAX(ch.cvss_score)          AS max_cvss_score
        FROM packages p
        LEFT JOIN news_packages np
            ON np.name = p.name AND np.ecosystem = p.ecosystem
        LEFT JOIN cve_history ch
            ON ch.name = p.name AND ch.ecosystem = p.ecosystem
        WHERE {where}
        GROUP BY
            p.name, p.ecosystem, p.weekly_downloads, p.epss_score,
            p.risk_score, p.has_mal_advisory, p.sectors, p.logo_url,
            len(p.cve_ids)
        ORDER BY {sort_col} DESC NULLS LAST
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()


def get_package(conn: duckdb.DuckDBPyConnection, name: str, ecosystem: str) -> tuple | None:
    return conn.execute(
        """
        SELECT
            p.name, p.ecosystem, p.weekly_downloads, p.epss_score,
            p.risk_score, p.has_mal_advisory, p.sectors, p.logo_url,
            p.cve_ids, p.last_enriched_at
        FROM packages p
        WHERE p.name = ? AND p.ecosystem = ?
        """,
        [name, ecosystem],
    ).fetchone()


def get_cve_history(conn: duckdb.DuckDBPyConnection, name: str, ecosystem: str) -> list[tuple]:
    return conn.execute(
        """
        SELECT osv_id, cve_id, published_date, severity, cvss_vector, cvss_score
        FROM cve_history
        WHERE name = ? AND ecosystem = ?
        ORDER BY published_date DESC
        """,
        [name, ecosystem],
    ).fetchall()


def get_package_news(conn: duckdb.DuckDBPyConnection, name: str, ecosystem: str) -> list[tuple]:
    return conn.execute(
        """
        SELECT n.id, n.title, n.published_date, n.source_name,
               n.source_url, n.summary, n.exploit_status, n.severity
        FROM news n
        JOIN news_packages np ON np.news_id = n.id
        WHERE np.name = ? AND np.ecosystem = ?
        ORDER BY n.published_date DESC
        LIMIT 10
        """,
        [name, ecosystem],
    ).fetchall()


def get_epss_history(conn: duckdb.DuckDBPyConnection, name: str, ecosystem: str) -> list[tuple]:
    return conn.execute(
        """
        WITH windowed AS (
            SELECT recorded_at, epss_score,
                LAG(epss_score)    OVER (ORDER BY recorded_at) AS prev_epss,
                LAG(recorded_at)   OVER (ORDER BY recorded_at) AS prev_date
            FROM epss_history
            WHERE name = ? AND ecosystem = ?
        )
        SELECT recorded_at, epss_score
        FROM windowed
        WHERE prev_epss IS NULL
           OR round(prev_epss, 5) != round(epss_score, 5)
           OR datediff('day', prev_date, recorded_at) >= 10
        ORDER BY recorded_at ASC
        """,
        [name, ecosystem],
    ).fetchall()
