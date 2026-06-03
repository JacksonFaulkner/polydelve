from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# ── Shared literals ──────────────────────────────────────────────────────────

Ecosystem = Literal["PyPI", "npm", "composer", "other"]
ContractStatus = Literal["open", "won", "sold", "expired"]
MarketType = Literal["all"]
ContractDuration = Literal[7, 14, 30]
ExploitStatus = Literal["poc_available", "actively_exploited", "patched", "unpatched"]
Severity = Literal["critical", "high", "medium", "low"]

DURATION_OPTIONS: list[int] = [7, 14, 30]

# ── Legacy market models (companies / old market system) ─────────────────────

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
        if (end - now).days > 31:
            raise ValueError("end_date cannot be more than 1 month from now")
        return v


class Bet(BaseModel):
    id: str
    user_id: str
    market_id: str
    placed_at: datetime


class Company(BaseModel):
    id: str
    title: str
    logo: str
    grade: Literal["A", "B", "C", "D", "F"]


# ── User ─────────────────────────────────────────────────────────────────────

class User(BaseModel):
    id: str
    email: str | None = None
    username: str | None = None
    schmeckles: int = 1000


# ── Contracts ─────────────────────────────────────────────────────────────────

class ContractBase(BaseModel):
    package_name: str
    ecosystem: Ecosystem
    cvss_threshold: float | None = None
    epss_threshold: float | None = None
    purchase_price: int
    duration_days: ContractDuration = 30


class QuoteRequest(ContractBase):
    pass


class BuyRequest(ContractBase):
    user_id: str


class SimulateRequest(BaseModel):
    package_name: str
    ecosystem: Ecosystem
    cvss_threshold: float | None = None
    purchase_price: int
    duration_days: ContractDuration = 30
    epss_drift: float = 1.0


class SimCurvePoint(BaseModel):
    label: str
    sell_pnl: int
    epss_win: int
    cvss_win: int
    mal_win: int


class SimulateResponse(BaseModel):
    epss_payout: int
    cvss_payout: int
    mal_payout: int
    epss_win: int
    cvss_win: int
    mal_win: int
    max_win: int
    max_loss: int
    y_min: int
    y_max: int
    curve: list[SimCurvePoint]


class QuoteResponse(BaseModel):
    package_name: str
    ecosystem: Ecosystem
    market_type: MarketType
    cvss_threshold: float | None
    epss_threshold: float | None
    purchase_price: int
    max_payout: int
    opening_probability: float
    package_grade: float
    expires_at: str
    description: str
    multiplier: float


class BuyResponse(BaseModel):
    id: str
    max_payout: int
    opening_probability: float
    package_grade: float
    expires_at: str
    multiplier: float
    description: str


class ContractDetail(BaseModel):
    id: str
    package_name: str
    ecosystem: Ecosystem
    market_type: MarketType
    cvss_threshold: float | None
    epss_threshold: float | None
    purchase_price: int
    max_payout: int
    opening_probability: float
    package_grade: float | None
    expires_at: str
    status: ContractStatus
    resolved_at: str | None
    sell_price: int | None
    created_at: str
    current_sell_value: int | None
    multiplier: float


class SellResponse(BaseModel):
    sell_price: int
    status: ContractStatus


# ── Leaderboard ───────────────────────────────────────────────────────────────

class LeaderboardContract(BaseModel):
    id: str
    package_name: str
    package_ecosystem: str
    market_type: MarketType
    purchase_price: int
    max_payout: int
    opening_probability: float
    status: ContractStatus
    expires_at: str
    created_at: str | None = None


class LeaderboardUser(BaseModel):
    rank: int
    id: str
    username: str | None = None
    schmeckles: int
    total_contracts: int
    open_contracts: int
    won_contracts: int
    contracts: list[LeaderboardContract]


class LeaderboardResponse(BaseModel):
    total: int
    page: int
    page_size: int
    users: list[LeaderboardUser]


# ── Schmeckle timeline ────────────────────────────────────────────────────────

class SchmecklePoint(BaseModel):
    date: str
    balance: int
    event: Literal["buy", "won", "sold"] | None = None


class SchmeckleTimeline(BaseModel):
    user_id: str
    points: list[SchmecklePoint]


# ── News / enrichment ─────────────────────────────────────────────────────────

class PackageRisk(BaseModel):
    name: str = Field(description="Exact package name as published on the registry. For scoped npm packages include the scope e.g. '@antv/g2'. No version numbers, no descriptions, no parenthetical notes.")
    ecosystem: Ecosystem = Field(description="The package registry. Use 'npm' for JavaScript, 'PyPI' for Python, 'composer' for PHP.")
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
    exploit_status: ExploitStatus | None
    severity: Severity | None


class NewsEmbeddings(BaseModel):
    title: list[float] = Field(exclude=True)
    description: list[float] = Field(exclude=True)
    source: list[float] = Field(exclude=True)


class RecentNews(BaseModel):
    id: str
    title: str
    description: str
    summary: str | None = None
    source_name: str | None = None
    published_date: datetime | None
    source_url: str
    embeddings: NewsEmbeddings
    analysis: NewsAnalysis
