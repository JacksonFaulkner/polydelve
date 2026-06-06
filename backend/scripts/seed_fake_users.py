"""
Seed 100 fake users with random contracts.

All seeded rows use id prefix 'seed_' for easy removal:
  DELETE FROM contracts WHERE user_id LIKE 'seed_%';
  DELETE FROM users WHERE id LIKE 'seed_%';

Or run with --remove flag.
"""

import random
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from features.db import get_db_conn

MARKET_TYPES = ["new_cve", "kev_listing", "epss_threshold"]
STATUSES = ["open", "won", "lost", "sold"]
STATUS_WEIGHTS = [0.6, 0.15, 0.2, 0.05]

FAKE_USERNAMES = [
    "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
    "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
    "quebec", "romeo", "sierra", "tango",
]


def _seed_id() -> str:
    return f"seed_{uuid.uuid4().hex[:12]}"


def remove_seeds(conn) -> None:
    c = conn.execute("DELETE FROM contracts WHERE user_id LIKE 'seed_%'").rowcount
    u = conn.execute("DELETE FROM users WHERE id LIKE 'seed_%'").rowcount
    print(f"Removed {u} users, {c} contracts.")


def seed(conn) -> None:
    packages = conn.execute(
        "SELECT name, ecosystem FROM packages LIMIT 200"
    ).fetchall()
    if not packages:
        print("No packages in DB — run seed_top_packages.py first.")
        sys.exit(1)

    users_inserted = 0
    contracts_inserted = 0

    for i in range(100):
        uid = _seed_id()
        adj = random.choice(FAKE_USERNAMES)
        noun = random.choice(FAKE_USERNAMES)
        username = f"{adj}_{noun}_{i}"
        schmeckles = random.randint(200, 5000)

        conn.execute(
            "INSERT INTO users (id, email, username, schmeckles) VALUES (?, ?, ?, ?)",
            [uid, f"{username}@seed.test", username, schmeckles],
        )
        users_inserted += 1

        n_contracts = random.randint(1, 8)
        for _ in range(n_contracts):
            pkg_name, pkg_eco = random.choice(packages)
            mtype = random.choice(MARKET_TYPES)
            purchase_price = random.randint(50, 800)
            max_payout = purchase_price * random.randint(2, 10)
            opening_prob = round(random.uniform(0.02, 0.85), 4)
            pkg_grade = round(random.uniform(0.1, 0.95), 4)
            days_offset = random.randint(-30, 90)
            expires_at = date.today() + timedelta(days=days_offset)
            status = random.choices(STATUSES, STATUS_WEIGHTS)[0]

            cvss_threshold = round(random.uniform(5.0, 9.9), 1) if mtype == "new_cve" else None
            epss_threshold = round(random.uniform(0.1, 0.9), 2) if mtype == "epss_threshold" else None

            conn.execute(
                """
                INSERT INTO contracts (
                    id, user_id, package_name, package_ecosystem, market_type,
                    cvss_threshold, epss_threshold, purchase_price, max_payout,
                    opening_probability, package_grade, expires_at, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    _seed_id(), uid, pkg_name, pkg_eco, mtype,
                    cvss_threshold, epss_threshold, purchase_price, max_payout,
                    opening_prob, pkg_grade, expires_at, status,
                ],
            )
            contracts_inserted += 1

    print(f"Seeded {users_inserted} users, {contracts_inserted} contracts.")
    print("Remove with: python seed_fake_users.py --remove")


if __name__ == "__main__":
    conn = get_db_conn()
    if "--remove" in sys.argv:
        remove_seeds(conn)
    else:
        seed(conn)
    conn.close()
