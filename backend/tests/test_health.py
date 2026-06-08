import sys
import duckdb
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, ".")

from main import app
from features.db import get_db, init_db


@pytest.fixture
def client():
    conn = duckdb.connect(":memory:")
    init_db(conn)

    def override_get_db():
        yield conn

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    conn.close()


def test_health_returns_200(client):
    r = client.get("/health")
    assert r.status_code == 200


def test_health_response_shape(client):
    r = client.get("/health")
    assert r.json() == {"status": "ok"}
