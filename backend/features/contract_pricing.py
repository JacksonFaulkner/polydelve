"""
Contract pricing: grade + probability + payout for package prediction markets.

Grade (0–10):
  Composite danger score per package. Drives payout multiplier.
  grade = clamp(log10(num_cves+1)*2.5 + epss*3 + max_cvss/10*2, 0, 10)

Probability (weighted signal blend):
  p = 0.55*epss + 0.35*cve_velocity + 0.10*news_signal

Payout:
  max_payout = purchase_price * (1 / probability) * (1 + grade/10 * 4)
  grade 10 = 5x fair odds, grade 0 = 1x fair odds

Current value (for sell):
  value(t) = max_payout * current_p * (days_remaining / total_days)
"""
import math
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


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _logit(p: float) -> float:
    """Log-odds of a probability. EPSS moves ~linearly here, so spike size is
    comparable across the whole 0–1 range (multiplicative near 0, capped near 1)."""
    p = _clamp(p, 1e-4, 1.0 - 1e-4)
    return math.log(p / (1.0 - p))


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


# EPSS spike model tuning (logit units).
# HAZARD_30D = expected upward logit drift over a 30-day contract from a
# weaponization event. SPIKE_SCALE = softness of the prob curve around the gap.
HAZARD_30D = -3.5    # calibrated to ~8–11% actual 2x-spike rate over 30d (backtest)
SPIKE_SCALE = 1.8    # softness of the prob curve; wider = smoother band transitions
MAX_MULTIPLIER = 50.0  # ceiling the payout odds asymptote toward — no 100x tails
SOFT_KNEE = 15.0       # below this, odds are 1:1 real; above, compressed toward ceiling


def _soft_cap(mult: float) -> float:
    """Strictly-increasing cap. Linear up to SOFT_KNEE, then compresses smoothly
    toward MAX_MULTIPLIER so high-grade packages still react to the sliders
    instead of pinning flat at a hard ceiling."""
    if mult <= SOFT_KNEE:
        return mult
    span = MAX_MULTIPLIER - SOFT_KNEE
    return SOFT_KNEE + span * (1.0 - math.exp(-(mult - SOFT_KNEE) / span))


def compute_grade(
    num_cves: int,
    epss_score: float | None,
    has_mal_advisory: bool,
    max_cvss: float | None,
) -> float:
    epss = epss_score or 0.0
    cvss = max_cvss or 0.0
    grade = (
        math.log10(num_cves + 1) * 2.5
        + epss * 3.0
        + (1.5 if has_mal_advisory else 0.0)
        + (cvss / 10.0) * 2.0
    )
    return round(_clamp(grade, 0.0, 10.0), 2)


def compute_epss_probability(
    epss_score: float | None,
    epss_threshold: float | None = None,
    duration_days: int = 30,
) -> float:
    """P(EPSS reaches an absolute target band during the contract).

    Works in logit (log-odds) space. The win condition is "EPSS climbs to the
    target", and the distance to climb is measured as a logit gap. This makes
    spike size comparable everywhere:
      - Near 0 (0–0.01): the whole band has a similar large gap to a high
        target, so odds stay sane and roughly flat instead of blowing up to 60x+.
      - Near the ceiling (0.8→0.9): the gap is tiny, so prob is high and the
        payout is small — a near-certain small move is not rewarded.

    If no threshold set: fall back to current EPSS as a rough exploitation proxy.
    """
    epss = _clamp(epss_score or 0.0, 0.0, 1.0)
    if epss_threshold is not None and epss_threshold > 0:
        target = _clamp(epss_threshold, 1e-4, 0.999)
        if epss >= target:
            return 0.92  # already above — wins at next EPSS refresh
        gap = _logit(target) - _logit(epss)  # >0, logit distance still to climb
        # Expected upward drift over the contract; shorter window → less drift.
        hazard = HAZARD_30D * (max(duration_days, 1) / 30.0) ** 0.5
        p = _sigmoid((hazard - gap) / SPIKE_SCALE)
        return round(_clamp(p, 0.01, 0.92), 4)
    # No threshold: use raw EPSS as rough exploitation probability, capped at 0.75
    # (avoids making high-EPSS contracts worthless — 0.75 still gives ~1.3x fair odds)
    return round(_clamp(epss * 1.5 + 0.01, 0.001, 0.75), 4)


def compute_cvss_probability(
    num_recent_cves: int,
    total_cves: int,
    max_cvss: float | None,
    cvss_threshold: float,
) -> float:
    """P(new CVE >= threshold published): driven by CVE velocity and historical severity.

    Velocity blends absolute recent activity and historical rate:
      - absolute: log-scaled recent CVE count (5 recent CVEs always matters regardless of total)
      - relative: recent/total fraction (high churn packages are riskier)
    """
    # Absolute: log-scale recent CVEs so 1→0.30, 3→0.48, 5→0.57, 10→0.67
    abs_velocity = math.log10(num_recent_cves + 1) / math.log10(11)  # normalised 0→1 at 10 CVEs
    # Relative: recent as fraction of total — catches packages with high churn rate
    rel_velocity = _clamp(num_recent_cves / max(total_cves, 1), 0.0, 1.0)
    velocity = 0.6 * abs_velocity + 0.4 * rel_velocity
    historical = (max_cvss or 0.0) / 10.0
    p = 0.55 * velocity + 0.15 * historical + 0.02
    penalty = (cvss_threshold / 10.0) ** 1.5
    p = p * (1.0 - penalty * 0.7)
    return round(_clamp(p, 0.001, 0.95), 4)



def compute_mal_probability(has_mal_advisory: bool, exploit_in_news: bool) -> float:
    """P(OSV MAL-* advisory published): supply chain compromise signal."""
    if has_mal_advisory:
        return 0.001  # already flagged, contract can't trigger
    p = 0.02 + (0.18 if exploit_in_news else 0.0)
    return round(_clamp(p, 0.001, 0.95), 4)


def compute_probability(
    epss_score: float | None,
    num_recent_cves: int,
    total_cves: int,
    recent_news_count: int,
    exploit_in_news: bool,
    cvss_threshold: float | None = None,
) -> float:
    epss = epss_score or 0.0
    cve_velocity = min(num_recent_cves / max(total_cves, 1), 1.0)
    news_base = min(recent_news_count / 10.0, 1.0) * 0.15
    news_boost = 0.10 if exploit_in_news else 0.0
    news_signal = min(news_base + news_boost, 0.25)

    p = 0.55 * epss + 0.35 * cve_velocity + 0.10 * news_signal

    # Higher CVSS threshold = less likely to hit = lower probability = bigger payout
    if cvss_threshold is not None:
        threshold_penalty = (cvss_threshold / 10.0) ** 1.5
        p = p * (1.0 - threshold_penalty * 0.6)

    return round(_clamp(p, 0.001, 0.99), 4)


def compute_payout(purchase_price: int, probability: float, grade: float, duration_days: int = 30) -> int:
    fair_odds = 1.0 / probability
    grade_mult = 1.0 + (grade / 10.0) * 4.0  # 1x–5x
    duration_mult = math.sqrt(30 / max(duration_days, 1))  # 7d→2.07x  14d→1.46x  30d→1.0x
    mult = _soft_cap(fair_odds * grade_mult * duration_mult)
    return max(int(purchase_price * mult), purchase_price + 1)


def sell_value_at_day(
    purchase_price: int,
    day: int,
    total_days: int,
    epss_drift: float = 1.0,
    max_payout: int | None = None,
) -> int:
    """Sell value at day N of a contract. Pure integer arithmetic, no date logic.

    EPSS drift boosts mid-market value, not just the expiry floor:
      drift 1x  → sell at cost, decays to 0 at expiry
      drift 8x  → sell at min(max_payout, cost*8) at day 0, decays to floor at expiry
      drift 10x → sell at min(max_payout, cost*10) at day 0, decays to 85% floor at expiry
    """
    days_remaining = max(total_days - day, 0)
    drift = _clamp(epss_drift, 0.1, 10.0)
    exponent = min(0.3 + max(0.0, total_days / 7 - 1) * 0.55, 3.0)
    time_factor = (days_remaining / total_days) ** exponent if total_days > 0 else 0.0
    floor_frac = 0.0 if drift <= 1.0 else min(0.85, 0.85 * math.log10(drift))
    floor_value = round(purchase_price * floor_frac)

    # Drift maps log-linearly to max_payout, matching slider labels:
    #   2x (CVSS3) → 30% of max_payout   4x (CVSS5) → 60%   10x (CVSS9.99) → 100%
    if drift > 1.0 and max_payout:
        drift_frac = math.log10(drift)  # 2x→0.301, 4x→0.602, 10x→1.0
        boosted = round(purchase_price + (max_payout - purchase_price) * drift_frac)
    else:
        # drift <= 1 means EPSS fell (package safer) — scale value down by drift.
        # An EPSS-rise bet must lose value when EPSS drops, never hold at baseline.
        boosted = round(purchase_price * drift)

    value = floor_value + (boosted - floor_value) * time_factor
    return max(round(value), 0)


def current_sell_value(
    purchase_price: int,
    created_at: date,
    expires_at: date,
    opening_epss: float | None = None,
    current_epss: float | None = None,
) -> int:
    """
    Sell value = base_time_decay × epss_drift_factor.

    Time decay:
      7d  → exponent 0.30 (slow, value retained — 7d contracts are fun)
      14d → exponent 0.85
      30d → exponent 2.10 (fast early drop — punishes early exit on long contracts)

    EPSS drift:
      drift = current_epss / opening_epss, clamped [0.1, 4.0].
      A PoC drops → EPSS 10x → sell value up to 4× base decay.
      Package goes quiet → EPSS halves → sell value at 0.5× base decay.
    """
    total_days = max((expires_at - created_at).days, 1)
    days_remaining = max((expires_at - date.today()).days, 0)

    # Exponent capped at 3.0 to prevent runaway on durations > 30d
    exponent = min(0.3 + max(0.0, total_days / 7 - 1) * 0.55, 3.0)
    time_factor = (days_remaining / total_days) ** exponent

    # Drift: use raw ratio, but cap at 10x regardless of EPSS ceiling.
    # High-EPSS packages (0.8+) are physically bounded — can't drift much.
    # Frontend slider bypasses this by passing drift directly; backend reflects reality.
    if opening_epss and opening_epss > 0 and current_epss is not None:
        drift = _clamp(current_epss / opening_epss, 0.1, 10.0)
    else:
        drift = 1.0

    # Log-scaled floor maps EPSS drift to CVSS payout tiers:
    #   2x → CVSS 3 (~26% recovery)   4x → CVSS 5 (~51%)   10x → CVSS 9.99 (~85%)
    floor = 0.0 if drift <= 1.0 else min(0.85, 0.85 * math.log10(drift))
    value = floor + (1.0 - floor) * time_factor
    # drift < 1 means EPSS fell (package safer) — scale value down so an
    # EPSS-rise bet loses value, never holds at the baseline time decay.
    if drift < 1.0:
        value *= drift
    # Use round() not int() to avoid rounding small prices to 0
    return max(round(purchase_price * value), 0)


def price_contract(
    conn: Any,
    package_name: str,
    ecosystem: str,
    cvss_threshold: float | None,
    epss_threshold: float | None,
    purchase_price: int,
    duration_days: int = 30,
) -> ContractTerms:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT p.epss_score,
               (SELECT COUNT(*) FROM cve_history ch WHERE ch.name = p.name AND ch.ecosystem = p.ecosystem),
               p.has_mal_advisory
        FROM packages p WHERE p.name = %s AND p.ecosystem = %s
        """,
        [package_name, ecosystem],
    )
    pkg = cur.fetchone()
    if not pkg:
        raise ValueError(f"Package {package_name}/{ecosystem} not found")

    epss_score, num_cves, has_mal_advisory = pkg
    num_cves = num_cves or 0

    cur.execute(
        "SELECT MAX(cvss_score) FROM cve_history WHERE name = %s AND ecosystem = %s",
        [package_name, ecosystem],
    )
    max_cvss_row = cur.fetchone()
    max_cvss = max_cvss_row[0] if max_cvss_row else None

    cur.execute(
        """
        SELECT COUNT(*) FROM cve_history
        WHERE name = %s AND ecosystem = %s
          AND published_date >= now() - INTERVAL '90 days'
        """,
        [package_name, ecosystem],
    )
    recent_cves_row = cur.fetchone()
    recent_cves = recent_cves_row[0] if recent_cves_row else 0

    cur.execute(
        """
        SELECT COUNT(*),
               bool_or(n.exploit_status = 'actively_exploited')
        FROM news n JOIN news_packages np ON np.news_id = n.id
        WHERE np.name = %s AND np.ecosystem = %s
          AND n.published_date >= now() - INTERVAL '30 days'
        """,
        [package_name, ecosystem],
    )
    news_row = cur.fetchone()
    exploit_in_news = bool(news_row[1]) if news_row else False

    grade = compute_grade(num_cves, epss_score, bool(has_mal_advisory), max_cvss)

    epss_prob = compute_epss_probability(epss_score, epss_threshold, duration_days)
    cvss_prob = compute_cvss_probability(recent_cves, max(num_cves, 1), max_cvss, cvss_threshold or 7.0)
    mal_prob  = compute_mal_probability(bool(has_mal_advisory), exploit_in_news)

    epss_payout = compute_payout(purchase_price, epss_prob, grade, duration_days)
    cvss_payout = compute_payout(purchase_price, cvss_prob, grade, duration_days)
    mal_payout  = compute_payout(purchase_price, mal_prob,  grade, duration_days)

    # Blended opening probability (any event triggers)
    prob = round(_clamp(1.0 - (1.0 - epss_prob) * (1.0 - cvss_prob) * (1.0 - mal_prob), 0.001, 0.99), 4)

    parts = [f"EPSS {round((epss_score or 0)*100, 1)}%", f"{num_cves} CVEs", f"grade {grade}/10"]
    if has_mal_advisory:
        parts.append("OSV MAL advisory")
    if exploit_in_news:
        parts.append("active exploit in news")

    return ContractTerms(
        opening_probability=prob,
        package_grade=grade,
        max_payout=max(epss_payout, cvss_payout, mal_payout),
        epss_payout=epss_payout,
        cvss_payout=cvss_payout,
        mal_payout=mal_payout,
        description=", ".join(parts),
    )