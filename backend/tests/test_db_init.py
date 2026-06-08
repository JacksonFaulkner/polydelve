"""DB initialization and data normalization."""
import sys
sys.path.insert(0, ".")

import duckdb
from features.db import init_db


def test_init_db_idempotent():
    conn = duckdb.connect(":memory:")
    init_db(conn)
    init_db(conn)  # second call must not raise
    conn.close()


def test_init_db_creates_all_tables():
    conn = duckdb.connect(":memory:")
    init_db(conn)
    tables = {r[0] for r in conn.execute("SHOW TABLES").fetchall()}
    expected = {
        "users", "packages", "contracts", "cve_history",
        "epss_history", "mal_advisories", "news", "news_packages",
    }
    assert expected <= tables
    conn.close()


def test_users_default_schmeckles():
    conn = duckdb.connect(":memory:")
    init_db(conn)
    conn.execute("INSERT INTO users (id, username) VALUES ('u1', 'alice')")
    bal = conn.execute("SELECT schmeckles FROM users WHERE id = 'u1'").fetchone()[0]
    assert bal == 1000
    conn.close()


def test_contracts_default_status_open():
    conn = duckdb.connect(":memory:")
    init_db(conn)
    conn.execute("""
        INSERT INTO users (id, username) VALUES ('u1', 'alice')
    """)
    conn.execute("""
        INSERT INTO contracts (
            id, user_id, package_name, package_ecosystem, market_type,
            purchase_price, max_payout, opening_probability, package_grade, expires_at
        ) VALUES ('c1', 'u1', 'pkg', 'PyPI', 'all', 100, 500, 0.5, 5.0, '2099-01-01')
    """)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'c1'").fetchone()[0]
    assert status == "open"
    conn.close()


# ── Data normalization (null-safety in API responses) ─────────────────────────

def test_package_null_epss_score_returns_none():
    conn = duckdb.connect(":memory:")
    init_db(conn)
    conn.execute("""
        INSERT INTO packages (name, ecosystem, epss_score, has_mal_advisory)
        VALUES ('pkg-no-epss', 'PyPI', NULL, false)
    """)
    row = conn.execute("SELECT epss_score FROM packages WHERE name = 'pkg-no-epss'").fetchone()
    assert row[0] is None
    conn.close()


def test_cve_score_rounded_to_one_decimal(client):
    r = client.get("/packages/PyPI/requests")
    body = r.json()
    assert body["max_cvss_score"] == 7.5
