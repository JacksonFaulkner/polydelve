import os
import sys

import psycopg2
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, ".")

from api.auth import get_browse_user, get_current_user
from features.db import get_db
from main import app

FAKE_USER = {"sub": "auth0|testuser123"}

_TEST_DB_URL = os.environ.get(
    "DATABASE_URL", "postgresql://polydelve:polydelve@localhost:5432/polydelve_dev"
)


@pytest.fixture
def db():
    conn = psycopg2.connect(_TEST_DB_URL)
    conn.autocommit = False
    yield conn
    conn.rollback()  # wipe every write; keeps tests isolated without a separate DB
    conn.close()


@pytest.fixture
def db_with_data(db):
    cur = db.cursor()
    # Always reset test data — DO UPDATE ensures balance/state is clean even if row exists from a prior test's commit
    cur.execute(
        """
        INSERT INTO users (id, username, schmeckles) VALUES (%s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET schmeckles = EXCLUDED.schmeckles, username = EXCLUDED.username
        """,
        ("auth0|testuser123", "tester", 1000),
    )
    cur.execute(
        """
        INSERT INTO packages (name, ecosystem, epss_score, has_mal_advisory, risk_score, weekly_downloads, cve_ids)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (name, ecosystem) DO UPDATE SET epss_score = EXCLUDED.epss_score, risk_score = EXCLUDED.risk_score
        """,
        ("requests", "PyPI", 0.05, False, 3.5, 500000, ["CVE-2023-001"]),
    )
    cur.execute(
        """
        INSERT INTO cve_history (osv_id, cve_id, name, ecosystem, cvss_score, published_date, severity)
        VALUES (%s, %s, %s, %s, %s, now() - INTERVAL '10 days', %s)
        ON CONFLICT (osv_id, name, ecosystem) DO NOTHING
        """,
        ("OSV-001", "CVE-2023-001", "requests", "PyPI", 7.5, "high"),
    )
    yield db


def _make_client(db_conn, authenticated: bool = True):
    def override_db():
        yield db_conn

    app.dependency_overrides[get_db] = override_db
    if authenticated:
        app.dependency_overrides[get_current_user] = lambda: FAKE_USER
        app.dependency_overrides[get_browse_user] = lambda: FAKE_USER
    else:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_browse_user, None)

    client = TestClient(app, raise_server_exceptions=False)
    return client


@pytest.fixture
def client(db_with_data):
    c = _make_client(db_with_data, authenticated=True)
    yield c
    app.dependency_overrides.clear()


@pytest.fixture
def unauth_client(db_with_data):
    c = _make_client(db_with_data, authenticated=False)
    yield c
    app.dependency_overrides.clear()
