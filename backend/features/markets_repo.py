import duckdb


def count_news(conn: duckdb.DuckDBPyConnection, where: str, params: list) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM news WHERE {where}", params).fetchone()[0]


def list_news(
    conn: duckdb.DuckDBPyConnection,
    where: str,
    params: list,
    page_size: int,
    offset: int,
) -> list[tuple]:
    return conn.execute(
        f"""
        SELECT
            n.id, n.title, n.summary, n.source_url, n.source_name,
            n.published_date, n.sector_labels, n.company_labels,
            n.threat_actor, n.exploit_status, n.severity,
            array_agg(DISTINCT np.name || '::' || np.ecosystem)
                FILTER (WHERE np.name IS NOT NULL) AS packages
        FROM news n
        LEFT JOIN news_packages np ON np.news_id = n.id
        WHERE {where}
        GROUP BY
            n.id, n.title, n.summary, n.source_url, n.source_name,
            n.published_date, n.sector_labels, n.company_labels,
            n.threat_actor, n.exploit_status, n.severity, n.relevancy_score
        ORDER BY n.published_date::DATE DESC, coalesce(n.relevancy_score, 0.5) DESC, n.published_date DESC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()


def list_companies(conn: duckdb.DuckDBPyConnection) -> list[tuple]:
    return conn.execute("SELECT id, title, logo, grade FROM companies").fetchall()


def list_markets(conn: duckdb.DuckDBPyConnection, status: str) -> list[tuple]:
    return conn.execute(
        """
        SELECT m.id, m.title, m.description, m.grade, m.price, m.payout,
               m.end_date, m.status, c.id, c.title, c.logo
        FROM markets m
        JOIN companies c ON c.id = m.company_id
        WHERE m.status = ?
        """,
        [status],
    ).fetchall()


def get_market(conn: duckdb.DuckDBPyConnection, market_id: str) -> tuple | None:
    return conn.execute(
        """
        SELECT m.id, m.title, m.description, m.grade, m.price, m.payout,
               m.end_date, m.status, c.id, c.title, c.logo
        FROM markets m
        JOIN companies c ON c.id = m.company_id
        WHERE m.id = ?
        """,
        [market_id],
    ).fetchone()


def get_company_grade(conn: duckdb.DuckDBPyConnection, company_id: str) -> str | None:
    row = conn.execute("SELECT grade FROM companies WHERE id = ?", [company_id]).fetchone()
    return row[0] if row else None


def create_market(
    conn: duckdb.DuckDBPyConnection,
    market_id: str,
    company_id: str,
    title: str,
    description: str,
    grade: str,
    price: int,
    payout: int,
    end_date,
) -> None:
    conn.execute(
        """
        INSERT INTO markets (id, company_id, title, description, grade, price, payout, end_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
        """,
        [market_id, company_id, title, description, grade, price, payout, end_date],
    )


def get_market_price_status(conn: duckdb.DuckDBPyConnection, market_id: str) -> tuple | None:
    return conn.execute(
        "SELECT price, status FROM markets WHERE id = ?", [market_id]
    ).fetchone()


def place_bet(
    conn: duckdb.DuckDBPyConnection,
    bet_id: str,
    user_id: str,
    market_id: str,
    placed_at,
    price: int,
) -> None:
    conn.execute("BEGIN")
    conn.execute(
        "UPDATE users SET schmeckles = schmeckles - ? WHERE id = ? AND schmeckles >= ?",
        [price, user_id, price],
    )
    conn.execute(
        "INSERT INTO bets (id, user_id, market_id, placed_at) VALUES (?, ?, ?, ?)",
        [bet_id, user_id, market_id, placed_at],
    )
    conn.execute("COMMIT")


def get_user_basic(conn: duckdb.DuckDBPyConnection, user_id: str) -> tuple | None:
    return conn.execute(
        "SELECT id, username, schmeckles FROM users WHERE id = ?", [user_id]
    ).fetchone()
