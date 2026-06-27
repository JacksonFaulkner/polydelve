"""
Resolve open contracts whose expiry has passed or whose win condition has been met.

Win conditions (any one triggers):
  CVE win   — a new CVE with cvss_score >= cvss_threshold was published after
               the contract was created (requires cvss_threshold set)
  EPSS win  — epss_history recorded a score >= epss_threshold after created_at
               (requires epss_threshold set)
  MAL win   — a non-withdrawn MAL advisory was published for the package after
               created_at

Resolution rules:
  - Won contracts    → status='won',     schmeckles += max_payout
  - Expired contracts → status='expired', no payout

Run daily: uv run python scripts/resolve_contracts.py
"""
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent.parent))
from features.db import get_db_conn  # noqa: E402


@dataclass
class OpenContract:
    id: str
    user_id: str
    package_name: str
    package_ecosystem: str
    cvss_threshold: float | None
    epss_threshold: float | None
    purchase_price: int
    max_payout: int
    expires_at: date
    created_at: datetime


def fetch_open_contracts(conn: Any) -> list[OpenContract]:
    cur = conn.cursor()
    cur.execute("""
        SELECT id, user_id, package_name, package_ecosystem,
               cvss_threshold, epss_threshold, purchase_price, max_payout,
               expires_at, created_at
        FROM contracts
        WHERE status = 'open'
    """)
    rows = cur.fetchall()
    return [
        OpenContract(
            id=r[0], user_id=r[1], package_name=r[2], package_ecosystem=r[3],
            cvss_threshold=r[4], epss_threshold=r[5],
            purchase_price=r[6], max_payout=r[7],
            expires_at=r[8] if isinstance(r[8], date) else date.fromisoformat(str(r[8])),
            created_at=r[9] if isinstance(r[9], datetime) else datetime.fromisoformat(str(r[9])),
        )
        for r in rows
    ]


def check_cve_win(conn: Any, c: OpenContract) -> bool:
    if c.cvss_threshold is None:
        return False
    cur = conn.cursor()
    cur.execute("""
        SELECT COUNT(*) FROM cve_history
        WHERE name = %s AND ecosystem = %s
          AND cvss_score >= %s
          AND published_date > %s
    """, [c.package_name, c.package_ecosystem, c.cvss_threshold, c.created_at])
    row = cur.fetchone()
    return bool(row and row[0] > 0)


def check_epss_win(conn: Any, c: OpenContract) -> bool:
    if c.epss_threshold is None:
        return False
    cur = conn.cursor()
    cur.execute("""
        SELECT COUNT(*) FROM epss_history
        WHERE name = %s AND ecosystem = %s
          AND epss_score >= %s
          AND recorded_at > %s
    """, [c.package_name, c.package_ecosystem, c.epss_threshold, c.created_at.date()])
    row = cur.fetchone()
    return bool(row and row[0] > 0)


def check_mal_win(conn: Any, c: OpenContract) -> bool:
    cur = conn.cursor()
    cur.execute("""
        SELECT COUNT(*) FROM mal_advisories
        WHERE name = %s AND ecosystem = %s
          AND withdrawn = false
          AND published_at > %s
    """, [c.package_name, c.package_ecosystem, c.created_at])
    row = cur.fetchone()
    return bool(row and row[0] > 0)


def resolve_won(conn: Any, c: OpenContract, reason: str) -> None:
    now = datetime.now(timezone.utc)
    cur = conn.cursor()
    cur.execute("""
        UPDATE contracts
        SET status = 'won', resolved_at = %s
        WHERE id = %s
    """, [now, c.id])
    cur.execute("""
        UPDATE users SET schmeckles = schmeckles + %s WHERE id = %s
    """, [c.max_payout, c.user_id])
    print(f"  WON  {c.id[:8]}  {c.package_name}/{c.package_ecosystem}  +{c.max_payout} sch  ({reason})")


def resolve_expired(conn: Any, c: OpenContract) -> None:
    now = datetime.now(timezone.utc)
    cur = conn.cursor()
    cur.execute("""
        UPDATE contracts
        SET status = 'expired', resolved_at = %s
        WHERE id = %s
    """, [now, c.id])
    print(f"  EXP  {c.id[:8]}  {c.package_name}/{c.package_ecosystem}  (expired {c.expires_at})")


def run(conn: Any, dry_run: bool = False) -> None:
    today = date.today()
    contracts = fetch_open_contracts(conn)
    print(f"Resolving contracts — {len(contracts)} open, date={today}")

    won = 0
    expired = 0

    for c in contracts:
        # Check win conditions regardless of expiry — wins can trigger before expiry
        win_reason: str | None = None
        if check_cve_win(conn, c):
            win_reason = f"CVE >= {c.cvss_threshold}"
        elif check_epss_win(conn, c):
            win_reason = f"EPSS >= {c.epss_threshold}"
        elif check_mal_win(conn, c):
            win_reason = "MAL advisory"

        if win_reason:
            if not dry_run:
                resolve_won(conn, c, win_reason)
            else:
                print(f"  [dry] WON  {c.id[:8]}  {c.package_name}  ({win_reason})")
            won += 1
        elif c.expires_at <= today:
            if not dry_run:
                resolve_expired(conn, c)
            else:
                print(f"  [dry] EXP  {c.id[:8]}  {c.package_name}")
            expired += 1

    if dry_run:
        conn.rollback()
    else:
        conn.commit()

    print(f"Done — {won} won, {expired} expired, {len(contracts) - won - expired} still open")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Resolve open contracts")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing")
    args = parser.parse_args()

    conn = get_db_conn()
    try:
        run(conn, dry_run=args.dry_run)
    finally:
        conn.close()
