import sys

sys.path.insert(0, ".")

import json

from features.manifest_parser import (
    parse_manifest,
    parse_package_json,
    parse_pyproject_toml,
    parse_requirements_txt,
)


def test_parse_package_json_deps_and_devdeps():
    content = json.dumps({
        "dependencies": {"react": "^18.0.0", "@scope/pkg": "1.2.3"},
        "devDependencies": {"jest": "^29.0.0"},
    })
    deps = parse_package_json(content)
    names = sorted(d.name for d in deps)
    assert names == ["@scope/pkg", "jest", "react"]
    assert all(d.ecosystem == "npm" for d in deps)


def test_parse_requirements_txt_strips_specifiers_and_comments():
    content = """
requests==2.31.0
flask>=2.0,<3.0  # web framework
# a comment line
-r other.txt
django ; python_version >= "3.8"
"""
    deps = parse_requirements_txt(content)
    names = sorted(d.name for d in deps)
    assert names == ["django", "flask", "requests"]
    assert all(d.ecosystem == "PyPI" for d in deps)


def test_parse_pyproject_main_deps_only():
    content = """
[project]
name = "myapp"
dependencies = [
    "requests>=2.31",
    "flask[async]>=2.0 ; python_version >= '3.8'",
]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[dependency-groups]
lint = ["ruff"]

[tool.poetry.dependencies]
poetry-only = "^1.0"
"""
    deps = parse_pyproject_toml(content)
    names = sorted(d.name for d in deps)
    assert names == ["flask", "requests"]
    assert all(d.ecosystem == "PyPI" for d in deps)


def test_parse_pyproject_invalid_toml_raises():
    import pytest
    with pytest.raises(ValueError):
        parse_pyproject_toml("[project\ndependencies = [")


def test_parse_manifest_dispatches_by_filename():
    assert parse_manifest("package.json", json.dumps({"dependencies": {"lodash": "1.0"}}))[0].name == "lodash"
    assert parse_manifest("requirements.txt", "numpy==1.0")[0].name == "numpy"
    assert parse_manifest("pyproject.toml", '[project]\ndependencies = ["numpy==1.0"]')[0].name == "numpy"


def test_parse_manifest_rejects_unknown_file():
    import pytest
    with pytest.raises(ValueError):
        parse_manifest("Cargo.toml", "")
