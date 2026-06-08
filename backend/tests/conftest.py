import sys
from datetime import date, datetime, timedelta, timezone

import duckdb
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, ".")

from api.auth import get_current_user
from features.db import get_db, init_db
from main import app

FAKE_USER = {"sub": "auth0|testuser123"}


@pytest.fixture
def db():
    conn = duckdb.connect(":memory:")
    init_db(conn)
    yield conn
    conn.close()


@pytest.fixture
def db_with_data(db):
    db.execute("""
        INSERT INTO users (id, username, schmeckles)
        VALUES ('auth0|testuser123', 'tester', 1000)
    """)
    db.execute("""
        INSERT INTO packages (name, ecosystem, epss_score, has_mal_advisory, risk_score, weekly_downloads, cve_ids)
        VALUES ('requests', 'PyPI', 0.05, false, 3.5, 500000, ['CVE-2023-001'])
    """)
    db.execute("""
        INSERT INTO cve_history (osv_id, cve_id, name, ecosystem, cvss_score, published_date, severity)
        VALUES ('OSV-001', 'CVE-2023-001', 'requests', 'PyPI', 7.5, now() - INTERVAL '10' DAY, 'high')
    """)
    yield db


def _make_client(db_conn, authenticated: bool = True):
    def override_db():
        yield db_conn

    app.dependency_overrides[get_db] = override_db
    if authenticated:
        app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    else:
        app.dependency_overrides.pop(get_current_user, None)

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
