"""ETF (basket) contract pricing: combine N per-package win probabilities into
a single "at least X of N" payout, reusing the single-contract grade/duration
multiplier model from contract_pricing.py."""
import math
from dataclasses import dataclass
from datetime import date

from features.contract_pricing import _clamp, current_sell_value

# Baskets can be genuine long shots (e.g. 4-of-6 legs) with raw fair odds in
# the 1e3–1e8 range, so exponential soft-capping saturates instantly and every
# deep parlay pins at the same ceiling. Compress the tail logarithmically
# instead: each extra order of magnitude of odds adds a fixed multiplier bump,
# up to a hard ceiling.
ETF_MAX_MULTIPLIER = 1000.0
ETF_SOFT_KNEE = 15.0
ETF_LOG_SCALE = 60.0   # multiplier gained per e-fold of raw odds above the knee
PROB_FLOOR = 1e-9


def _basket_soft_cap(mult: float) -> float:
    """Strictly-increasing cap: linear up to the knee, then logarithmic growth
    so long-shot slips keep differentiating, clamped at ETF_MAX_MULTIPLIER."""
    if mult <= ETF_SOFT_KNEE:
        return mult
    compressed = ETF_SOFT_KNEE + ETF_LOG_SCALE * math.log1p((mult - ETF_SOFT_KNEE) / ETF_SOFT_KNEE)
    return min(compressed, ETF_MAX_MULTIPLIER)


@dataclass
class EtfMemberTerms:
    package_name: str
    ecosystem: str
    opening_probability: float
    grade: float
    epss_threshold: float | None
    cvss_threshold: float | None
    opening_epss: float | None


@dataclass
class EtfTerms:
    combined_probability: float
    avg_grade: float
    max_payout: int


def poisson_binomial_at_least(probabilities: list[float], threshold: int) -> float:
    """P(at least `threshold` successes) for independent Bernoulli trials with
    the given success probabilities. Standard O(N^2) DP over the PMF."""
    n = len(probabilities)
    if threshold <= 0:
        return 1.0
    if threshold > n:
        return 0.0
    pmf = [1.0] + [0.0] * n
    for p in probabilities:
        for k in range(n, 0, -1):
            pmf[k] = pmf[k] * (1 - p) + pmf[k - 1] * p
        pmf[0] *= (1 - p)
    return _clamp(sum(pmf[threshold:]), PROB_FLOOR, 0.9999)


def price_basket(members: list[EtfMemberTerms], threshold_count: int, purchase_price: int, duration_days: int = 30) -> EtfTerms:
    probs = [m.opening_probability for m in members]
    combined = poisson_binomial_at_least(probs, threshold_count)
    avg_grade = sum(m.grade for m in members) / len(members)

    fair_odds = 1.0 / combined
    grade_mult = 1.0 + (avg_grade / 10.0) * 4.0
    duration_mult = (30 / max(duration_days, 1)) ** 0.5
    mult = _basket_soft_cap(fair_odds * grade_mult * duration_mult)
    max_payout = max(int(purchase_price * mult), purchase_price + 1)

    return EtfTerms(combined_probability=combined, avg_grade=round(avg_grade, 2), max_payout=max_payout)


def current_basket_sell_value(
    purchase_price: int,
    created_at: date,
    expires_at: date,
    members: list[tuple[float | None, float | None]],  # (opening_epss, current_epss) per member
) -> int:
    """Average each member's individual sell value under the same time-decay
    curve used for single contracts, using the basket's own opening EPSS drift."""
    if not members:
        return current_sell_value(purchase_price, created_at, expires_at)
    values = [
        current_sell_value(purchase_price, created_at, expires_at, opening_epss=o, current_epss=c)
        for o, c in members
    ]
    return round(sum(values) / len(values))
