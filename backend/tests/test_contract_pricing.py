import sys

sys.path.insert(0, ".")

from features.contract_pricing import (
    compute_cvss_probability,
    compute_epss_probability,
    compute_grade,
    compute_mal_probability,
    compute_payout,
    sell_value_at_day,
)


# ── compute_grade ─────────────────────────────────────────────────────────────

def test_grade_zero_for_clean_package():
    g = compute_grade(num_cves=0, epss_score=None, has_mal_advisory=False, max_cvss=None)
    assert g == 0.0


def test_grade_clamped_max():
    g = compute_grade(num_cves=10_000, epss_score=1.0, has_mal_advisory=True, max_cvss=10.0)
    assert g == 10.0


def test_grade_clamped_min():
    g = compute_grade(num_cves=0, epss_score=0.0, has_mal_advisory=False, max_cvss=0.0)
    assert g == 0.0


def test_grade_mal_advisory_adds_risk():
    without = compute_grade(0, None, False, None)
    with_mal = compute_grade(0, None, True, None)
    assert with_mal > without


def test_grade_in_range():
    for cves in (0, 1, 10, 100):
        for epss in (None, 0.0, 0.5, 1.0):
            g = compute_grade(cves, epss, False, None)
            assert 0.0 <= g <= 10.0


# ── compute_epss_probability ──────────────────────────────────────────────────

def test_epss_prob_none_input():
    p = compute_epss_probability(None)
    assert 0.001 <= p <= 0.75


def test_epss_prob_zero():
    p = compute_epss_probability(0.0)
    assert p == 0.01


def test_epss_prob_no_threshold_max_clamped_at_075():
    # Without threshold: high EPSS should NOT hit 0.95 (keeps payouts attractive)
    p = compute_epss_probability(1.0)
    assert p <= 0.75


def test_epss_prob_monotonic():
    scores = [0.0, 0.1, 0.2, 0.5, 1.0]
    probs = [compute_epss_probability(s) for s in scores]
    assert probs == sorted(probs)


def test_epss_prob_already_above_threshold_near_certain():
    # EPSS 0.5, threshold 0.3 → already above → near-certain win next refresh
    p = compute_epss_probability(0.5, epss_threshold=0.3)
    assert p >= 0.90


def test_epss_prob_far_below_threshold_low():
    # EPSS 0.01, threshold 0.5 → very unlikely to spike 50x
    p = compute_epss_probability(0.01, epss_threshold=0.5)
    assert p < 0.15


def test_epss_prob_threshold_monotonic_with_ratio():
    # As current EPSS approaches threshold, probability should increase
    threshold = 0.5
    probs = [compute_epss_probability(epss, threshold) for epss in [0.05, 0.1, 0.2, 0.4, 0.5, 0.6]]
    assert probs == sorted(probs)


def test_epss_prob_threshold_gives_better_payout_for_high_epss():
    # With threshold, high-EPSS packages can have varied payouts based on gap
    # A package at EPSS=0.8 with threshold=0.9 should have lower prob than threshold=0.5
    p_above = compute_epss_probability(0.8, epss_threshold=0.5)   # already above
    p_below = compute_epss_probability(0.8, epss_threshold=0.9)   # still below
    assert p_above > p_below


# ── compute_cvss_probability ──────────────────────────────────────────────────

def test_cvss_prob_always_in_range():
    for threshold in (0.0, 5.0, 7.0, 9.0, 10.0):
        p = compute_cvss_probability(0, 0, None, threshold)
        assert 0.001 <= p <= 0.95


def test_cvss_prob_high_threshold_lower_than_low():
    p_low = compute_cvss_probability(5, 10, 9.0, 3.0)
    p_high = compute_cvss_probability(5, 10, 9.0, 9.0)
    assert p_high < p_low


def test_cvss_prob_zero_cves_no_crash():
    p = compute_cvss_probability(0, 0, None, 7.0)
    assert p >= 0.001


def test_cvss_prob_absolute_activity_matters():
    # 5 recent CVEs out of 100 total should NOT be rated as safer than
    # 5 recent CVEs out of 5 total — absolute activity still contributes
    p_large_history = compute_cvss_probability(5, 100, 9.0, 7.0)
    p_small_history = compute_cvss_probability(5, 5,   9.0, 7.0)
    # small history is still riskier (higher relative velocity), but gap shouldn't be 4x+
    assert p_small_history / p_large_history < 3.0


def test_cvss_prob_high_absolute_recent_beats_zero():
    # A package with 10 recent CVEs should have meaningfully higher prob than 0 recent
    p_zero = compute_cvss_probability(0, 50, 7.0, 5.0)
    p_ten  = compute_cvss_probability(10, 50, 7.0, 5.0)
    assert p_ten > p_zero * 2


# ── compute_mal_probability ───────────────────────────────────────────────────

def test_mal_prob_already_flagged_is_minimal():
    p = compute_mal_probability(has_mal_advisory=True, exploit_in_news=True)
    assert p == 0.001


def test_mal_prob_exploit_in_news_boosts():
    p_clean = compute_mal_probability(False, False)
    p_news = compute_mal_probability(False, True)
    assert p_news > p_clean


# ── compute_payout ────────────────────────────────────────────────────────────

def test_payout_always_exceeds_price():
    for prob in (0.01, 0.1, 0.5, 0.9):
        for grade in (0.0, 5.0, 10.0):
            payout = compute_payout(100, prob, grade, 30)
            assert payout > 100


def test_payout_higher_grade_higher_payout():
    p_low = compute_payout(100, 0.1, 0.0, 30)
    p_high = compute_payout(100, 0.1, 10.0, 30)
    assert p_high > p_low


def test_payout_shorter_duration_higher_payout():
    p_7 = compute_payout(100, 0.1, 5.0, 7)
    p_30 = compute_payout(100, 0.1, 5.0, 30)
    assert p_7 > p_30


# ── sell_value_at_day ─────────────────────────────────────────────────────────

def test_sell_value_day0_equals_purchase_price():
    v = sell_value_at_day(purchase_price=100, day=0, total_days=30)
    assert v == 100


def test_sell_value_at_expiry_is_zero():
    v = sell_value_at_day(purchase_price=100, day=30, total_days=30)
    assert v == 0


def test_sell_value_never_negative():
    for day in range(31):
        v = sell_value_at_day(100, day, 30)
        assert v >= 0


def test_sell_value_decreases_monotonically():
    values = [sell_value_at_day(100, d, 30) for d in range(31)]
    assert values == sorted(values, reverse=True)


def test_sell_value_drift_boosts_value():
    base = sell_value_at_day(100, 5, 30, epss_drift=1.0, max_payout=500)
    boosted = sell_value_at_day(100, 5, 30, epss_drift=5.0, max_payout=500)
    assert boosted > base
