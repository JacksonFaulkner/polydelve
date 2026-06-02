from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator


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


class PackageRisk(BaseModel):
    name: str = Field(description="Exact package name as published on the registry. For scoped npm packages include the scope e.g. '@antv/g2'. No version numbers, no descriptions, no parenthetical notes.")
    ecosystem: Literal["npm", "PyPI", "composer", "other"] = Field(description="The package registry. Use 'npm' for JavaScript, 'PyPI' for Python, 'composer' for PHP.")
    weekly_downloads: int | None
    cve_ids: list[str]
    epss_score: float | None
    has_mal_advisory: bool = False


class NewsAnalysis(BaseModel):
    description: str = Field(description="2-sentence factual summary of the security event.")
    company_labels: list[str] = Field(description="Canonical organisation names only. Use full official names: 'Microsoft', 'Amazon Web Services', 'Google', 'GitHub'. No abbreviations like 'AWS' or 'GCP' standalone. No registry names like 'npm' or 'PyPI' here.")
    sector_labels: list[str] = Field(description="Short, consistent sector names in title case. Use these standard terms where applicable: 'Software Development', 'Open Source', 'Cloud Computing', 'DevOps / CI-CD', 'Cybersecurity', 'Artificial Intelligence', 'Enterprise Software'. Avoid long descriptive phrases.")
    affected_packages: list[PackageRisk] = Field(description="Only concrete package names actually mentioned in the article. No namespace wildcards like '@antv/*'. One entry per distinct package.")
    threat_actor: str | None = Field(description="Named threat group exactly as identified in the article e.g. 'TeamPCP'. Null if unknown or not attributed.")
    exploit_status: Literal["poc_available", "actively_exploited", "patched", "unpatched"] | None
    severity: Literal["critical", "high", "medium", "low"] | None


class NewsEmbeddings(BaseModel):
    title: list[float] = Field(exclude=True)
    description: list[float] = Field(exclude=True)
    source: list[float] = Field(exclude=True)


class RecentNews(BaseModel):
    id: str
    title: str
    description: str          # raw article body (used for embeddings)
    summary: str | None = None  # GPT 2-sentence summary (stored + served to FE)
    source_name: str | None = None  # publication display name e.g. "Bleeping Computer"
    published_date: datetime | None
    source_url: str
    embeddings: NewsEmbeddings
    analysis: NewsAnalysis
