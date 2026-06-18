from typing import Any


def get_package_epss(conn: Any, name: str, ecosystem: str) -> float | None:
    cur = conn.cursor()
    cur.execute(
        "SELECT epss_score FROM packages WHERE name = %s AND ecosystem = %s",
        [name, ecosystem],
    )
    row = cur.fetchone()
    return row[0] if row else None


def get_user_schmeckles(conn: Any, user_id: str) -> int | None:
    cur = conn.cursor()
    cur.execute("SELECT schmeckles FROM users WHERE id = %s", [user_id])
    row = cur.fetchone()
    return row[0] if row else None


def buy_contract(
    conn: Any,
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
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO contracts (
            id, user_id, package_name, package_ecosystem, market_type,
            cvss_threshold, epss_threshold, purchase_price, max_payout,
            opening_probability, package_grade, expires_at, opening_epss
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [contract_id, user_id, name, ecosystem, market_type,
         cvss_t, epss_t, price, max_payout, open_prob, grade, expires_at, opening_epss],
    )
    cur.execute(
        "UPDATE users SET schmeckles = schmeckles - %s WHERE id = %s AND schmeckles >= %s",
        [price, user_id, price],
    )
    if cur.rowcount == 0:
        conn.rollback()
        raise ValueError("insufficient_schmeckles")
    conn.commit()


def list_contracts(conn: Any, user_id: str) -> list[tuple]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT c.id, c.package_name, c.package_ecosystem, c.market_type,
               c.cvss_threshold, c.epss_threshold, c.purchase_price, c.max_payout,
               c.opening_probability, c.package_grade, c.expires_at,
               c.status, c.resolved_at, c.sell_price, c.created_at,
               c.opening_epss, p.epss_score AS current_epss
        FROM contracts c
        LEFT JOIN packages p ON p.name = c.package_name AND p.ecosystem = c.package_ecosystem
        WHERE c.user_id = %s
        ORDER BY c.created_at DESC
        """,
        [user_id],
    )
    return cur.fetchall()


def get_contract_for_sell(conn: Any, contract_id: str, user_id: str) -> tuple | None:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT c.user_id, c.purchase_price,
               c.expires_at, c.status, c.created_at,
               c.opening_epss, p.epss_score AS current_epss
        FROM contracts c
        LEFT JOIN packages p ON p.name = c.package_name AND p.ecosystem = c.package_ecosystem
        WHERE c.id = %s AND c.user_id = %s
        """,
        [contract_id, user_id],
    )
    return cur.fetchone()


def sell_contract(conn: Any, contract_id: str, user_id: str, sell_val: int) -> None:
    cur = conn.cursor()
    cur.execute(
        "UPDATE contracts SET status = 'sold', sell_price = %s, resolved_at = now() WHERE id = %s",
        [sell_val, contract_id],
    )
    cur.execute(
        "UPDATE users SET schmeckles = schmeckles + %s WHERE id = %s",
        [sell_val, user_id],
    )
    conn.commit()
