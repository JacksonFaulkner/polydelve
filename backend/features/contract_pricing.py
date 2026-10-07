"""
Contract pricing: one hazard model, both directions derived from it.

Model
  New qualifying CVEs (cvss >= threshold) arrive as a Poisson process with a
  per-package daily rate λ, estimated from cve_history with a small prior so a
  package with no history still has a non-zero rate:

      λ = w * (k90^d + α) / (90 + β)  +  (1-w) * (k365^d + α) / (365 + β)

  k90/k365 = qualifying CVEs in the last 90/365 days; d < 1 damps disclosure
  bursts. Constants tuned by scripts/backtest_pricing.py.

Probabilities (all duration-aware)
  P_cve(D)  = 1 - exp(-λ D)             new CVE >= threshold within D days
  P_no(D)   = exp(-λ D)                 NO bet: survives D days without one
  P_epss(D) = logit-gap model (below)   EPSS climbs to the target within D
  P_mal(D)  = 1 - exp(-λ_mal D)         OSV MAL advisory within D

Payout — fair odds, no house edge (bits are play money)
  max_payout = stake / P(win), soft-capped so long shots don't explode.
  YES wins if *any* leg fires, so P(win) = P(any leg) and every leg pays the
  same amount. No grade or duration fudge factors: duration is already
  inside every P.

Value of an open contract (dashboard) = mark-to-model
  value(t) = P(win in remaining days) * max_payout
  YES: decays toward 0 as the window closes with nothing happening.
  NO:  climbs toward max_payout as the package keeps surviving.
"""
import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any


@dataclass
class ContractTerms:
    opening_probability: float
    package_grade: float
    max_payout: int
    epss_payout: int
    cvss_payout: int
    mal_payout: int
    description: str


@dataclass
class PackageStats:
    """Everything pricing needs about a package, loaded once per request."""
    epss_score: float | None
    num_cves: int
    has_mal_advisory: bool
    max_cvss: float | None
    exploit_in_news: bool
    # (days_ago, cvss_score) for every CVE published in the last 365 days
    recent_cves: list[tuple[int, float | None]]


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _logit(p: float) -> float:
    """Log-odds of a probability. EPSS moves ~linearly here, so spike size is
    comparable across the whole 0–1 range (multiplicative near 0, capped near 1)."""
    p = _clamp(p, 1e-4, 1.0 - 1e-4)
    return math.log(p / (1.0 - p))


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


# ── tuning ────────────────────────────────────────────────────────────────────

# CVE hazard prior: α pseudo-events over β pseudo-days. A package with zero
# history prices at λ ≈ 0.25/150 ≈ 0.17%/day → ~5% over 30d.
# Burst damping: CVE disclosures cluster (one audit → five CVEs) and then go
# quiet, so raw counts over-predict busy packages; k^HAZARD_BURST_DAMP tempers
# that. Values from scripts/backtest_pricing.py grid search (2024-04 → 2026-08).
HAZARD_PRIOR_EVENTS = 0.25
HAZARD_PRIOR_DAYS = 150.0
HAZARD_BURST_DAMP = 0.7
HAZARD_W90 = 0.45
# CVSS scores missing from OSV are treated as this for threshold comparison.
UNSCORED_CVSS = 5.0

# EPSS spike model tuning (logit units).
# HAZARD_30D = expected upward logit drift over a 30-day contract from a
# weaponization event. SPIKE_SCALE = softness of the prob curve around the gap.
HAZARD_30D = -3.5    # calibrated to ~8–11% actual 2x-spike rate over 30d (backtest)
SPIKE_SCALE = 1.8    # softness of the prob curve; wider = smoother band transitions

# MAL advisory daily hazard: ~1.5% over 30d baseline, ~13% if exploit chatter.
MAL_HAZARD_BASE = 0.0005
MAL_HAZARD_EXPLOIT = 0.004

MAX_MULTIPLIER = 50.0  # ceiling the payout odds asymptote toward — no 100x tails
SOFT_KNEE = 15.0       # below this, odds are 1:1 real; above, compressed toward ceiling

P_MIN = 0.005
P_MAX = 0.995


def _soft_cap(mult: float) -> float:
    """Strictly-increasing cap. Linear up to SOFT_KNEE, then compresses smoothly
    toward MAX_MULTIPLIER so high-grade packages still react to the sliders
    instead of pinning flat at a hard ceiling."""
    if mult <= SOFT_KNEE:
        return mult
    span = MAX_MULTIPLIER - SOFT_KNEE
    return SOFT_KNEE + span * (1.0 - math.exp(-(mult - SOFT_KNEE) / span))


# ── grade (display only) ──────────────────────────────────────────────────────

def compute_grade(
    num_cves: int,
    epss_score: float | None,
    has_mal_advisory: bool,
    max_cvss: float | None,
) -> float:
    """Composite 0–10 danger score. Shown in the UI; no longer affects payout."""
    epss = epss_score or 0.0
    cvss = max_cvss or 0.0
    grade = (
        math.log10(num_cves + 1) * 2.5
        + epss * 3.0
        + (1.5 if has_mal_advisory else 0.0)
        + (cvss / 10.0) * 2.0
    )
    return round(_clamp(grade, 0.0, 10.0), 2)


# ── hazards + probabilities ───────────────────────────────────────────────────

def cve_hazard(recent_cves: Sequence[tuple[int, float | None]], cvss_threshold: float) -> float:
    """Daily rate of new CVEs with cvss >= threshold, from the last 365 days."""
    k90 = k365 = 0
    for days_ago, cvss in recent_cves:
        score = UNSCORED_CVSS if cvss is None else cvss
        if score < cvss_threshold:
            continue
        if days_ago <= 365:
            k365 += 1
        if days_ago <= 90:
            k90 += 1
    rate90 = (k90 ** HAZARD_BURST_DAMP + HAZARD_PRIOR_EVENTS) / (90.0 + HAZARD_PRIOR_DAYS)
    rate365 = (k365 ** HAZARD_BURST_DAMP + HAZARD_PRIOR_EVENTS) / (365.0 + HAZARD_PRIOR_DAYS)
    return HAZARD_W90 * rate90 + (1.0 - HAZARD_W90) * rate365


def hazard_to_probability(rate: float, duration_days: float) -> float:
    """P(at least one event in `duration_days`) for a Poisson rate."""
    return _clamp(1.0 - math.exp(-rate * max(duration_days, 0.0)), 0.0, 1.0)


def compute_cvss_probability(
    recent_cves: Sequence[tuple[int, float | None]],
    cvss_threshold: float,
    duration_days: float,
) -> float:
    """P(new CVE >= threshold published within duration_days)."""
    return round(hazard_to_probability(cve_hazard(recent_cves, cvss_threshold), duration_days), 4)


def compute_epss_probability(
    epss_score: float | None,
    epss_threshold: float | None = None,
    duration_days: float = 30,
) -> float:
    """P(EPSS reaches an absolute target band during the contract).

    Works in logit (log-odds) space. The win condition is "EPSS climbs to the
    target", and the distance to climb is measured as a logit gap. This makes
    spike size comparable everywhere:
      - Near 0 (0–0.01): the whole band has a similar large gap to a high
        target, so odds stay sane and roughly flat instead of blowing up to 60x+.
      - Near the ceiling (0.8→0.9): the gap is tiny, so prob is high and the
        payout is small — a near-certain small move is not rewarded.
    """
    epss = _clamp(epss_score or 0.0, 0.0, 1.0)
    if epss_threshold is None or epss_threshold <= 0:
        return 0.0
    if duration_days <= 0:
        return 0.0
    target = _clamp(epss_threshold, 1e-4, 0.999)
    if epss >= target:
        return 0.92  # already above — wins at next EPSS refresh
    gap = _logit(target) - _logit(epss)  # >0, logit distance still to climb
    # Expected upward drift over the contract (negative logit units — the
    # typical package does NOT spike). Shorter window → further from spiking,
    # so the drift term grows more negative as duration shrinks.
    hazard = HAZARD_30D * (30.0 / duration_days) ** 0.5
    p = _sigmoid((hazard - gap) / SPIKE_SCALE)
    return round(_clamp(p, 0.0, 0.92), 4)


def compute_mal_probability(
    has_mal_advisory: bool,
    exploit_in_news: bool,
    duration_days: float = 30,
) -> float:
    """P(OSV MAL-* advisory published within duration_days)."""
    if has_mal_advisory:
        return 0.0  # already flagged, contract can't trigger
    rate = MAL_HAZARD_BASE + (MAL_HAZARD_EXPLOIT if exploit_in_news else 0.0)
    return round(hazard_to_probability(rate, duration_days), 4)


def compute_payout(purchase_price: int, probability: float) -> int:
    """Fair-odds payout: stake / P(win), soft-capped. No edge, no fudge."""
    p = _clamp(probability, P_MIN, P_MAX)
    mult = _soft_cap(1.0 / p)
    return max(int(purchase_price * mult), purchase_price + 1)


# ── pure pricing over loaded stats ────────────────────────────────────────────

@dataclass
class Leg:
    """One win condition: P(win) as a function of remaining days, and what it pays."""
    kind: str  # "epss" | "cvss" | "mal"
    prob_at: Any  # Callable[[float], float]
    payout: int


def build_legs(
    stats: PackageStats,
    cvss_threshold: float | None,
    epss_threshold: float | None,
    purchase_price: int,
    duration_days: int,
    direction: str,
) -> list[Leg]:
    thr = cvss_threshold or 7.0
    if direction == "no":
        # NO bets are CVSS-only: "no new qualifying CVE before expiry".
        # P(win over remaining R days | survived so far) = exp(-λR).
        rate = cve_hazard(stats.recent_cves, thr)

        def prob(rem: float) -> float:
            return 1.0 - hazard_to_probability(rate, rem)

        return [Leg("cvss", prob, compute_payout(purchase_price, prob(duration_days)))]

    # YES: one stake, one payout, paid by whichever leg fires first. Priced as
    # a single fair bet on P(any leg fires) — pricing each leg separately would
    # hand out three fair bets for one stake.
    legs: list[Leg] = []
    if epss_threshold is not None and epss_threshold > 0:
        e = stats.epss_score
        legs.append(Leg("epss", lambda rem: compute_epss_probability(e, epss_threshold, rem), 0))
    rate = cve_hazard(stats.recent_cves, thr)
    legs.append(Leg("cvss", lambda rem: hazard_to_probability(rate, rem), 0))
    mal_flag, exploit = stats.has_mal_advisory, stats.exploit_in_news
    legs.append(Leg("mal", lambda rem: compute_mal_probability(mal_flag, exploit, rem), 0))
    payout = compute_payout(purchase_price, any_leg_probability(legs, duration_days))
    for leg in legs:
        leg.payout = payout
    return legs


def any_leg_probability(legs: list[Leg], remaining_days: float) -> float:
    """P(at least one leg fires in the remaining window), clamped for pricing."""
    miss = 1.0
    for leg in legs:
        miss *= 1.0 - leg.prob_at(remaining_days)
    return round(_clamp(1.0 - miss, P_MIN, P_MAX), 4)


def contract_value(legs: list[Leg], max_payout: int, remaining_days: float) -> int:
    """Mark-to-model value of an open contract with `remaining_days` left and
    no leg fired yet: P(any leg fires in the window) * payout. At 0 days a
    YES leg's probability is 0 (value 0) and a NO leg's is 1 (full payout)."""
    rem = max(remaining_days, 0.0)
    miss = 1.0
    for leg in legs:
        miss *= 1.0 - leg.prob_at(rem)
    return int(_clamp(round((1.0 - miss) * max_payout), 0, max_payout))


def price_from_stats(
    stats: PackageStats,
    cvss_threshold: float | None,
    epss_threshold: float | None,
    purchase_price: int,
    duration_days: int = 30,
    direction: str = "yes",
) -> tuple[ContractTerms, list[Leg]]:
    grade = compute_grade(stats.num_cves, stats.epss_score, stats.has_mal_advisory, stats.max_cvss)
    legs = build_legs(stats, cvss_threshold, epss_threshold, purchase_price, duration_days, direction)
    by_kind = {leg.kind: leg for leg in legs}
    thr = cvss_threshold or 7.0

    if direction == "no":
        leg = by_kind["cvss"]
        p = round(_clamp(leg.prob_at(duration_days), P_MIN, P_MAX), 4)
        terms = ContractTerms(
            opening_probability=p,
            package_grade=grade,
            max_payout=leg.payout,
            epss_payout=0,
            cvss_payout=leg.payout,
            mal_payout=0,
            description=f"NO new CVE ≥ {thr:g} CVSS in {duration_days}d ({stats.num_cves} CVEs on record, grade {grade}/10)",
        )
        return terms, legs

    parts = [f"EPSS {round((stats.epss_score or 0) * 100, 1)}%", f"{stats.num_cves} CVEs", f"grade {grade}/10"]
    if stats.has_mal_advisory:
        parts.append("OSV MAL advisory")
    if stats.exploit_in_news:
        parts.append("active exploit in news")

    epss_payout = by_kind["epss"].payout if "epss" in by_kind else 0
    terms = ContractTerms(
        opening_probability=any_leg_probability(legs, duration_days),
        package_grade=grade,
        max_payout=max(leg.payout for leg in legs),
        epss_payout=epss_payout,
        cvss_payout=by_kind["cvss"].payout,
        mal_payout=by_kind["mal"].payout,
        description=", ".join(parts),
    )
    return terms, legs


# ── DB-backed entry points ────────────────────────────────────────────────────

def load_package_stats(conn: Any, package_name: str, ecosystem: str) -> PackageStats:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT p.epss_score,
               (SELECT COUNT(*) FROM cve_history ch WHERE ch.name = p.name AND ch.ecosystem = p.ecosystem),
               p.has_mal_advisory,
               (SELECT MAX(cvss_score) FROM cve_history ch WHERE ch.name = p.name AND ch.ecosystem = p.ecosystem)
        FROM packages p WHERE p.name = %s AND p.ecosystem = %s
        """,
        [package_name, ecosystem],
    )
    pkg = cur.fetchone()
    if not pkg:
        raise ValueError(f"Package {package_name}/{ecosystem} not found")
    epss_score, num_cves, has_mal_advisory, max_cvss = pkg

    cur.execute(
        """
        SELECT (CURRENT_DATE - published_date::date), cvss_score
        FROM cve_history
        WHERE name = %s AND ecosystem = %s
          AND published_date >= now() - INTERVAL '365 days'
        """,
        [package_name, ecosystem],
    )
    recent = [(int(d), float(c) if c is not None else None) for d, c in cur.fetchall()]

    cur.execute(
        """
        SELECT bool_or(n.exploit_status = 'actively_exploited')
        FROM news n JOIN news_packages np ON np.news_id = n.id
        WHERE np.name = %s AND np.ecosystem = %s
          AND n.published_date >= now() - INTERVAL '30 days'
        """,
        [package_name, ecosystem],
    )
    news_row = cur.fetchone()
    exploit_in_news = bool(news_row[0]) if news_row else False

    return PackageStats(
        epss_score=epss_score,
        num_cves=num_cves or 0,
        has_mal_advisory=bool(has_mal_advisory),
        max_cvss=max_cvss,
        exploit_in_news=exploit_in_news,
        recent_cves=recent,
    )


def price_contract(
    conn: Any,
    package_name: str,
    ecosystem: str,
    cvss_threshold: float | None,
    epss_threshold: float | None,
    purchase_price: int,
    duration_days: int = 30,
    direction: str = "yes",
) -> ContractTerms:
    stats = load_package_stats(conn, package_name, ecosystem)
    terms, _ = price_from_stats(stats, cvss_threshold, epss_threshold, purchase_price, duration_days, direction)
    return terms


def price_contract_with_legs(
    conn: Any,
    package_name: str,
    ecosystem: str,
    cvss_threshold: float | None,
    epss_threshold: float | None,
    purchase_price: int,
    duration_days: int = 30,
    direction: str = "yes",
) -> tuple[ContractTerms, list[Leg]]:
    stats = load_package_stats(conn, package_name, ecosystem)
    return price_from_stats(stats, cvss_threshold, epss_threshold, purchase_price, duration_days, direction)


def current_value(
    conn: Any,
    package_name: str,
    ecosystem: str,
    cvss_threshold: float | None,
    epss_threshold: float | None,
    purchase_price: int,
    max_payout: int,
    created_at: date,
    expires_at: date,
    direction: str = "yes",
    today: date | None = None,
) -> int:
    """Mark-to-model value of an open contract today, using live package stats
    over the remaining window and the contract's original payout."""
    today = today or date.today()
    total_days = max((expires_at - created_at).days, 1)
    remaining = _clamp((expires_at - today).days, 0, total_days)
    stats = load_package_stats(conn, package_name, ecosystem)
    _, legs = price_from_stats(stats, cvss_threshold, epss_threshold, purchase_price, total_days, direction)
    return contract_value(legs, max_payout, remaining)
