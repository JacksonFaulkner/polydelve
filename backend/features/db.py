import logging
import os
import threading
from contextlib import contextmanager

import psycopg2
from fastapi import Request
from pgvector.psycopg2 import register_vector
from psycopg2.pool import PoolError, ThreadedConnectionPool

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://polydelve:polydelve@127.0.0.1:5432/polydelve_dev"
)
log = logging.getLogger(__name__)

POOL_MIN = int(os.getenv("DB_POOL_MIN", "1"))
POOL_MAX = int(os.getenv("DB_POOL_MAX", "10"))
# How long a request waits for a free connection before failing.
POOL_TIMEOUT = float(os.getenv("DB_POOL_TIMEOUT", "10"))


class BlockingPool:
    """ThreadedConnectionPool that waits for a free connection instead of raising.

    Sync routes run on FastAPI's threadpool (40 threads by default), so more
    concurrent requests than DB_POOL_MAX would otherwise get PoolError -> 500.
    """

    def __init__(self, minconn: int, maxconn: int, dsn: str, timeout: float) -> None:
        self._pool = ThreadedConnectionPool(minconn, maxconn, dsn=dsn)
        self._slots = threading.BoundedSemaphore(maxconn)
        self._timeout = timeout
        self._registered: set[int] = set()

    def getconn(self):
        if not self._slots.acquire(timeout=self._timeout):
            raise PoolError(f"no database connection free after {self._timeout}s")
        try:
            conn = self._pool.getconn()
            # register_vector queries pg_type, so do it once per physical connection.
            if id(conn) not in self._registered:
                register_vector(conn)
                self._registered.add(id(conn))
            return conn
        except Exception:
            self._slots.release()
            raise

    def putconn(self, conn) -> None:
        try:
            self._pool.putconn(conn, close=bool(conn.closed))
        finally:
            # The pool closes connections beyond minconn; forget their ids so a
            # new connection that reuses the id still gets register_vector.
            if conn.closed:
                self._registered.discard(id(conn))
            self._slots.release()

    def closeall(self) -> None:
        self._pool.closeall()
        self._registered.clear()


_pool: BlockingPool | None = None
_pool_lock = threading.Lock()


def _get_pool() -> BlockingPool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = BlockingPool(POOL_MIN, POOL_MAX, DATABASE_URL, POOL_TIMEOUT)
    return _pool


def open_pool() -> None:
    """Create the pool at startup so the first request doesn't pay for it."""
    _get_pool()


def close_pool() -> None:
    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.closeall()
            _pool = None


@contextmanager
def pooled_conn():
    """Borrow a pooled connection outside a request (e.g. app startup)."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        # Clear any idle-in-transaction state before returning to the pool.
        try:
            conn.rollback()
        except Exception:
            pass
        pool.putconn(conn)


def get_db(request: Request):
    with pooled_conn() as conn:
        yield conn


def get_db_conn(autocommit: bool = False):
    """Direct connection for scripts (no FastAPI Request context)."""
    conn = psycopg2.connect(DATABASE_URL)
    if autocommit:
        conn.autocommit = True
    register_vector(conn)
    return conn


_CDN = "https://cdn.simpleicons.org"

COMPANIES = [
    # Grade A — massive security orgs, slow to adopt unvetted deps
    {"id": "google", "title": "Google", "logo": f"{_CDN}/google", "grade": "A"},
    {
        "id": "microsoft",
        "title": "Microsoft",
        "logo": "https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg",
        "grade": "A",
    },
    # Grade B — strong security, but broader open-source surface
    {"id": "stripe", "title": "Stripe", "logo": f"{_CDN}/stripe", "grade": "B"},
    {
        "id": "cloudflare",
        "title": "Cloudflare",
        "logo": f"{_CDN}/cloudflare",
        "grade": "B",
    },
    {"id": "github", "title": "GitHub", "logo": f"{_CDN}/github", "grade": "B"},
    # Grade C — medium exposure, real third-party integration risk
    {"id": "shopify", "title": "Shopify", "logo": f"{_CDN}/shopify", "grade": "C"},
    {"id": "twilio", "title": "Twilio", "logo": f"{_CDN}/twilio", "grade": "C"},
    {"id": "okta", "title": "Okta", "logo": f"{_CDN}/okta", "grade": "C"},
    # Grade D — high npm/pip dependency count, fast-moving teams
    {
        "id": "robinhood",
        "title": "Robinhood",
        "logo": f"{_CDN}/robinhood",
        "grade": "D",
    },
    {"id": "coinbase", "title": "Coinbase", "logo": f"{_CDN}/coinbase", "grade": "D"},
    # Grade F — open source everything, huge transitive dep surface
    {"id": "vercel", "title": "Vercel", "logo": f"{_CDN}/vercel", "grade": "F"},
    {
        "id": "huggingface",
        "title": "Hugging Face",
        "logo": f"{_CDN}/huggingface",
        "grade": "F",
    },
    {"id": "replit", "title": "Replit", "logo": f"{_CDN}/replit", "grade": "F"},
]


def seed_companies(conn) -> None:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM companies")
    count = cur.fetchone()[0]
    if count >= len(COMPANIES):
        return
    cur.executemany(
        """
        INSERT INTO companies (id, title, logo, grade) VALUES (%s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, logo = EXCLUDED.logo, grade = EXCLUDED.grade
        """,
        [(c["id"], c["title"], c["logo"], c["grade"]) for c in COMPANIES],
    )
    conn.commit()
    log.info("Seeded %d companies", len(COMPANIES))


if __name__ == "__main__":
    conn = get_db_conn()
    seed_companies(conn)
    conn.close()

