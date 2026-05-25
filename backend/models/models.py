from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, field_validator


# Grade A = best security posture (lowest attack probability, worst odds)
# Grade F = worst security posture (highest attack probability, best odds)
class SupplyChainGrade(str):
    pass


GRADE_ODDS: dict[str, float] = {
    "A": 0.05,
    "B": 0.15,
    "C": 0.35,
    "D": 0.60,
    "F": 0.85,
}

EVENT = Literal["Github Actions", "Source Code Leaked", "Employee Phishing"]


class Market(BaseModel):
    id: str
    title: str
    description: str
    grade: Literal["A", "B", "C", "D", "F"]
    price: int
    payout: int
    end_date: datetime
    status: Literal["open", "won", "expired"]

    @field_validator("end_date")
    @classmethod
    def end_date_within_one_month(cls, v: datetime) -> datetime:
        now = datetime.now(timezone.utc)
        end = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        delta = end - now
        if delta.days > 31:
            raise ValueError("end_date cannot be more than 1 month from now")
        return v


class Bet(BaseModel):
    id: str
    user_id: str
    market_id: str
    placed_at: datetime


class User(BaseModel):
    id: str
    username: str
    schmeckles: int


class Company(BaseModel):
    id: str
    title: str
    logo: str
    # TODO: replace single grade with a richer scoring model (dependency surface,
    # industry, patch cadence, etc.) when odds generation gets more sophisticated
    grade: Literal["A", "B", "C", "D", "F"]
