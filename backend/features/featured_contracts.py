"""Generate, re-rank, and expire featured contracts from package risk signals."""
import uuid
from datetime import date, timedelta

import duckdb
from pydantic import BaseModel, Field

from config import get_openai_client
from features.contract_pricing import price_contract

_RANK_MODEL = "gpt-5.4-mini"
_FEATURED_LIMIT = 12
_CANDIDATE_POOL = 24

# Per-ecosystem percentile rank on each signal so npm's raw scale (downloads,
# CVE volume) doesn't drown out PyPI. |EPSS delta| scores both spikes (active
# exploitation) and drops (patched / decaying story) — both are newsworthy.
_SIGNAL_QUERY = """
WITH cve_stats AS (
    SELECT name, ecosystem,
           max(cvss_score) AS max_cvss,
           count(*)        AS cve_count
    FROM cve_history
    WHERE published_date >= now() - INTERVAL 90 DAY
    GROUP BY name, ecosystem
),
epss_delta AS (
    SELECT name, ecosystem,
           arg_max(epss_score, recorded_at) - arg_min(epss_score, recorded_at) AS delta
    FROM epss_history
    WHERE recorded_at >= current_date - 7
    GROUP BY name, ecosystem
),
signals AS (
    SELECT p.name, p.ecosystem,
           coalesce(p.epss_score, 0)        AS epss,
           coalesce(abs(d.delta), 0)        AS epss_delta,
           coalesce(c.max_cvss, 0)          AS max_cvss,
           coalesce(c.cve_count, 0)         AS cve_count,
           coalesce(p.weekly_downloads, 0)  AS downloads,
           p.has_mal_advisory               AS has_mal
    FROM packages p
    LEFT JOIN cve_stats  c USING (name, ecosystem)
    LEFT JOIN epss_delta d USING (name, ecosystem)
    WHERE p.ecosystem IN ('npm', 'PyPI')
      AND (p.epss_score IS NOT NULL OR c.cve_count > 0 OR p.has_mal_advisory)
),
scored AS (
    SELECT name, ecosystem, max_cvss,
           0.25 * percent_rank() OVER (PARTITION BY ecosystem ORDER BY epss)
         + 0.25 * percent_rank() OVER (PARTITION BY ecosystem ORDER BY epss_delta)
         + 0.20 * percent_rank() OVER (PARTITION BY ecosystem ORDER BY max_cvss)
         + 0.15 * percent_rank() OVER (PARTITION BY ecosystem ORDER BY cve_count)
         + 0.15 * percent_rank() OVER (PARTITION BY ecosystem ORDER BY downloads)
         + CASE WHEN has_mal THEN 0.10 ELSE 0 END
           AS score
    FROM signals
)
SELECT name, ecosystem, max_cvss, least(score, 1.0) AS score
FROM scored
ORDER BY score DESC
LIMIT ?
"""


def _cvss_threshold(max_cvss: float) -> float:
    """Set the win condition near the package's demonstrated severity ceiling."""
    if max_cvss >= 9:
        return 9.0
    if max_cvss >= 7:
        return 7.5
    return 5.0


def generate_featured_contracts(
    conn: duckdb.DuckDBPyConnection,
    pool_size: int = _CANDIDATE_POOL,
) -> int:
    """Mint featured contracts for the highest-signal packages.

    Deterministic — pure SQL over packages / cve_history / epss_history with
    per-ecosystem percentile normalization. Returns count of new contracts.
    """
    candidates = conn.execute(_SIGNAL_QUERY, [pool_size]).fetchall()
    if not candidates:
        return 0

    existing: dict[tuple[str, str], str] = {
        (row[0], row[1]): row[2]
        for row in conn.execute(
            "SELECT package_name, package_ecosystem, id FROM featured_contracts WHERE status IN ('open', 'benched')"
        ).fetchall()
    }

    inserted = 0
    for name, ecosystem, max_cvss, score in candidates:
        key = (name, ecosystem)
        if key in existing:
            # Already live — refresh its signal score so ranking stays current
            conn.execute(
                "UPDATE featured_contracts SET relevancy_score = ? WHERE id = ?",
                [score, existing[key]],
            )
            continue
        try:
            terms = price_contract(
                conn=conn,
                package_name=name,
                ecosystem=ecosystem,
                cvss_threshold=_cvss_threshold(max_cvss),
                epss_threshold=None,
                purchase_price=100,
                duration_days=30,
            )
        except ValueError:
            continue

        conn.execute(
            """
            INSERT INTO featured_contracts (
                id, package_name, package_ecosystem,
                cvss_threshold, epss_threshold, purchase_price,
                duration_days, max_payout, opening_probability,
                package_grade, expires_at, news_id, relevancy_score
            ) VALUES (?, ?, ?, ?, NULL, 100, 30, ?, ?, ?, ?, NULL, ?)
            """,
            [
                str(uuid.uuid4()),
                name, ecosystem,
                _cvss_threshold(max_cvss),
                terms.max_payout, terms.opening_probability,
                terms.package_grade,
                date.today() + timedelta(days=30),
                score,
            ],
        )
        inserted += 1

    conn.execute(
        "UPDATE featured_contracts SET status = 'expired' WHERE expires_at < ? AND status IN ('open', 'benched')",
        [date.today()],
    )

    return inserted


class _ContractScore(BaseModel):
    id: str = Field(description="Contract id, copied verbatim from the input list.")
    relevancy_score: float = Field(
        ge=0,
        le=1,
        description=(
            "Landing-page relevancy given current security news. "
            "1.0 = package is the direct subject of an active, widely-covered story. "
            "0.7 = meaningfully implicated in a current story. "
            "0.4 = story exists but is fading or niche. "
            "0.1 = no current news ties this package to a security event."
        ),
    )
    reason: str = Field(description="One sentence citing the news driving the score.")


class _FeaturedRanking(BaseModel):
    scores: list[_ContractScore] = Field(
        description="One entry per input contract. Do not omit or invent ids."
    )


_RANK_SYSTEM_PROMPT = (
    "You rank prediction-market contracts for a security-news landing page. "
    "Each contract bets that a package gets a new CVE above a CVSS/EPSS threshold "
    "before it expires. Use web search to check what is happening in software "
    "supply-chain security RIGHT NOW, then score every contract for how relevant "
    "it is to today's news cycle. Recency dominates: a contract tied to this "
    "week's headline story outranks one from a stale story regardless of severity."
)


async def rerank_featured_contracts(
    conn: duckdb.DuckDBPyConnection,
    limit: int = _FEATURED_LIMIT,
) -> int:
    """Re-score all live featured contracts against current news via GPT + web
    search, then keep the top `limit` open and bench the rest.

    Returns number of contracts re-scored. On API failure, leaves existing
    scores and statuses untouched.
    """
    rows = conn.execute(
        """
        SELECT fc.id, fc.package_name, fc.package_ecosystem,
               fc.cvss_threshold, fc.epss_threshold, fc.expires_at,
               fc.relevancy_score
        FROM featured_contracts fc
        WHERE fc.status IN ('open', 'benched') AND fc.expires_at >= ?
        """,
        [date.today()],
    ).fetchall()
    if not rows:
        return 0

    lines = [
        f"- id={r[0]} package={r[1]} ({r[2]}) cvss_threshold={r[3]} "
        f"epss_threshold={r[4]} expires={r[5]} prior_score={r[6]:.2f}"
        for r in rows
    ]

    openai = get_openai_client()
    try:
        response = await openai.responses.parse(
            model=_RANK_MODEL,
            tools=[{"type": "web_search"}],
            input=[
                {"role": "system", "content": _RANK_SYSTEM_PROMPT},
                {"role": "user", "content": "Score these contracts:\n" + "\n".join(lines)},
            ],
            text_format=_FeaturedRanking,
        )
        ranking = response.output_parsed
        if ranking is None:
            raise ValueError("no parsed ranking in response")
    except Exception as exc:  # network/API failure must not blank the landing page
        print(f"[featured] rerank failed, keeping previous scores: {exc}", flush=True)
        return 0

    valid_ids = {r[0] for r in rows}
    scored = [s for s in ranking.scores if s.id in valid_ids]

    conn.executemany(
        "UPDATE featured_contracts SET relevancy_score = ? WHERE id = ?",
        [(s.relevancy_score, s.id) for s in scored],
    )

    # Top `limit` by fresh score stay open; the rest are benched (eligible to
    # return on the next rerank). Contracts the model skipped keep prior scores.
    ranked_ids = conn.execute(
        """
        SELECT id FROM featured_contracts
        WHERE status IN ('open', 'benched') AND expires_at >= ?
        ORDER BY relevancy_score DESC, opening_probability DESC
        """,
        [date.today()],
    ).fetchall()
    open_ids = [r[0] for r in ranked_ids[:limit]]
    bench_ids = [r[0] for r in ranked_ids[limit:]]
    if open_ids:
        conn.executemany(
            "UPDATE featured_contracts SET status = 'open' WHERE id = ?",
            [(i,) for i in open_ids],
        )
    if bench_ids:
        conn.executemany(
            "UPDATE featured_contracts SET status = 'benched' WHERE id = ?",
            [(i,) for i in bench_ids],
        )

    return len(scored)
