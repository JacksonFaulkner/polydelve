import time
from typing import Any

_store: dict[str, tuple[Any, float]] = {}

AUTHED_TTL = 30.0
UNAUTHED_TTL = 180.0


def cache_get(key: str) -> Any | None:
    entry = _store.get(key)
    if entry and time.time() < entry[1]:
        return entry[0]
    _store.pop(key, None)
    return None


def cache_set(key: str, value: Any, ttl: float) -> None:
    _store[key] = (value, time.time() + ttl)


def cache_invalidate(key: str) -> None:
    _store.pop(key, None)


def ttl_for(user: dict | None) -> float:
    return AUTHED_TTL if user else UNAUTHED_TTL