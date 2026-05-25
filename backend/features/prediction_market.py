from models.models import GRADE_ODDS


def calculate_payout(grade: str, days: int, price: int) -> int:
    """
    Payout = price / P(attack in N days).

    P is derived geometrically from GRADE_ODDS, which represents the
    31-day base probability. Shorter contracts are rarer events → higher payout.
    Longer contracts approach certainty → payout shrinks toward price / base_prob.
    """
    if not (1 <= days <= 31):
        raise ValueError("days must be between 1 and 31")

    base_prob = GRADE_ODDS[grade]
    prob = 1 - (1 - base_prob) ** (days / 31)

    return round(price / prob)

