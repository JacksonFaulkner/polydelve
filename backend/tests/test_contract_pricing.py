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
    assert 0.001 <= p <= 0.95


def test_epss_prob_zero():
    p = compute_epss_probability(0.0)
    assert p == 0.01


def test_epss_prob_max_clamped():
    p = compute_epss_probability(1.0)
    assert p == 0.95


def test_epss_prob_monotonic():
    scores = [0.0, 0.1, 0.2, 0.5, 1.0]
    probs = [compute_epss_probability(s) for s in scores]
    assert probs == sorted(probs)


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
