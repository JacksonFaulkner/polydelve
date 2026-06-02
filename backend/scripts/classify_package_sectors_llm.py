import asyncio
import sys
from pathlib import Path

import duckdb
import httpx
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import get_openai_client
from features.db import DB_PATH, init_db
from features.package_sectors import PackageSector, fetch_package_description

_MODEL = "gpt-5.4-nano-2026-03-17"
_CONCURRENCY = 15

_SYSTEM = (
    "Classify software packages into one or more sectors based on name, description, and keywords. "
    "Only include sectors that clearly apply — don't add generic ones like 'Build Tools' unless "
    "the package is specifically for building/tooling. If nothing fits, return an empty list.\n\n"
    "Sectors: AI / ML, Authentication, Build Tools, CLI / Utilities, Cryptography, Data Science, "
    "Database / ORM, Frontend / UI, HTTP Client, Infrastructure, Package Manager, Serialization, "
    "Testing, Web Framework"
)


class SectorClassification(BaseModel):
    sectors: list[PackageSector]


async def _classify_one(
    openai,
    http: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    name: str,
    ecosystem: str,
) -> tuple[str, str, list[str]]:
    async with sem:
        description, keywords = await fetch_package_description(http, name, ecosystem)

        user_msg = (
            f"Package: {name}\n"
            f"Ecosystem: {ecosystem}\n"
            f"Keywords: {', '.join(keywords) if keywords else 'none'}\n"
            f"Description: {description[:1500] if description else 'none'}"
        )

        try:
            resp = await openai.beta.chat.completions.parse(
                model=_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                response_format=SectorClassification,
                max_tokens=80,
            )
            sectors = resp.choices[0].message.parsed.sectors
            return name, ecosystem, sectors
        except Exception as e:
            print(f"  ERROR {name}: {e}")
            return name, ecosystem, []


async def main() -> None:
    conn = duckdb.connect(DB_PATH)
    init_db(conn)

    rows = conn.execute("""
        SELECT name, ecosystem FROM packages
        WHERE sectors IS NULL AND ecosystem IN ('npm', 'PyPI')
    """).fetchall()

    if not rows:
        print("nothing to classify")
        conn.close()
        return

    print(f"classifying {len(rows)} packages with {_MODEL}...")

    openai = get_openai_client()
    sem = asyncio.Semaphore(_CONCURRENCY)

    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as http:
        results = await asyncio.gather(
            *[_classify_one(openai, http, sem, name, eco) for name, eco in rows]
        )

    updated = no_match = 0
    for name, ecosystem, sectors in sorted(results, key=lambda r: (not r[2], r[0])):
        if sectors:
            conn.execute(
                "UPDATE packages SET sectors = ? WHERE name = ? AND ecosystem = ?",
                [sectors, name, ecosystem],
            )
            updated += 1
            print(f"  {name[:40]:40} {ecosystem:6} {sectors}")
        else:
            no_match += 1

    conn.close()
    print(f"\nupdated {updated}, no match {no_match}/{len(rows)}")


if __name__ == "__main__":
    asyncio.run(main())
