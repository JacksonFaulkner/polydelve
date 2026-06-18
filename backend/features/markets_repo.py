from typing import Any


def count_news(conn: Any, where: str, params: list) -> int:
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM news WHERE {where}", params)
    return cur.fetchone()[0]


def list_news(
    conn: Any,
    where: str,
    params: list,
    page_size: int,
    offset: int,
) -> list[tuple]:
    cur = conn.cursor()
    cur.execute(
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
        LIMIT %s OFFSET %s
        """,
        params + [page_size, offset],
    )
    return cur.fetchall()


def list_companies(conn: Any) -> list[tuple]:
    cur = conn.cursor()
    cur.execute("SELECT id, title, logo, grade FROM companies")
    return cur.fetchall()


def list_markets(conn: Any, status: str) -> list[tuple]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT m.id, m.title, m.description, m.grade, m.price, m.payout,
               m.end_date, m.status, c.id, c.title, c.logo
        FROM markets m
        JOIN companies c ON c.id = m.company_id
        WHERE m.status = %s
        """,
        [status],
    )
    return cur.fetchall()


def get_market(conn: Any, market_id: str) -> tuple | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT m.id, m.title, m.description, m.grade, m.price, m.payout,
               m.end_date, m.status, c.id, c.title, c.logo
        FROM markets m
        JOIN companies c ON c.id = m.company_id
        WHERE m.id = %s
        """,
        [market_id],
    )
    return cur.fetchone()


def get_company_grade(conn: Any, company_id: str) -> str | None:
    cur = conn.cursor()
    cur.execute("SELECT grade FROM companies WHERE id = %s", [company_id])
    row = cur.fetchone()
    return row[0] if row else None


def create_market(
    conn: Any,
    market_id: str,
    company_id: str,
    title: str,
    description: str,
    grade: str,
    price: int,
    payout: int,
    end_date,
) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO markets (id, company_id, title, description, grade, price, payout, end_date, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'open')
        """,
        [market_id, company_id, title, description, grade, price, payout, end_date],
    )


def get_market_price_status(conn: Any, market_id: str) -> tuple | None:
    cur = conn.cursor()
    cur.execute("SELECT price, status FROM markets WHERE id = %s", [market_id])
    return cur.fetchone()


def place_bet(
    conn: Any,
    bet_id: str,
    user_id: str,
    market_id: str,
    placed_at,
    price: int,
) -> None:
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET schmeckles = schmeckles - %s WHERE id = %s AND schmeckles >= %s",
        [price, user_id, price],
    )
    cur.execute(
        "INSERT INTO bets (id, user_id, market_id, placed_at) VALUES (%s, %s, %s, %s)",
        [bet_id, user_id, market_id, placed_at],
    )
    conn.commit()


def get_user_basic(conn: Any, user_id: str) -> tuple | None:
    cur = conn.cursor()
    cur.execute("SELECT id, username, schmeckles FROM users WHERE id = %s", [user_id])
    return cur.fetchone()
