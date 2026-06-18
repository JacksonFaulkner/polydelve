from typing import Any


def get_user(conn: Any, user_id: str) -> tuple | None:
    cur = conn.cursor()
    cur.execute(
        "SELECT id, email, username, schmeckles, avatar_url FROM users WHERE id = %s", [user_id]
    )
    return cur.fetchone()


def upsert_user(conn: Any, user_id: str, email: str | None) -> None:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (id, email, username, schmeckles) VALUES (%s, %s, NULL, 1000) ON CONFLICT (id) DO NOTHING",
        [user_id, email],
    )


def check_username_taken(conn: Any, username: str, exclude_id: str) -> bool:
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM users WHERE username = %s AND id != %s", [username, exclude_id]
    )
    return cur.fetchone() is not None


def set_username(conn: Any, user_id: str, username: str) -> None:
    cur = conn.cursor()
    cur.execute("UPDATE users SET username = %s WHERE id = %s", [username, user_id])


def set_avatar_url(conn: Any, user_id: str, avatar_url: str) -> None:
    cur = conn.cursor()
    cur.execute("UPDATE users SET avatar_url = %s WHERE id = %s", [avatar_url, user_id])


def count_users(conn: Any) -> int:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM users")
    row = cur.fetchone()
    return (row or (0,))[0]


def get_ranked_users(conn: Any, limit: int, offset: int) -> list[tuple]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, username, schmeckles,
               ROW_NUMBER() OVER (ORDER BY schmeckles DESC) AS rank
        FROM users
        ORDER BY schmeckles DESC
        LIMIT %s OFFSET %s
        """,
        [limit, offset],
    )
    return cur.fetchall()


def get_contracts_for_users(conn: Any, user_ids: list[str]) -> list[tuple]:
    if not user_ids:
        return []
    placeholders = ", ".join(["%s"] * len(user_ids))
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT user_id, id, package_name, package_ecosystem, market_type,
               purchase_price, max_payout, opening_probability, status,
               expires_at::TEXT, created_at::TEXT
        FROM contracts
        WHERE user_id IN ({placeholders})
        ORDER BY created_at DESC
        """,
        user_ids,
    )
    return cur.fetchall()


def get_user_schmeckles(conn: Any, user_id: str) -> int | None:
    cur = conn.cursor()
    cur.execute("SELECT schmeckles FROM users WHERE id = %s", [user_id])
    row = cur.fetchone()
    return row[0] if row else None


def get_user_contract_history(conn: Any, user_id: str) -> list[tuple]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT created_at::TEXT, resolved_at::TEXT,
               purchase_price, max_payout, sell_price, status
        FROM contracts
        WHERE user_id = %s
        ORDER BY created_at ASC
        """,
        [user_id],
    )
    return cur.fetchall()


def get_user_basic(conn: Any, user_id: str) -> tuple | None:
    cur = conn.cursor()
    cur.execute(
        "SELECT id, username, schmeckles FROM users WHERE id = %s", [user_id]
    )
    return cur.fetchone()
