"""Extract dependency names from an uploaded package.json / requirements.txt / pyproject.toml."""
import json
import re
import tomllib
from dataclasses import dataclass


@dataclass
class ParsedDependency:
    name: str
    ecosystem: str  # "npm" | "PyPI" — matches packages.ecosystem values


_PIP_NAME_RE = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")


def parse_package_json(content: str) -> list[ParsedDependency]:
    data = json.loads(content)
    names: set[str] = set()
    for key in ("dependencies", "devDependencies"):
        names.update((data.get(key) or {}).keys())
    return [ParsedDependency(name=n, ecosystem="npm") for n in sorted(names)]


def parse_requirements_txt(content: str) -> list[ParsedDependency]:
    names: set[str] = set()
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("-"):
            continue
        line = line.split(";")[0].split("#")[0].strip()  # drop env markers / inline comments
        match = _PIP_NAME_RE.match(line)
        if match:
            names.add(match.group(1))
    return [ParsedDependency(name=n, ecosystem="PyPI") for n in sorted(names)]


def parse_pyproject_toml(content: str) -> list[ParsedDependency]:
    """Only [project].dependencies — optional-dependencies, dependency-groups,
    and tool-specific tables (poetry etc.) are intentionally ignored."""
    try:
        data = tomllib.loads(content)
    except tomllib.TOMLDecodeError as e:
        raise ValueError(f"Invalid TOML: {e}") from e
    deps = (data.get("project") or {}).get("dependencies") or []
    names: set[str] = set()
    for spec in deps:
        if not isinstance(spec, str):
            continue
        match = _PIP_NAME_RE.match(spec)
        if match:
            names.add(match.group(1))
    return [ParsedDependency(name=n, ecosystem="PyPI") for n in sorted(names)]


def parse_manifest(filename: str, content: str) -> list[ParsedDependency]:
    lower = filename.lower()
    if lower.endswith("package.json"):
        return parse_package_json(content)
    if lower.endswith("pyproject.toml"):
        return parse_pyproject_toml(content)
    if lower.endswith(("requirements.txt", "pipfile")) or "requirements" in lower:
        return parse_requirements_txt(content)
    raise ValueError(f"Unsupported manifest file: {filename}")
