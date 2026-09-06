"""Shared page/page_size pagination for list endpoints. Existing routes
(leaderboard, packages, news) each hand-roll offset math and a bespoke
response shape — new endpoints should use this instead."""
from dataclasses import dataclass
from typing import Any

from fastapi import Query


@dataclass
class PageParams:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_query(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100)) -> PageParams:
    return PageParams(page=page, page_size=page_size)


def paginated_response(items: list[Any], total: int, params: PageParams) -> dict:
    total_pages = max(1, -(-total // params.page_size))
    return {
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
        "total_pages": total_pages,
    }
