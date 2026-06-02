import sys
import pytest

sys.path.insert(0, ".")

from features.prediction_market import calculate_payout
from models.models import GRADE_ODDS

PRICE = 100
GRADES = ["A", "B", "C", "D", "F"]
DAYS = [1, 5, 10, 15, 21, 25, 31]


def _build_table() -> str:
    col = 8
    header = f"{'Grade':<6}" + "".join(f"day {d:>2}".rjust(col) for d in DAYS)
    divider = "-" * len(header)
    rows = []
    for grade in GRADES:
        payouts = [calculate_payout(grade, d, PRICE) for d in DAYS]
        row = f"{grade:<6}" + "".join(str(p).rjust(col) for p in payouts)
        rows.append(row)
    return "\n".join([header, divider] + rows)


def _build_summary() -> str:
    lines = []
    for grade in GRADES:
        d1 = calculate_payout(grade, 1, PRICE)
        d31 = calculate_payout(grade, 31, PRICE)
        target = round(GRADE_ODDS[grade] * 100, 1)
        lines.append(
            f"  {grade}  day1={d1:>6}  day31={d31:>5}  "
            f"(target prob at 31d: {target}%)"
        )
    return "\n".join(lines)


def test_payout_table(capsys):
    with capsys.disabled():
        print(f"\n{'='*60}")
        print(f"  SUPPLY CHAIN ATTACK ODDS  (price = {PRICE} schmeckles)")
        print("  short contract = rare event = high payout")
        print(f"{'='*60}")
        print(_build_table())
        print()
        print("  day1 (bold call) → day31 (near-certain, low payout):")
        print(_build_summary())
        print(f"{'='*60}\n")


def test_day31_implied_prob_matches_grade():
    for grade in GRADES:
        payout = calculate_payout(grade, 31, PRICE)
        implied = PRICE / payout
        assert abs(implied - GRADE_ODDS[grade]) < 0.01, (
            f"Grade {grade}: implied prob {implied:.3f} too far from target {GRADE_ODDS[grade]}"
        )


def test_payout_decreases_with_duration():
    for grade in GRADES:
        payouts = [calculate_payout(grade, d, PRICE) for d in DAYS]
        assert payouts == sorted(payouts, reverse=True), (
            f"Grade {grade}: payout should decrease monotonically with duration"
        )


def test_grade_ordering():
    for day in DAYS:
        payouts = [calculate_payout(grade, day, PRICE) for grade in GRADES]
        assert payouts == sorted(payouts, reverse=True), (
            f"Day {day}: Grade A should always pay more than F"
        )


def test_invalid_days():
    with pytest.raises(ValueError):
        calculate_payout("A", 0, PRICE)
    with pytest.raises(ValueError):
        calculate_payout("A", 32, PRICE)