"""Fetch structured security news from Exa + GPT."""
import asyncio
import hashlib
import json
import time
from datetime import datetime
from urllib.parse import urlparse

from config import get_exa_client, get_openai_client
from etl.fetch.embedding import embed_document
from models.models import NewsAnalysis, NewsEmbeddings, PackageRisk, RecentNews

_QUERY = "software supply chain security breach vulnerability attack"
_GPT_MODEL = "gpt-4o-mini"

_SYSTEM_PROMPT = (
    "You analyze tech security news. Return a JSON object that strictly follows this schema. "
    "Pay close attention to the field descriptions — they define exact formatting rules.\n\n"
    + json.dumps(NewsAnalysis.model_json_schema(), indent=2)
)


def parse_source_name(url: str) -> str:
    """Extract human-readable domain from URL. e.g. 'www.bleepingcomputer.com' → 'bleepingcomputer.com'"""
    return urlparse(url).netloc.removeprefix("www.")


def _article_id(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def _date_filter(start_date: datetime | None, end_date: datetime | None) -> dict:
    params = {}
    if start_date:
        params["start_published_date"] = start_date.strftime("%Y-%m-%dT%H:%M:%SZ")
    if end_date:
        params["end_published_date"] = end_date.strftime("%Y-%m-%dT%H:%M:%SZ")
    return params


async def fetch_news_gpt_structured(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[RecentNews]:
    """Fetch + parse security news articles for a date range via Exa + GPT structured output."""
    exa = get_exa_client()
    results = await exa.search_and_contents(
        query=_QUERY,
        num_results=10,
        category="news",
        text=True,
        **_date_filter(start_date, end_date),
    )

    openai = get_openai_client()

    async def call_gpt(messages: list) -> dict:
        response = await openai.chat.completions.create(
            model=_GPT_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)

    async def enrich(result) -> RecentNews:
        title = result.title or ""
        body = result.text or ""
        url = getattr(result, "url", "")

        messages = [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Title: {title}\nURL: {url}\n\n{body[:3000]}"},
        ]

        t0 = time.perf_counter()
        gpt_tasks = {asyncio.ensure_future(call_gpt(messages)) for _ in range(3)}
        embed_tasks = asyncio.gather(
            embed_document(title),
            embed_document(body[:8000]),
        )

        done, pending = await asyncio.wait(gpt_tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in pending:
            t.cancel()
        data = done.pop().result()

        title_vec, source_vec = await embed_tasks
        desc_vec = await embed_document(data.get("description", ""))

        print(f"[{time.perf_counter() - t0:.2f}s] {title[:60]}", flush=True)

        packages = [
            PackageRisk(
                name=p.get("name", "") if isinstance(p, dict) else str(p),
                ecosystem=p.get("ecosystem", "other") if isinstance(p, dict) else "other",
                weekly_downloads=None,
                cve_ids=[],
                epss_score=None,
            )
            for p in data.get("affected_packages", [])
        ]

        gpt_summary = data.get("description", "")

        return RecentNews(
            id=_article_id(url),
            title=title,
            description=body[:500],
            summary=gpt_summary,
            source_name=parse_source_name(url),
            published_date=getattr(result, "published_date", None),
            source_url=url,
            embeddings=NewsEmbeddings(
                title=title_vec,
                description=desc_vec,
                source=source_vec,
            ),
            analysis=NewsAnalysis(
                description=gpt_summary,
                company_labels=data.get("company_labels", []),
                sector_labels=data.get("sector_labels", []),
                affected_packages=packages,
                threat_actor=data.get("threat_actor"),
                exploit_status=data.get("exploit_status"),
                severity=data.get("severity"),
            ),
        )

    return list(await asyncio.gather(*[enrich(r) for r in results.results]))
