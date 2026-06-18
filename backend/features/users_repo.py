import duckdb


def get_user(conn: duckdb.DuckDBPyConnection, user_id: str) -> tuple | None:
    return conn.execute(
        "SELECT id, email, username, schmeckles, avatar_url FROM users WHERE id = ?", [user_id]
    ).fetchone()


def upsert_user(conn: duckdb.DuckDBPyConnection, user_id: str, email: str | None) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO users (id, email, username, schmeckles) VALUES (?, ?, NULL, 1000)",
        [user_id, email],
    )


def check_username_taken(conn: duckdb.DuckDBPyConnection, username: str, exclude_id: str) -> bool:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ? AND id != ?", [username, exclude_id]
    ).fetchone()
    return row is not None


def set_username(conn: duckdb.DuckDBPyConnection, user_id: str, username: str) -> None:
    conn.execute("UPDATE users SET username = ? WHERE id = ?", [username, user_id])


def set_avatar_url(conn: duckdb.DuckDBPyConnection, user_id: str, avatar_url: str) -> None:
    conn.execute("UPDATE users SET avatar_url = ? WHERE id = ?", [avatar_url, user_id])


def count_users(conn: duckdb.DuckDBPyConnection) -> int:
    return (conn.execute("SELECT COUNT(*) FROM users").fetchone() or (0,))[0]


def get_ranked_users(conn: duckdb.DuckDBPyConnection, limit: int, offset: int) -> list[tuple]:
    return conn.execute(
        """
        SELECT id, username, schmeckles,
               ROW_NUMBER() OVER (ORDER BY schmeckles DESC) AS rank
        FROM users
        ORDER BY schmeckles DESC
        LIMIT ? OFFSET ?
        """,
        [limit, offset],
    ).fetchall()


def get_contracts_for_users(conn: duckdb.DuckDBPyConnection, user_ids: list[str]) -> list[tuple]:
    if not user_ids:
        return []
    placeholders = ", ".join("?" * len(user_ids))
    return conn.execute(
        f"""
        SELECT user_id, id, package_name, package_ecosystem, market_type,
               purchase_price, max_payout, opening_probability, status,
               expires_at::VARCHAR, created_at::VARCHAR
        FROM contracts
        WHERE user_id IN ({placeholders})
        ORDER BY created_at DESC
        """,
        user_ids,
    ).fetchall()


def get_user_schmeckles(conn: duckdb.DuckDBPyConnection, user_id: str) -> int | None:
    row = conn.execute("SELECT schmeckles FROM users WHERE id = ?", [user_id]).fetchone()
    return row[0] if row else None


def get_user_contract_history(conn: duckdb.DuckDBPyConnection, user_id: str) -> list[tuple]:
    return conn.execute(
        """
        SELECT created_at::VARCHAR, resolved_at::VARCHAR,
               purchase_price, max_payout, sell_price, status
        FROM contracts
        WHERE user_id = ?
        ORDER BY created_at ASC
        """,
        [user_id],
    ).fetchall()


def get_user_basic(conn: duckdb.DuckDBPyConnection, user_id: str) -> tuple | None:
    return conn.execute(
        "SELECT id, username, schmeckles FROM users WHERE id = ?", [user_id]
    ).fetchone()
