"""Gemini embedding generation for news documents and queries."""
import asyncio
from functools import partial

from google.genai.types import EmbedContentConfig

from config import get_gemini_client

_MODEL = "gemini-embedding-2-preview"
_DIMENSIONS = 3072


def _embed_sync(text: str, task_type: str) -> list[float]:
    client = get_gemini_client()
    response = client.models.embed_content(
        model=_MODEL,
        contents=[text],
        config=EmbedContentConfig(
            output_dimensionality=_DIMENSIONS,
            task_type=task_type,
        ),
    )
    if not response.embeddings:
        raise RuntimeError("Embedding API returned no embeddings")
    return list(response.embeddings[0].values)


async def embed_document(text: str) -> list[float]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(_embed_sync, text, "RETRIEVAL_DOCUMENT"))


async def embed_query(text: str) -> list[float]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(_embed_sync, text, "RETRIEVAL_QUERY"))
