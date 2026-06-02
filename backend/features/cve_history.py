import asyncio
import io
import json
import zipfile
from dataclasses import dataclass

import httpx

_OSV_ECOSYSTEMS = {"npm": "npm", "PyPI": "PyPI", "composer": "Packagist"}
_SEVERITY_MAP = {"CRITICAL": "critical", "HIGH": "high", "MODERATE": "medium", "LOW": "low"}
_OSV_BULK_URL = "https://osv-vulnerabilities.storage.googleapis.com/{ecosystem}/all.zip"


@dataclass
class CveRecord:
    osv_id: str
    cve_id: str | None
    name: str
    ecosystem: str
    published_date: str | None
    modified_date: str | None
    severity: str | None
    cvss_vector: str | None
    cvss_score: float | None = None


_NPM_FALLBACK_SEED: list[str] = [
    # core / runtime
    "chalk", "lodash", "react", "typescript", "axios", "express", "eslint",
    "prettier", "jest", "webpack", "babel", "moment", "underscore", "jquery",
    "vue", "next", "gatsby", "nuxt", "angular", "mocha", "commander",
    "dotenv", "uuid", "debug", "semver", "glob", "minimist", "yargs",
    "mkdirp", "rimraf", "cross-env", "cross-spawn", "which", "execa",
    "ora", "inquirer", "chalk", "boxen", "figlet", "ansi-colors",
    "kleur", "picocolors", "colorette", "nanoid", "cuid", "shortid",
    "ms", "bytes", "humanize-duration", "pretty-bytes", "filesize",
    "node-fetch", "got", "superagent", "request", "needle", "ky",
    "cheerio", "jsdom", "puppeteer", "playwright", "selenium-webdriver",
    "sharp", "jimp", "canvas", "svg.js",
    "zod", "yup", "joi", "ajv", "validator", "class-validator",
    "rxjs", "redux", "zustand", "mobx", "immer", "recoil", "jotai",
    "react-dom", "react-router", "react-query", "swr", "react-hook-form",
    "react-redux", "react-router-dom", "react-icons",
    "@emotion/react", "@emotion/styled", "styled-components", "tailwindcss",
    "sass", "less", "postcss", "autoprefixer",
    "vite", "rollup", "esbuild", "parcel", "turbopack",
    "ts-node", "tsx", "sucrase",
    "@babel/core", "@babel/preset-env", "@babel/preset-typescript",
    "@babel/preset-react", "@babel/parser", "@babel/traverse",
    "eslint-config-airbnb", "eslint-plugin-react", "eslint-plugin-import",
    "@typescript-eslint/eslint-plugin", "@typescript-eslint/parser",
    "prettier-plugin-tailwindcss",
    "vitest", "mocha", "chai", "sinon", "supertest", "nock",
    "@testing-library/react", "@testing-library/jest-dom",
    "nyc", "istanbul", "c8",
    "express", "fastify", "koa", "hapi", "nestjs", "@nestjs/core",
    "socket.io", "ws", "uws",
    "mongoose", "sequelize", "typeorm", "prisma", "@prisma/client",
    "knex", "objection", "bookshelf",
    "redis", "ioredis", "bull", "bullmq",
    "mysql", "mysql2", "pg", "sqlite3", "better-sqlite3",
    "mongodb", "mongoose",
    "aws-sdk", "@aws-sdk/client-s3", "@aws-sdk/client-lambda",
    "@google-cloud/storage", "@azure/storage-blob",
    "stripe", "paypal-rest-sdk",
    "jsonwebtoken", "passport", "bcrypt", "bcryptjs",
    "crypto-js", "node-forge", "argon2",
    "multer", "formidable", "busboy",
    "nodemailer", "sendgrid", "@sendgrid/mail",
    "winston", "pino", "bunyan", "morgan",
    "lodash-es", "ramda", "fp-ts", "immutable",
    "date-fns", "dayjs", "luxon",
    "marked", "showdown", "remark", "rehype", "unified",
    "highlight.js", "prismjs", "shiki",
    "three", "d3", "chart.js", "recharts", "victory",
    "p5", "pixi.js", "babylonjs",
    "tensorflow", "@tensorflow/tfjs", "onnxruntime-node",
    "openai", "@anthropic-ai/sdk", "langchain",
    "yaml", "toml", "ini", "dotenv-expand",
    "tar", "unzipper", "archiver", "adm-zip",
    "chokidar", "fs-extra", "graceful-fs",
    "lru-cache", "node-cache", "cache-manager",
    "p-limit", "p-queue", "p-map", "p-retry",
    "eventemitter3", "mitt", "tiny-emitter",
    "proxy-agent", "http-proxy", "http-proxy-middleware",
    "compression", "cors", "helmet",
    "cookie", "cookie-parser", "tough-cookie",
    "qs", "querystring", "url-parse",
    "mime", "mime-types", "content-type",
    "multer", "sharp",
    "xml2js", "fast-xml-parser", "xmlbuilder2",
    "csv-parse", "papaparse", "xlsx",
    "pdf-parse", "pdfkit",
    "nodemon", "ts-jest", "babel-jest",
    "@types/node", "@types/react", "@types/lodash",
    "lerna", "nx", "turborepo",
    "husky", "lint-staged", "commitlint",
    "semantic-release", "standard-version",
    "depcheck", "npm-check-updates",
    "concurrently", "wait-on", "npm-run-all",
    # security-relevant / commonly CVE'd
    "log4js", "node-serialize", "serialize-javascript",
    "handlebars", "pug", "ejs", "nunjucks", "mustache",
    "vm2", "isolated-vm",
    "tar", "node-tar", "fstream",
    "minimatch", "path-to-regexp", "anymatch",
    "shelljs", "child-process-promise",
    "follow-redirects", "urllib", "tunnel",
    "braces", "micromatch", "picomatch",
    "semver", "node-semver",
    "jsonpath", "jmespath",
    "lodash.merge", "lodash.set", "lodash.template",
    "merge-deep", "deepmerge", "extend",
    "q", "bluebird", "when", "async",
    "ip", "ipaddr.js", "netmask",
    "decode-uri-component", "whatwg-url",
    "ua-parser-js", "useragent",
    "svgo", "imagemin",
    "postcss", "stylelint",
    "cypress", "nightwatch", "webdriverio",
    "electron", "electron-builder",
    "pkg", "nexe",
    "socket.io-client", "engine.io",
    "passport-local", "passport-jwt", "passport-oauth2",
    "express-session", "cookie-session",
    "csurf", "hpp", "express-rate-limit",
    "sequelize-cli", "typeorm-seeding",
    "graphql", "apollo-server", "apollo-client",
    "@apollo/server", "@apollo/client",
    "nexus", "type-graphql",
    "grpc", "@grpc/grpc-js", "protobufjs",
    "amqplib", "kafkajs", "nats",
    "jest-circus", "jasmine",
    "storybook", "@storybook/react",
    "svelte", "@sveltejs/kit", "solid-js",
    "remix", "@remix-run/node",
    "astro", "qwik", "@builder.io/qwik",
    "webpack-cli", "webpack-dev-server",
    "create-react-app", "create-next-app", "create-vite",
]


async def fetch_top_npm(n: int = 99_999) -> list[str]:
    """
    Fetches top npm packages by download count from wooorm/npm-high-impact,
    which publishes ~13k packages ranked by weekly downloads.
    Falls back to hardcoded seed on failure.
    """
    import re
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://raw.githubusercontent.com/wooorm/npm-high-impact/main/lib/top-download.js"
            )
            if r.status_code == 200:
                names = re.findall(r"'([^']+)'", r.text)
                if names:
                    return list(dict.fromkeys(names))[:n]
    except Exception:
        pass
    return list(dict.fromkeys(_NPM_FALLBACK_SEED))[:n]


async def fetch_top_pypi(n: int = 99_999) -> list[str]:
    async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
        r = await client.get(
            "https://hugovk.github.io/top-pypi-packages/top-pypi-packages-30-days.min.json"
        )
        if r.status_code == 200:
            return [row["project"] for row in r.json().get("rows", [])[:n]]
    return []



def _cvss_score_from_vector(vector: str | None) -> float | None:
    if not vector:
        return None
    try:
        if vector.startswith("CVSS:4"):
            from cvss import CVSS4
            return float(CVSS4(vector).base_score)
        from cvss import CVSS3
        return float(CVSS3(vector).base_score)
    except Exception:
        return None


def _parse_vuln(vuln: dict) -> tuple[str | None, str | None, str | None, float | None]:
    cve_id = next((a for a in vuln.get("aliases", []) if a.startswith("CVE-")), None)

    db = vuln.get("database_specific", {})
    raw_sev = (db.get("severity") or "").upper()
    severity = _SEVERITY_MAP.get(raw_sev)

    cvss_vector = None
    for sev in vuln.get("severity", []):
        if sev.get("type") in ("CVSS_V3", "CVSS_V2", "CVSS_V4"):
            cvss_vector = sev.get("score")
            break

    cvss_score = _cvss_score_from_vector(cvss_vector)
    return cve_id, severity, cvss_vector, cvss_score


async def _download_bulk_ecosystem(
    client: httpx.AsyncClient,
    ecosystem: str,
    progress: bool,
) -> dict[str, list[dict]]:
    """Download all.zip for ecosystem, return {package_name_lower: [vuln_dict]}."""
    osv_eco = _OSV_ECOSYSTEMS.get(ecosystem, ecosystem)
    url = _OSV_BULK_URL.format(ecosystem=osv_eco)
    if progress:
        print(f"  downloading {url} ...")
    r = await client.get(url, timeout=120)
    r.raise_for_status()
    if progress:
        print(f"  {osv_eco}: {len(r.content)/1e6:.1f}MB  parsing...")

    z = zipfile.ZipFile(io.BytesIO(r.content))
    by_pkg: dict[str, list[dict]] = {}
    for name in z.namelist():
        vuln = json.loads(z.read(name))
        for affected in vuln.get("affected", []):
            pkg = affected.get("package", {})
            if pkg.get("ecosystem", "") == osv_eco:
                key = pkg.get("name", "").lower()
                by_pkg.setdefault(key, []).append(vuln)
    return by_pkg


async def build_cve_history(
    packages: list[tuple[str, str]],
    progress: bool = True,
) -> list[CveRecord]:
    ecosystems = list({eco for _, eco in packages})

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        bulk_results = await asyncio.gather(
            *[_download_bulk_ecosystem(client, eco, progress) for eco in ecosystems]
        )

    bulk: dict[str, dict[str, list[dict]]] = dict(zip(ecosystems, bulk_results))

    records: list[CveRecord] = []
    for name, ecosystem in packages:
        eco_index = bulk.get(ecosystem, {})
        vulns = eco_index.get(name.lower(), [])
        for vuln in vulns:
            cve_id, severity, cvss_vector, cvss_score = _parse_vuln(vuln)
            records.append(CveRecord(
                osv_id=vuln.get("id", ""),
                cve_id=cve_id,
                name=name,
                ecosystem=ecosystem,
                published_date=vuln.get("published"),
                modified_date=vuln.get("modified"),
                severity=severity,
                cvss_vector=cvss_vector,
                cvss_score=cvss_score,
            ))

    if progress:
        print(f"  bulk: {len(records)} records for {len(packages)} packages")
    return records
