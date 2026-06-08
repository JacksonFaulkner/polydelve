import sys
from datetime import date, datetime, timedelta, timezone

import duckdb
import pytest

sys.path.insert(0, ".")

from features.db import init_db
from scripts.resolve_contracts import run


@pytest.fixture
def conn():
    c = duckdb.connect(":memory:")
    init_db(c)
    c.execute("INSERT INTO users (id, username, schmeckles) VALUES ('user1', 'tester', 1000)")
    c.execute("""
        INSERT INTO packages (name, ecosystem, epss_score, has_mal_advisory)
        VALUES ('requests', 'PyPI', 0.05, false)
    """)
    yield c
    c.close()


def _insert_contract(conn, contract_id, **kwargs):
    defaults = dict(
        user_id="user1",
        package_name="requests",
        package_ecosystem="PyPI",
        market_type="all",
        cvss_threshold=None,
        epss_threshold=None,
        purchase_price=100,
        max_payout=500,
        opening_probability=0.5,
        package_grade=5.0,
        expires_at=date.today() + timedelta(days=7),
        created_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    defaults.update(kwargs)
    conn.execute("""
        INSERT INTO contracts (
            id, user_id, package_name, package_ecosystem, market_type,
            cvss_threshold, epss_threshold, purchase_price, max_payout,
            opening_probability, package_grade, expires_at, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
    """, [
        contract_id,
        defaults["user_id"], defaults["package_name"], defaults["package_ecosystem"],
        defaults["market_type"], defaults["cvss_threshold"], defaults["epss_threshold"],
        defaults["purchase_price"], defaults["max_payout"],
        defaults["opening_probability"], defaults["package_grade"],
        defaults["expires_at"], defaults["created_at"],
    ])


# ── Expiry ────────────────────────────────────────────────────────────────────

def test_expired_contract_marked_expired(conn):
    _insert_contract(conn, "exp1", expires_at=date.today() - timedelta(days=1))
    run(conn)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'exp1'").fetchone()[0]
    assert status == "expired"


def test_expired_contract_no_schmeckle_payout(conn):
    _insert_contract(conn, "exp2", expires_at=date.today() - timedelta(days=1))
    run(conn)
    bal = conn.execute("SELECT schmeckles FROM users WHERE id = 'user1'").fetchone()[0]
    assert bal == 1000  # unchanged


def test_open_contract_not_touched(conn):
    _insert_contract(conn, "open1", expires_at=date.today() + timedelta(days=7))
    run(conn)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'open1'").fetchone()[0]
    assert status == "open"


# ── CVE win ───────────────────────────────────────────────────────────────────

def test_cve_win_credits_max_payout(conn):
    _insert_contract(conn, "cve1", cvss_threshold=7.0, max_payout=500)
    conn.execute("""
        INSERT INTO cve_history (osv_id, name, ecosystem, cvss_score, published_date)
        VALUES ('OSV-1', 'requests', 'PyPI', 9.0, now())
    """)
    run(conn)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'cve1'").fetchone()[0]
    bal = conn.execute("SELECT schmeckles FROM users WHERE id = 'user1'").fetchone()[0]
    assert status == "won"
    assert bal == 1500  # 1000 + 500 max_payout


def test_cve_below_threshold_no_win(conn):
    _insert_contract(conn, "cve2", cvss_threshold=9.0,
                     expires_at=date.today() + timedelta(days=7))
    conn.execute("""
        INSERT INTO cve_history (osv_id, name, ecosystem, cvss_score, published_date)
        VALUES ('OSV-2', 'requests', 'PyPI', 5.0, now())
    """)
    run(conn)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'cve2'").fetchone()[0]
    assert status == "open"


# ── EPSS win ──────────────────────────────────────────────────────────────────

def test_epss_win(conn):
    _insert_contract(conn, "epss1", epss_threshold=0.1, max_payout=500)
    conn.execute("""
        INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)
        VALUES ('requests', 'PyPI', 0.5, current_date)
    """)
    run(conn)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'epss1'").fetchone()[0]
    assert status == "won"


def test_epss_below_threshold_no_win(conn):
    _insert_contract(conn, "epss2", epss_threshold=0.9,
                     expires_at=date.today() + timedelta(days=7))
    conn.execute("""
        INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)
        VALUES ('requests', 'PyPI', 0.1, current_date)
    """)
    run(conn)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'epss2'").fetchone()[0]
    assert status == "open"


# ── MAL win ───────────────────────────────────────────────────────────────────

def test_mal_win(conn):
    _insert_contract(conn, "mal1", max_payout=500)
    conn.execute("""
        INSERT INTO mal_advisories (osv_id, name, ecosystem, published_at, withdrawn)
        VALUES ('MAL-1', 'requests', 'PyPI', now(), false)
    """)
    run(conn)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'mal1'").fetchone()[0]
    assert status == "won"


def test_withdrawn_mal_no_win(conn):
    _insert_contract(conn, "mal2", expires_at=date.today() + timedelta(days=7))
    conn.execute("""
        INSERT INTO mal_advisories (osv_id, name, ecosystem, published_at, withdrawn)
        VALUES ('MAL-2', 'requests', 'PyPI', now(), true)
    """)
    run(conn)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'mal2'").fetchone()[0]
    assert status == "open"


# ── Dry run ───────────────────────────────────────────────────────────────────

def test_dry_run_makes_no_changes(conn):
    _insert_contract(conn, "dry1", expires_at=date.today() - timedelta(days=1))
    run(conn, dry_run=True)
    status = conn.execute("SELECT status FROM contracts WHERE id = 'dry1'").fetchone()[0]
    assert status == "open"