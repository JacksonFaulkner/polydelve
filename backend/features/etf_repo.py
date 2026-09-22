import uuid
from typing import Any

from features.contract_pricing import price_contract, price_contract_with_legs
from features.etf_pricing import EtfMemberTerms, EtfTerms, price_basket


class MemberInput:
    def __init__(self, package_name: str, ecosystem: str, cvss_threshold: float | None, epss_threshold: float | None):
        self.package_name = package_name
        self.ecosystem = ecosystem
        self.cvss_threshold = cvss_threshold
        self.epss_threshold = epss_threshold


def get_package_epss(conn: Any, name: str, ecosystem: str) -> float | None:
    cur = conn.cursor()
    cur.execute("SELECT epss_score FROM packages WHERE name = %s AND ecosystem = %s", [name, ecosystem])
    row = cur.fetchone()
    return row[0] if row else None


def build_member_terms(conn: Any, members: list[MemberInput], duration_days: int) -> list[EtfMemberTerms]:
    result: list[EtfMemberTerms] = []
    for m in members:
        # An EPSS target at or below the current score is "already reached" and
        # would price as a near-certain win — treat it as no EPSS leg.
        current_epss = get_package_epss(conn, m.package_name, m.ecosystem) or 0.0
        epss_threshold = m.epss_threshold if (m.epss_threshold or 0) > current_epss else None
        terms = price_contract(
            conn=conn,
            package_name=m.package_name,
            ecosystem=m.ecosystem,
            cvss_threshold=m.cvss_threshold,
            epss_threshold=epss_threshold,
            purchase_price=100,  # payout not used per-member; only probability/grade
            duration_days=duration_days,
        )
        result.append(EtfMemberTerms(
            package_name=m.package_name,
            ecosystem=m.ecosystem,
            opening_probability=terms.opening_probability,
            grade=terms.package_grade,
            epss_threshold=epss_threshold,
            cvss_threshold=m.cvss_threshold,
            opening_epss=current_epss,
        ))
    return result


def member_remaining_probs(
    conn: Any,
    member_rows: list[tuple],
    total_days: int,
    remaining_days: int,
) -> list[float]:
    """Per-member P(leg fires in the remaining window), using live package
    stats. Rows are list_etf_members() tuples; a member already marked won
    contributes 1.0."""
    probs: list[float] = []
    for (name, eco, cvss_t, epss_t, _open_prob, _open_epss, won, _won_at) in member_rows:
        if won:
            probs.append(1.0)
            continue
        try:
            _, legs = price_contract_with_legs(conn, name, eco, cvss_t, epss_t, 100, total_days)
        except ValueError:
            probs.append(0.0)  # package no longer tracked
            continue
        # contract_value with unit payouts == P(any leg fires in remaining window)
        miss = 1.0
        for leg in legs:
            miss *= 1.0 - leg.prob_at(remaining_days)
        probs.append(1.0 - miss)
    return probs


def price_etf(member_terms: list[EtfMemberTerms], threshold_count: int, purchase_price: int, duration_days: int) -> EtfTerms:
    return price_basket(member_terms, threshold_count, purchase_price, duration_days)


def get_user_bits(conn: Any, user_id: str) -> int | None:
    cur = conn.cursor()
    cur.execute("SELECT bits FROM users WHERE id = %s", [user_id])
    row = cur.fetchone()
    return row[0] if row else None


def buy_etf_contract(
    conn: Any,
    user_id: str,
    threshold_count: int,
    member_terms: list[EtfMemberTerms],
    purchase_price: int,
    max_payout: int,
    combined_probability: float,
    avg_grade: float,
    expires_at,
) -> str:
    contract_id = str(uuid.uuid4())
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO etf_contracts (
            id, user_id, threshold_count, member_count, purchase_price, max_payout,
            opening_probability, avg_grade, expires_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        [contract_id, user_id, threshold_count, len(member_terms), purchase_price,
         max_payout, combined_probability, avg_grade, expires_at],
    )
    for m in member_terms:
        cur.execute(
            """
            INSERT INTO etf_contract_members (
                id, etf_contract_id, package_name, package_ecosystem,
                cvss_threshold, epss_threshold, opening_probability, opening_epss
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [str(uuid.uuid4()), contract_id, m.package_name, m.ecosystem,
             m.cvss_threshold, m.epss_threshold, m.opening_probability, m.opening_epss],
        )
    cur.execute(
        "UPDATE users SET bits = bits - %s WHERE id = %s AND bits >= %s",
        [purchase_price, user_id, purchase_price],
    )
    if cur.rowcount == 0:
        conn.rollback()
        raise ValueError("insufficient_bits")
    conn.commit()
    return contract_id


def list_etf_contracts(conn: Any, user_id: str) -> list[tuple]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, threshold_count, member_count, purchase_price, max_payout,
               opening_probability, avg_grade, expires_at, status, resolved_at,
               sell_price, created_at
        FROM etf_contracts WHERE user_id = %s ORDER BY created_at DESC
        """,
        [user_id],
    )
    return cur.fetchall()


def list_etf_members(conn: Any, etf_contract_id: str) -> list[tuple]:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT package_name, package_ecosystem, cvss_threshold, epss_threshold,
               opening_probability, opening_epss, won, won_at
        FROM etf_contract_members WHERE etf_contract_id = %s
        """,
        [etf_contract_id],
    )
    return cur.fetchall()
