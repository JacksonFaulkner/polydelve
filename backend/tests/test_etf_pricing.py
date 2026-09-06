import sys

sys.path.insert(0, ".")

from features.etf_pricing import EtfMemberTerms, poisson_binomial_at_least, price_basket


def test_poisson_binomial_threshold_zero_is_certain():
    assert poisson_binomial_at_least([0.1, 0.2, 0.3], 0) == 1.0


def test_poisson_binomial_threshold_exceeds_n_is_impossible():
    assert poisson_binomial_at_least([0.1, 0.2], 3) == 0.0


def test_poisson_binomial_identical_independent_trials():
    # P(at least 1 of 2) with p=0.5 each = 1 - 0.5*0.5 = 0.75
    p = poisson_binomial_at_least([0.5, 0.5], 1)
    assert abs(p - 0.75) < 1e-6


def test_poisson_binomial_all_must_win():
    # P(2 of 2) with p=0.5 each = 0.25
    p = poisson_binomial_at_least([0.5, 0.5], 2)
    assert abs(p - 0.25) < 1e-6


def test_price_basket_higher_threshold_lower_probability_higher_payout():
    members = [
        EtfMemberTerms("a", "npm", 0.3, 5.0, None, None, None),
        EtfMemberTerms("b", "npm", 0.3, 5.0, None, None, None),
        EtfMemberTerms("c", "npm", 0.3, 5.0, None, None, None),
    ]
    loose = price_basket(members, threshold_count=1, purchase_price=100, duration_days=30)
    strict = price_basket(members, threshold_count=3, purchase_price=100, duration_days=30)
    assert strict.combined_probability < loose.combined_probability
    assert strict.max_payout > loose.max_payout


def test_price_basket_deep_parlays_keep_differentiating():
    # Nuclear plays: with low per-leg probs, each extra required leg must still
    # raise the payout instead of pinning at a flat cap.
    members = [EtfMemberTerms(f"p{i}", "npm", 0.05, 5.0, None, None, None) for i in range(6)]
    payouts = [
        price_basket(members, threshold_count=k, purchase_price=250, duration_days=7).max_payout
        for k in (3, 4, 5, 6)
    ]
    assert payouts == sorted(payouts)
    assert len(set(payouts)) == len(payouts), f"payouts collapsed: {payouts}"
