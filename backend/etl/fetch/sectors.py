"""Fetch and infer package sectors from registry metadata and LLM."""
import re
from typing import Literal

import httpx

PackageSector = Literal[
    "AI / ML",
    "Authentication",
    "Build Tools",
    "CLI / Utilities",
    "Cryptography",
    "Data Science",
    "Database / ORM",
    "Frontend / UI",
    "HTTP Client",
    "Infrastructure",
    "Package Manager",
    "Serialization",
    "Testing",
    "Web Framework",
]

_PYPI_RULES: list[tuple[str, str]] = [
    ("Security :: Cryptography", "Cryptography"),
    ("Scientific/Engineering :: Artificial Intelligence", "AI / ML"),
    ("Scientific/Engineering :: Machine Learning", "AI / ML"),
    ("Internet :: WWW/HTTP :: WSGI", "Web Framework"),
    ("Internet :: WWW/HTTP :: Dynamic Content", "Web Framework"),
    ("Libraries :: Application Frameworks", "Web Framework"),
    ("Internet :: WWW/HTTP", "HTTP Client"),
    ("System :: Networking", "HTTP Client"),
    ("Database", "Database / ORM"),
    ("Software Development :: Testing", "Testing"),
    ("Software Development :: Quality Assurance", "Build Tools"),
    ("Software Development :: Build Tools", "Build Tools"),
    ("System :: Distributed Computing", "Infrastructure"),
    ("System :: System Shells", "CLI / Utilities"),
    ("Text Processing", "Serialization"),
    ("Scientific/Engineering :: Mathematics", "Data Science"),
    ("Scientific/Engineering :: Visualization", "Data Science"),
    ("Scientific/Engineering", "Data Science"),
]

_KEYWORD_RULES: list[tuple[frozenset[str], str]] = [
    (frozenset({"machine-learning", "deep-learning", "neural-network", "llm", "gpt", "nlp",
                "artificial-intelligence", "transformers", "pytorch", "tensorflow",
                "generative-ai", "foundation-model", "embedding", "vector-search"}), "AI / ML"),
    (frozenset({"jwt", "oauth", "saml", "oidc", "authentication", "auth", "identity",
                "login", "sso", "session", "token"}), "Authentication"),
    (frozenset({"bcrypt", "encryption", "decrypt", "cipher", "hmac", "pgp", "aes",
                "rsa", "elliptic", "hashing"}), "Cryptography"),
    (frozenset({"sql", "orm", "mongodb", "postgres", "mysql", "sqlite", "redis", "nosql",
                "database", "query-builder", "migration", "datastore"}), "Database / ORM"),
    (frozenset({"webpack", "rollup", "bundler", "vite", "esbuild", "transpile",
                "compiler", "tree-shaking", "eslint", "linter", "lint", "formatter",
                "prettier", "static-analysis", "code-quality"}), "Build Tools"),
    (frozenset({"test", "testing", "jest", "mocha", "assertion", "spec",
                "mock", "chai", "coverage", "fixture"}), "Testing"),
    (frozenset({"react", "vue", "angular", "svelte", "dom", "component",
                "frontend", "ui-library", "jsx", "tsx"}), "Frontend / UI"),
    (frozenset({"aws", "cloud", "kubernetes", "k8s", "docker", "serverless",
                "devops", "terraform", "ansible", "infrastructure",
                "workflow", "orchestration", "task-queue", "message-queue"}), "Infrastructure"),
    (frozenset({"websocket", "grpc", "http", "ajax", "fetch", "rest",
                "xhr", "api-client", "sdk"}), "HTTP Client"),
    (frozenset({"protobuf", "msgpack", "yaml", "toml", "codec",
                "serialize", "deserialize", "marshaling"}), "Serialization"),
    (frozenset({"cli", "command-line", "argument-parser", "argv", "terminal"}), "CLI / Utilities"),
    (frozenset({"diagram", "flowchart", "chart", "dataviz", "data-science",
                "dataframe", "statistics", "visualization", "plotting", "numerical"}), "Data Science"),
    (frozenset({"package-manager", "dependency-management", "semver"}), "Package Manager"),
]

_NAME_RULES: list[tuple[str, str]] = [
    ("torch", "AI / ML"), ("tensorflow", "AI / ML"), ("langchain", "AI / ML"),
    ("transformers", "AI / ML"), ("openai", "AI / ML"), ("anthropic", "AI / ML"),
    ("mistralai", "AI / ML"), ("cohere", "AI / ML"), ("google-generativeai", "AI / ML"),
    ("google-genai", "AI / ML"), ("vertexai", "AI / ML"), ("litellm", "AI / ML"),
    ("django", "Web Framework"), ("flask", "Web Framework"), ("fastapi", "Web Framework"),
    ("starlette", "Web Framework"), ("express", "Web Framework"), ("nestjs", "Web Framework"),
    ("koa", "Web Framework"), ("sanic", "Web Framework"), ("litestar", "Web Framework"),
    ("requests", "HTTP Client"), ("httpx", "HTTP Client"), ("urllib3", "HTTP Client"),
    ("aiohttp", "HTTP Client"), ("axios", "HTTP Client"), ("node-fetch", "HTTP Client"),
    ("pyjwt", "Authentication"), ("authlib", "Authentication"), ("pyotp", "Authentication"),
    ("cryptography", "Cryptography"), ("pyopenssl", "Cryptography"), ("bcrypt", "Cryptography"),
    ("sqlalchemy", "Database / ORM"), ("alembic", "Database / ORM"), ("pymongo", "Database / ORM"),
    ("typeorm", "Database / ORM"), ("prisma", "Database / ORM"), ("mongoose", "Database / ORM"),
    ("numpy", "Data Science"), ("pandas", "Data Science"), ("scipy", "Data Science"),
    ("matplotlib", "Data Science"), ("scikit", "Data Science"), ("plotly", "Data Science"),
    ("webpack", "Build Tools"), ("babel", "Build Tools"), ("eslint", "Build Tools"),
    ("vite", "Build Tools"), ("ruff", "Build Tools"), ("mypy", "Build Tools"),
    ("click", "CLI / Utilities"), ("typer", "CLI / Utilities"), ("rich", "CLI / Utilities"),
    ("tqdm", "CLI / Utilities"), ("commander", "CLI / Utilities"), ("chalk", "CLI / Utilities"),
    ("pytest", "Testing"), ("hypothesis", "Testing"), ("faker", "Testing"),
    ("tailwind", "Frontend / UI"), ("nextjs", "Frontend / UI"), ("nuxt", "Frontend / UI"),
    ("tanstack/router", "Web Framework"), ("tanstack/start", "Web Framework"),
    ("tanstack/query", "HTTP Client"), ("tanstack/", "Frontend / UI"),
    ("boto", "Infrastructure"), ("aws-cdk", "Infrastructure"), ("celery", "Infrastructure"),
    ("kafka", "Infrastructure"), ("pulumi", "Infrastructure"), ("gunicorn", "Infrastructure"),
    ("uvicorn", "Infrastructure"),
    ("pyyaml", "Serialization"), ("protobuf", "Serialization"), ("orjson", "Serialization"),
    ("pydantic", "Serialization"), ("marshmallow", "Serialization"),
    ("poetry", "Package Manager"), ("setuptools", "Package Manager"), ("hatch", "Package Manager"),
]


def _infer_sectors(name: str, classifiers: list[str], keywords: list[str]) -> list[str]:
    sectors: set[str] = set()
    name_lower = name.lower()
    kw_set = {k.lower() for k in keywords}

    for pattern, sector in _PYPI_RULES:
        if any(pattern in c for c in classifiers):
            sectors.add(sector)

    for trigger_kws, sector in _KEYWORD_RULES:
        if kw_set & trigger_kws:
            sectors.add(sector)

    for substr, sector in _NAME_RULES:
        if substr in name_lower:
            sectors.add(sector)

    return sorted(sectors)


async def _fetch_pypi_meta(
    client: httpx.AsyncClient, name: str
) -> tuple[list[str], list[str]]:
    try:
        r = await client.get(f"https://pypi.org/pypi/{name}/json", timeout=10)
        if r.status_code == 200:
            info = r.json().get("info", {})
            classifiers = info.get("classifiers") or []
            kw_raw = info.get("keywords") or ""
            keywords = [k.strip() for k in re.split(r"[,\s]+", kw_raw) if k.strip()]
            return classifiers, keywords
    except Exception:
        pass
    return [], []


async def _fetch_npm_keywords(client: httpx.AsyncClient, name: str) -> list[str]:
    try:
        r = await client.get(f"https://registry.npmjs.org/{name}", timeout=10)
        if r.status_code == 200:
            kw = r.json().get("keywords") or []
            return [k for k in kw if isinstance(k, str)]
    except Exception:
        pass
    return []


async def fetch_package_description(
    client: httpx.AsyncClient, name: str, ecosystem: str
) -> tuple[str, list[str]]:
    """Return (description_text, keywords) for LLM classification."""
    if ecosystem == "PyPI":
        try:
            r = await client.get(f"https://pypi.org/pypi/{name}/json", timeout=10)
            if r.status_code == 200:
                info = r.json().get("info", {})
                desc = (info.get("description") or "")[:2000]
                kw_raw = info.get("keywords") or ""
                kw = [k.strip() for k in re.split(r"[,\s]+", kw_raw) if k.strip()]
                return desc, kw
        except Exception:
            pass
    elif ecosystem == "npm":
        try:
            r = await client.get(f"https://registry.npmjs.org/{name}/latest", timeout=10)
            if r.status_code == 200:
                data = r.json()
                desc = data.get("description") or ""
                kw = [k for k in (data.get("keywords") or []) if isinstance(k, str)]
                return desc, kw
        except Exception:
            pass
    return "", []


async def fetch_package_sectors(
    client: httpx.AsyncClient, name: str, ecosystem: str
) -> list[str]:
    """Infer sectors via heuristics on registry metadata."""
    if ecosystem == "PyPI":
        classifiers, keywords = await _fetch_pypi_meta(client, name)
    elif ecosystem == "npm":
        keywords = await _fetch_npm_keywords(client, name)
        classifiers = []
    else:
        classifiers, keywords = [], []
    return _infer_sectors(name, classifiers, keywords)


async def classify_sectors_llm(
    client: httpx.AsyncClient, name: str, ecosystem: str
) -> list[str]:
    """Classify package sectors via LLM. Expensive — use for onboarding only."""
    from config import get_openai_client
    from pydantic import BaseModel

    description, keywords = await fetch_package_description(client, name, ecosystem)

    class SectorClassification(BaseModel):
        sectors: list[PackageSector]  # type: ignore[valid-type]

    openai = get_openai_client()
    response = await openai.beta.chat.completions.parse(
        model="gpt-5.4-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "Classify the given package into one or more sectors from the allowed list. "
                    "Return only sectors that clearly apply."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Package: {name}\nEcosystem: {ecosystem}\n"
                    f"Keywords: {', '.join(keywords) if keywords else 'none'}\n"
                    f"Description: {description[:500]}"
                ),
            },
        ],
        response_format=SectorClassification,
    )
    result = response.choices[0].message.parsed
    return list(result.sectors) if result else []
