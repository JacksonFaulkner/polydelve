"""Shared ETL utilities."""
import asyncio
from collections.abc import Coroutine
from datetime import datetime
from typing import Any, TypeVar

from tqdm.asyncio import tqdm

T = TypeVar("T")

DEFAULT_HTTP_TIMEOUT = 10
DEFAULT_HTTP_OPTIONS = {"timeout": DEFAULT_HTTP_TIMEOUT, "follow_redirects": True}


async def bounded_gather(
    coros: list[Coroutine[Any, Any, T]],
    concurrency: int,
    desc: str = "",
) -> list[T]:
    """Run coroutines with a bounded semaphore and tqdm progress bar."""
    sem = asyncio.Semaphore(concurrency)

    async def _wrap(coro: Coroutine[Any, Any, T]) -> T:
        async with sem:
            return await coro

    return await tqdm.gather(*[_wrap(c) for c in coros], desc=desc)


def parse_ts(s: str | None) -> datetime | None:
    """Parse an ISO 8601 timestamp string to datetime, returns None on failure."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None
