"""Pure unit tests for OSV record parsing (no network, no DB)."""
import pytest

from etl.fetch.cve import _cvss_score_from_vector, _parse_vuln

CVSS3_CRITICAL = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
CVSS4_VECTOR = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N"


@pytest.mark.parametrize(
    "vector, expected",
    [
        (CVSS3_CRITICAL, 9.8),
        (CVSS4_VECTOR, 9.3),
        (None, None),
        ("", None),
        ("not-a-vector", None),
    ],
)
def test_cvss_score_from_vector(vector, expected):
    assert _cvss_score_from_vector(vector) == expected


def test_parse_vuln_extracts_cve_severity_and_score():
    vuln = {
        "id": "GHSA-xxxx-yyyy-zzzz",
        "aliases": ["GHSA-xxxx-yyyy-zzzz", "CVE-2024-12345"],
        "database_specific": {"severity": "critical"},
        "severity": [{"type": "CVSS_V3", "score": CVSS3_CRITICAL}],
    }
    cve_id, severity, vector, score = _parse_vuln(vuln)
    assert cve_id == "CVE-2024-12345"
    assert severity == "critical"
    assert vector == CVSS3_CRITICAL
    assert score == 9.8


def test_parse_vuln_without_cve_alias_or_score():
    cve_id, severity, vector, score = _parse_vuln({"id": "MAL-2024-1"})
    assert (cve_id, severity, vector, score) == (None, None, None, None)


def test_parse_vuln_takes_first_supported_cvss_entry():
    vuln = {
        "severity": [
            {"type": "Ubuntu", "score": "high"},
            {"type": "CVSS_V4", "score": CVSS4_VECTOR},
            {"type": "CVSS_V3", "score": CVSS3_CRITICAL},
        ]
    }
    _, _, vector, score = _parse_vuln(vuln)
    assert vector == CVSS4_VECTOR
    assert score == 9.3
