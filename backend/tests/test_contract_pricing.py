

from features.contract_pricing import (
    MAX_MULTIPLIER,
    P_MIN,
    PackageStats,
    any_leg_probability,
    build_legs,
    compute_cvss_probability,
    compute_epss_probability,
    compute_grade,
    compute_mal_probability,
    compute_payout,
    contract_value,
    cve_hazard,
    price_from_stats,
)


def _stats(recent: tuple | list = (), epss=0.05, num_cves=5, mal=False, max_cvss=7.5, exploit=False) -> PackageStats:
    return PackageStats(
        epss_score=epss, num_cves=num_cves, has_mal_advisory=mal,
        max_cvss=max_cvss, exploit_in_news=exploit, recent_cves=list(recent),
    )


# ── compute_grade (display only) ──────────────────────────────────────────────

def test_grade_zero_for_clean_package():
    assert compute_grade(0, None, False, None) == 0.0


def test_grade_capped_at_ten():
    assert compute_grade(10_000, 1.0, True, 10.0) == 10.0


def test_grade_monotone_in_cves_and_epss():
    prev = -1.0
    for cves, epss in [(0, 0.0), (1, 0.1), (5, 0.3), (50, 0.9)]:
        g = compute_grade(cves, epss, False, None)
        assert g > prev
        prev = g


# ── cve_hazard ────────────────────────────────────────────────────────────────

def test_hazard_nonzero_with_no_history():
    assert cve_hazard([], 7.0) > 0


def test_hazard_rises_with_qualifying_cves():
    quiet = cve_hazard([], 7.0)
    busy = cve_hazard([(10, 9.0), (40, 8.0), (80, 7.5)], 7.0)
    assert busy > quiet


def test_hazard_ignores_cves_below_threshold():
    low = cve_hazard([(10, 3.0), (20, 4.0)], 7.0)
    assert low == cve_hazard([], 7.0)


def test_hazard_recent_cves_weigh_more_than_old():
    recent = cve_hazard([(10, 9.0)], 7.0)
    old = cve_hazard([(300, 9.0)], 7.0)
    assert recent > old


def test_hazard_higher_threshold_never_higher_rate():
    hist = [(5, 9.8), (30, 7.2), (60, 5.5), (200, 8.0)]
    rates = [cve_hazard(hist, t) for t in (3.0, 5.0, 7.0, 9.0)]
    assert rates == sorted(rates, reverse=True)


# ── compute_cvss_probability ──────────────────────────────────────────────────

def test_cvss_probability_increases_with_duration():
    hist = [(10, 9.0), (50, 8.0)]
    p7 = compute_cvss_probability(hist, 7.0, 7)
    p14 = compute_cvss_probability(hist, 7.0, 14)
    p30 = compute_cvss_probability(hist, 7.0, 30)
    assert p7 < p14 < p30


def test_cvss_probability_bounded():
    for hist in ([], [(1, 10.0)] * 200):
        p = compute_cvss_probability(hist, 5.0, 30)
        assert 0.0 < p <= 1.0


# ── compute_epss_probability ──────────────────────────────────────────────────

def test_epss_probability_zero_without_target():
    assert compute_epss_probability(0.5, None, 30) == 0.0


def test_epss_probability_already_above_target():
    assert compute_epss_probability(0.5, 0.3, 30) == 0.92


def test_epss_probability_harder_targets_less_likely():
    p2 = compute_epss_probability(0.05, 0.10, 30)
    p5 = compute_epss_probability(0.05, 0.25, 30)
    p10 = compute_epss_probability(0.05, 0.50, 30)
    assert p2 > p5 > p10


def test_epss_probability_shorter_window_less_likely():
    p7 = compute_epss_probability(0.05, 0.25, 7)
    p30 = compute_epss_probability(0.05, 0.25, 30)
    assert p7 < p30


# ── compute_mal_probability ───────────────────────────────────────────────────

def test_mal_probability_zero_when_already_flagged():
    assert compute_mal_probability(True, True, 30) == 0.0


def test_mal_probability_exploit_news_and_duration_raise_it():
    base = compute_mal_probability(False, False, 30)
    news = compute_mal_probability(False, True, 30)
    short = compute_mal_probability(False, False, 7)
    assert news > base > short


# ── compute_payout ────────────────────────────────────────────────────────────

def test_payout_is_fair_odds_below_knee():
    assert compute_payout(100, 0.5) == 200
    assert compute_payout(100, 0.1) == 1000


def test_payout_always_beats_stake():
    assert compute_payout(100, 0.999) == 101


def test_payout_monotone_and_capped():
    payouts = [compute_payout(100, p) for p in (0.5, 0.1, 0.02, 0.01, P_MIN)]
    assert payouts == sorted(payouts)
    assert payouts[-1] <= 100 * MAX_MULTIPLIER


# ── direction symmetry ────────────────────────────────────────────────────────

def test_no_payout_rises_with_duration_yes_payout_falls():
    stats = _stats(recent=[(10, 9.0), (40, 8.0)])
    yes = [price_from_stats(stats, 7.0, None, 100, d, "yes")[0].cvss_payout for d in (7, 14, 30)]
    no = [price_from_stats(stats, 7.0, None, 100, d, "no")[0].cvss_payout for d in (7, 14, 30)]
    assert yes == sorted(yes, reverse=True), "YES: longer window = easier = pays less"
    assert no == sorted(no), "NO: longer window = more exposure = pays more"


def test_yes_and_no_probabilities_sum_to_one():
    stats = _stats(recent=[(10, 9.0)])
    for d in (7, 14, 30):
        yes_legs = {leg.kind: leg for leg in build_legs(stats, 7.0, None, 100, d, "yes")}
        p_yes = yes_legs["cvss"].prob_at(d)
        p_no = build_legs(stats, 7.0, None, 100, d, "no")[0].prob_at(d)
        assert abs(p_yes + p_no - 1.0) < 1e-9


def test_no_bet_ignores_epss_and_mal():
    stats = _stats(recent=[(10, 9.0)], epss=0.9, mal=False, exploit=True)
    terms, legs = price_from_stats(stats, 7.0, 0.95, 100, 30, "no")
    assert len(legs) == 1 and legs[0].kind == "cvss"
    assert terms.epss_payout == 0 and terms.mal_payout == 0
    assert terms.max_payout == terms.cvss_payout


def test_risky_package_no_bet_pays_more_than_quiet_one():
    quiet = price_from_stats(_stats(recent=[]), 7.0, None, 100, 30, "no")[0]
    busy = price_from_stats(_stats(recent=[(5, 9.0), (20, 9.0), (50, 8.0)]), 7.0, None, 100, 30, "no")[0]
    assert busy.max_payout > quiet.max_payout
    assert busy.opening_probability < quiet.opening_probability


# ── yes blending ──────────────────────────────────────────────────────────────

def test_yes_opening_probability_is_any_leg():
    stats = _stats(recent=[(10, 9.0)], epss=0.05)
    terms, legs = price_from_stats(stats, 7.0, 0.25, 100, 30, "yes")
    assert terms.opening_probability == any_leg_probability(legs, 30)
    assert terms.opening_probability >= max(leg.prob_at(30) for leg in legs) - 1e-4
    # one stake, one payout: every leg pays the same, priced off P(any)
    assert terms.epss_payout == terms.cvss_payout == terms.mal_payout == terms.max_payout
    assert terms.max_payout == compute_payout(100, terms.opening_probability)


def test_yes_is_fair_at_purchase():
    stats = _stats(recent=[(10, 9.0)], epss=0.05)
    terms, legs = price_from_stats(stats, 7.0, 0.25, 100, 30, "yes")
    # mark-to-model at day 0 == stake (within rounding) — no free value
    assert abs(contract_value(legs, terms.max_payout, 30) - 100) <= 2


# ── contract_value / simulate_curve ───────────────────────────────────────────

def test_yes_value_decays_to_zero():
    stats = _stats(recent=[(10, 9.0)], epss=0.05)
    terms, legs = price_from_stats(stats, 7.0, 0.25, 100, 30, "yes")
    values = [contract_value(legs, terms.max_payout, r) for r in range(30, -1, -1)]
    assert values == sorted(values, reverse=True)
    assert values[-1] == 0
    assert values[0] <= terms.max_payout


def test_no_value_climbs_to_full_payout():
    stats = _stats(recent=[(10, 9.0)])
    terms, legs = price_from_stats(stats, 7.0, None, 100, 30, "no")
    values = [contract_value(legs, terms.max_payout, r) for r in range(30, -1, -1)]
    assert values == sorted(values)
    assert values[-1] == terms.max_payout
    assert values[0] < terms.max_payout
