import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from features.settlement import run

USER_ID = "auth0|resolver-test"


class _NoCommitConn:
    """Wraps the test connection so run()'s commit/rollback stay inside the
    test transaction; the db fixture's final rollback then wipes everything."""

    def __init__(self, conn):
        self._conn = conn
        self._conn.cursor().execute("SAVEPOINT resolve_test")

    def cursor(self):
        return self._conn.cursor()

    def commit(self):
        pass

    def rollback(self):
        self._conn.cursor().execute("ROLLBACK TO SAVEPOINT resolve_test")


@pytest.fixture
def conn(db):
    cur = db.cursor()
    cur.execute(
        """
        INSERT INTO users (id, username, bits) VALUES (%s, 'resolver', 1000)
        ON CONFLICT (id) DO UPDATE SET bits = 1000
        """,
        (USER_ID,),
    )
    cur.execute(
        """
        INSERT INTO packages (name, ecosystem, epss_score, has_mal_advisory)
        VALUES ('requests', 'PyPI', 0.05, false)
        ON CONFLICT (name, ecosystem) DO NOTHING
        """
    )
    yield db


def _resolve(conn, dry_run=False):
    run(_NoCommitConn(conn), dry_run=dry_run)


def _fetch(conn, sql, params=()):
    cur = conn.cursor()
    cur.execute(sql, params)
    return cur.fetchone()[0]


def _status(conn, contract_id):
    return _fetch(conn, "SELECT status FROM contracts WHERE id = %s", (contract_id,))


def _bits(conn):
    return _fetch(conn, "SELECT bits FROM users WHERE id = %s", (USER_ID,))


def _insert_contract(conn, **kwargs):
    contract_id = str(uuid.uuid4())
    row = {
        "id": contract_id,
        "user_id": USER_ID,
        "package_name": "requests",
        "package_ecosystem": "PyPI",
        "market_type": "all",
        "cvss_threshold": None,
        "epss_threshold": None,
        "purchase_price": 100,
        "max_payout": 500,
        "opening_probability": 0.5,
        "package_grade": 5.0,
        "expires_at": date.today() + timedelta(days=7),
        "created_at": datetime.now(UTC) - timedelta(days=1),
        "direction": "yes",
    }
    row.update(kwargs)
    cols = ", ".join(row)
    placeholders = ", ".join(["%s"] * len(row))
    conn.cursor().execute(
        f"INSERT INTO contracts ({cols}) VALUES ({placeholders})", list(row.values())
    )
    return contract_id


def _insert_cve(conn, cvss_score, published_date="now()"):
    conn.cursor().execute(
        f"""
        INSERT INTO cve_history (osv_id, name, ecosystem, cvss_score, published_date)
        VALUES (%s, 'requests', 'PyPI', %s, {published_date})
        """,
        (f"OSV-{uuid.uuid4()}", cvss_score),
    )


# ── Expiry ────────────────────────────────────────────────────────────────────

def test_expired_contract_marked_expired(conn):
    cid = _insert_contract(conn, expires_at=date.today() - timedelta(days=1))
    _resolve(conn)
    assert _status(conn, cid) == "expired"


def test_expired_contract_no_payout(conn):
    _insert_contract(conn, expires_at=date.today() - timedelta(days=1))
    _resolve(conn)
    assert _bits(conn) == 1000


def test_open_contract_not_touched(conn):
    cid = _insert_contract(conn)
    _resolve(conn)
    assert _status(conn, cid) == "open"


# ── CVE win ───────────────────────────────────────────────────────────────────

def test_cve_win_credits_max_payout(conn):
    cid = _insert_contract(conn, cvss_threshold=7.0, max_payout=500)
    _insert_cve(conn, 9.0)
    _resolve(conn)
    assert _status(conn, cid) == "won"
    assert _bits(conn) == 1500


def test_cve_below_threshold_no_win(conn):
    cid = _insert_contract(conn, cvss_threshold=9.0)
    _insert_cve(conn, 5.0)
    _resolve(conn)
    assert _status(conn, cid) == "open"


def test_cve_published_before_purchase_no_win(conn):
    cid = _insert_contract(conn, cvss_threshold=7.0)
    _insert_cve(conn, 9.0, published_date="now() - INTERVAL '3 days'")
    _resolve(conn)
    assert _status(conn, cid) == "open"


# ── EPSS win ──────────────────────────────────────────────────────────────────

def test_epss_win(conn):
    cid = _insert_contract(conn, epss_threshold=0.1)
    conn.cursor().execute(
        "INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)"
        " VALUES ('requests', 'PyPI', 0.5, current_date)"
    )
    _resolve(conn)
    assert _status(conn, cid) == "won"


def test_epss_below_threshold_no_win(conn):
    cid = _insert_contract(conn, epss_threshold=0.9)
    conn.cursor().execute(
        "INSERT INTO epss_history (name, ecosystem, epss_score, recorded_at)"
        " VALUES ('requests', 'PyPI', 0.1, current_date)"
    )
    _resolve(conn)
    assert _status(conn, cid) == "open"


# ── MAL win ───────────────────────────────────────────────────────────────────

def _insert_mal(conn, withdrawn):
    conn.cursor().execute(
        "INSERT INTO mal_advisories (osv_id, name, ecosystem, published_at, withdrawn)"
        " VALUES (%s, 'requests', 'PyPI', now(), %s)",
        (f"MAL-{uuid.uuid4()}", withdrawn),
    )


def test_mal_win(conn):
    cid = _insert_contract(conn)
    _insert_mal(conn, withdrawn=False)
    _resolve(conn)
    assert _status(conn, cid) == "won"


def test_withdrawn_mal_no_win(conn):
    cid = _insert_contract(conn)
    _insert_mal(conn, withdrawn=True)
    _resolve(conn)
    assert _status(conn, cid) == "open"


# ── NO direction ──────────────────────────────────────────────────────────────

def test_no_contract_lost_on_cve(conn):
    cid = _insert_contract(conn, direction="no", cvss_threshold=7.0)
    _insert_cve(conn, 9.0)
    _resolve(conn)
    assert _status(conn, cid) == "lost"
    assert _bits(conn) == 1000


def test_no_contract_wins_at_expiry(conn):
    cid = _insert_contract(
        conn, direction="no", cvss_threshold=7.0, max_payout=300,
        expires_at=date.today() - timedelta(days=1),
    )
    _resolve(conn)
    assert _status(conn, cid) == "won"
    assert _bits(conn) == 1300


# ── ETF baskets ───────────────────────────────────────────────────────────────

def _insert_etf(conn, threshold_count, members, **kwargs):
    etf_id = str(uuid.uuid4())
    row = {
        "id": etf_id, "user_id": USER_ID, "threshold_count": threshold_count,
        "member_count": len(members), "purchase_price": 100, "max_payout": 800,
        "opening_probability": 0.3, "avg_grade": 5.0,
        "expires_at": date.today() + timedelta(days=7),
        "created_at": datetime.now(UTC) - timedelta(days=1),
    }
    row.update(kwargs)
    cur = conn.cursor()
    cur.execute(
        f"INSERT INTO etf_contracts ({', '.join(row)}) VALUES ({', '.join(['%s'] * len(row))})",
        list(row.values()),
    )
    for name, cvss_threshold in members:
        cur.execute(
            """
            INSERT INTO etf_contract_members
                (id, etf_contract_id, package_name, package_ecosystem, cvss_threshold, opening_probability)
            VALUES (%s, %s, %s, 'PyPI', %s, 0.3)
            """,
            (str(uuid.uuid4()), etf_id, name, cvss_threshold),
        )
    return etf_id


def _etf_status(conn, etf_id):
    return _fetch(conn, "SELECT status FROM etf_contracts WHERE id = %s", (etf_id,))


def test_etf_won_when_threshold_met(conn):
    etf_id = _insert_etf(conn, 1, [("requests", 7.0), ("flask", 7.0)])
    _insert_cve(conn, 9.0)
    _resolve(conn)
    assert _etf_status(conn, etf_id) == "won"
    assert _bits(conn) == 1800


def test_etf_expires_below_threshold(conn):
    etf_id = _insert_etf(
        conn, 2, [("requests", 7.0), ("flask", 7.0)],
        expires_at=date.today() - timedelta(days=1),
    )
    _insert_cve(conn, 9.0)
    _resolve(conn)
    assert _etf_status(conn, etf_id) == "expired"
    assert _bits(conn) == 1000


# ── Dry run ───────────────────────────────────────────────────────────────────

def test_dry_run_makes_no_changes(conn):
    cid = _insert_contract(conn, expires_at=date.today() - timedelta(days=1))
    _resolve(conn, dry_run=True)
    assert _status(conn, cid) == "open"
