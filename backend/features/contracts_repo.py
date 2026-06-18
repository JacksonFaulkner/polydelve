import duckdb


def get_package_epss(conn: duckdb.DuckDBPyConnection, name: str, ecosystem: str) -> float | None:
    row = conn.execute(
        "SELECT epss_score FROM packages WHERE name = ? AND ecosystem = ?",
        [name, ecosystem],
    ).fetchone()
    return row[0] if row else None


def get_user_schmeckles(conn: duckdb.DuckDBPyConnection, user_id: str) -> int | None:
    row = conn.execute("SELECT schmeckles FROM users WHERE id = ?", [user_id]).fetchone()
    return row[0] if row else None


def buy_contract(
    conn: duckdb.DuckDBPyConnection,
    contract_id: str,
    user_id: str,
    name: str,
    ecosystem: str,
    market_type: str,
    cvss_t: float | None,
    epss_t: float | None,
    price: int,
    max_payout: int,
    open_prob: float,
    grade: float,
    expires_at,
    opening_epss: float | None,
) -> None:
    conn.execute("BEGIN")
    conn.execute(
        """
        INSERT INTO contracts (
            id, user_id, package_name, package_ecosystem, market_type,
            cvss_threshold, epss_threshold, purchase_price, max_payout,
            opening_probability, package_grade, expires_at, opening_epss
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [contract_id, user_id, name, ecosystem, market_type,
         cvss_t, epss_t, price, max_payout, open_prob, grade, expires_at, opening_epss],
    )
    result = conn.execute(
        "UPDATE users SET schmeckles = schmeckles - ? WHERE id = ? AND schmeckles >= ?",
        [price, user_id, price],
    )
    if result.rowcount == 0:
        conn.execute("ROLLBACK")
        raise ValueError("insufficient_schmeckles")
    conn.execute("COMMIT")


def list_contracts(conn: duckdb.DuckDBPyConnection, user_id: str) -> list[tuple]:
    return conn.execute(
        """
        SELECT c.id, c.package_name, c.package_ecosystem, c.market_type,
               c.cvss_threshold, c.epss_threshold, c.purchase_price, c.max_payout,
               c.opening_probability, c.package_grade, c.expires_at,
               c.status, c.resolved_at, c.sell_price, c.created_at,
               c.opening_epss, p.epss_score AS current_epss
        FROM contracts c
        LEFT JOIN packages p ON p.name = c.package_name AND p.ecosystem = c.package_ecosystem
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
        """,
        [user_id],
    ).fetchall()


def get_contract_for_sell(
    conn: duckdb.DuckDBPyConnection, contract_id: str, user_id: str
) -> tuple | None:
    return conn.execute(
        """
        SELECT c.user_id, c.purchase_price,
               c.expires_at, c.status, c.created_at,
               c.opening_epss, p.epss_score AS current_epss
        FROM contracts c
        LEFT JOIN packages p ON p.name = c.package_name AND p.ecosystem = c.package_ecosystem
        WHERE c.id = ? AND c.user_id = ?
        """,
        [contract_id, user_id],
    ).fetchone()


def sell_contract(
    conn: duckdb.DuckDBPyConnection, contract_id: str, user_id: str, sell_val: int
) -> None:
    conn.execute("BEGIN")
    conn.execute(
        "UPDATE contracts SET status = 'sold', sell_price = ?, resolved_at = now() WHERE id = ?",
        [sell_val, contract_id],
    )
    conn.execute(
        "UPDATE users SET schmeckles = schmeckles + ? WHERE id = ?",
        [sell_val, user_id],
    )
    conn.execute("COMMIT")
