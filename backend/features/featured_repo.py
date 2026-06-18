import duckdb


def list_featured_contracts(conn: duckdb.DuckDBPyConnection) -> list[tuple]:
    return conn.execute(
        """
        SELECT
            fc.id,
            fc.package_name,
            fc.package_ecosystem,
            fc.cvss_threshold,
            fc.epss_threshold,
            fc.purchase_price,
            fc.duration_days,
            fc.max_payout,
            fc.opening_probability,
            fc.package_grade,
            fc.expires_at,
            fc.created_at,
            p.weekly_downloads,
            p.epss_score,
            p.has_mal_advisory,
            p.logo_url,
            fc.relevancy_score
        FROM featured_contracts fc
        LEFT JOIN packages p ON p.name = fc.package_name AND p.ecosystem = fc.package_ecosystem
        WHERE fc.status = 'open'
        ORDER BY fc.relevancy_score DESC, fc.opening_probability DESC
        LIMIT 12
        """
    ).fetchall()
