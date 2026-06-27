"""Package search, detail, CVE lookup, auth enforcement."""
import sys
sys.path.insert(0, ".")


# ── Auth enforcement ──────────────────────────────────────────────────────────

def test_packages_public_to_anonymous(unauth_client):
    # Browse endpoints are public — logged-out visitors get 200, not 401.
    r = unauth_client.get("/packages?ecosystem=PyPI")
    assert r.status_code == 200


def test_package_detail_public_to_anonymous(unauth_client):
    r = unauth_client.get("/packages/PyPI/requests")
    assert r.status_code in (200, 404)


# ── Package search ────────────────────────────────────────────────────────────

def test_list_packages_returns_200(client):
    r = client.get("/packages?ecosystem=PyPI&page_size=10")
    assert r.status_code == 200


def test_list_packages_response_shape(client):
    r = client.get("/packages?ecosystem=PyPI&page_size=10")
    body = r.json()
    assert "total" in body
    assert "packages" in body
    assert "page" in body


def test_list_packages_ecosystem_filter(client):
    r = client.get("/packages?ecosystem=PyPI&page_size=50")
    body = r.json()
    ecosystems = {p["ecosystem"] for p in body["packages"]}
    assert ecosystems <= {"PyPI"}


def test_list_packages_pagination(client):
    r1 = client.get("/packages?ecosystem=PyPI&page=1&page_size=1")
    assert r1.status_code == 200
    assert len(r1.json()["packages"]) <= 1


def test_list_packages_invalid_sort_rejected(client):
    r = client.get("/packages?sort=banana")
    assert r.status_code == 422


def test_list_packages_page_size_over_limit(client):
    r = client.get("/packages?page_size=9999")
    assert r.status_code == 422


# ── Package detail ────────────────────────────────────────────────────────────

def test_get_package_returns_200(client):
    r = client.get("/packages/PyPI/requests")
    assert r.status_code == 200


def test_get_package_response_shape(client):
    r = client.get("/packages/PyPI/requests")
    body = r.json()
    for field in ("name", "ecosystem", "epss_score", "risk_score", "cve_history", "epss_history"):
        assert field in body


def test_get_package_not_found(client):
    r = client.get("/packages/PyPI/does-not-exist-xyz")
    assert r.status_code == 404


def test_get_package_wrong_ecosystem(client):
    r = client.get("/packages/npm/requests")
    assert r.status_code == 404


# ── CVE data ──────────────────────────────────────────────────────────────────

def test_package_detail_includes_cve_history(client):
    r = client.get("/packages/PyPI/requests")
    cves = r.json()["cve_history"]
    assert len(cves) >= 1
    assert cves[0]["osv_id"] == "OSV-001"
    assert cves[0]["cvss_score"] == 7.5


def test_package_detail_max_cvss_computed(client):
    r = client.get("/packages/PyPI/requests")
    assert r.json()["max_cvss_score"] == 7.5


def test_package_with_no_cves_returns_empty_list(client, db_with_data):
    db_with_data.cursor().execute(
        "INSERT INTO packages (name, ecosystem, epss_score, has_mal_advisory, cve_ids) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (name, ecosystem) DO NOTHING",
        ("clean-pkg", "PyPI", 0.0, False, []),
    )
    r = client.get("/packages/PyPI/clean-pkg")
    assert r.json()["cve_history"] == []
