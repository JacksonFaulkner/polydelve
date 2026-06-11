"""Backwards-compatible shim — canonical implementation lives in etl.fetch.news."""
from etl.fetch.news import fetch_news_gpt_structured

__all__ = ["fetch_news_gpt_structured"]
