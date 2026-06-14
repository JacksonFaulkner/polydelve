from datetime import date, datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# ── Shared literals ──────────────────────────────────────────────────────────

Ecosystem = Literal["PyPI", "npm", "composer", "other"]
ContractStatus = Literal["open", "won", "sold", "expired", "lost"]
MarketType = Literal["all", "epss_threshold", "new_cve"]
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
    id: str = Field(description="Unique market identifier.")
    title: str = Field(description="Display name of the market.")
    description: str = Field(
        description="Human-readable description of the market event."
    )
    grade: Literal["A", "B", "C", "D", "F"] = Field(
        description="Risk grade of the market. A = low risk, F = high risk."
    )
    price: int = Field(description="Cost in Schmeckles to enter this market.")
    payout: int = Field(description="Schmeckle payout if the market resolves YES.")
    end_date: datetime = Field(
        description="Deadline for market resolution. Must be within 31 days."
    )
    status: Literal["open", "won", "expired"] = Field(
        description="Current market state."
    )

    @field_validator("end_date")
    @classmethod
    def end_date_within_one_month(cls, v: datetime) -> datetime:
        now = datetime.now(timezone.utc)
        end = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        if (end - now) > timedelta(days=31):
            raise ValueError("end_date cannot be more than 1 month from now")
        return v


class Bet(BaseModel):
    id: str = Field(description="Unique bet identifier.")
    user_id: str = Field(description="Auth0 user ID of the bettor.")
    market_id: str = Field(description="Market this bet belongs to.")
    placed_at: datetime = Field(description="Timestamp when the bet was placed.")


class Company(BaseModel):
    id: str = Field(description="Unique company identifier.")
    title: str = Field(description="Company display name.")
    logo: str = Field(description="URL to the company logo image.")
    grade: Literal["A", "B", "C", "D", "F"] = Field(
        description="Security risk grade. A = lowest risk, F = highest."
    )


# ── User ─────────────────────────────────────────────────────────────────────


class User(BaseModel):
    id: str = Field(description="Auth0 user ID (sub claim).")
    email: str | None = Field(
        default=None, description="User email from Auth0 profile."
    )
    username: str | None = Field(
        default=None, description="Display name chosen by the user."
    )
    schmeckles: int = Field(
        default=1000, description="In-game currency balance. New users start with 1000."
    )
    avatar_url: str | None = Field(
        default=None, description="Public URL of user's avatar image."
    )


# ── Contracts ─────────────────────────────────────────────────────────────────


class ContractBase(BaseModel):
    package_name: str = Field(description="Package the contract is written against.")
    ecosystem: Ecosystem = Field(description="Registry the package belongs to.")
    cvss_threshold: float | None = Field(
        default=None,
        ge=0,
        le=10,
        description="CVSS score a new CVE must meet or exceed to trigger a win. Null means CVSS is not a win condition.",
    )
    epss_threshold: float | None = Field(
        default=None,
        ge=0,
        le=1,
        description="EPSS probability a CVE must reach to trigger a win. Null means EPSS is not a win condition.",
    )
    purchase_price: int = Field(
        ge=10,
        description="Schmeckles paid upfront to open the contract.",
    )
    duration_days: ContractDuration = Field(
        default=30, description="Contract lifetime in days. One of 7, 14, or 30."
    )


class QuoteRequest(ContractBase):
    pass


class BuyRequest(ContractBase):
    pass


class SimulateRequest(BaseModel):
    package_name: str = Field(description="Package to simulate a contract for.")
    ecosystem: Ecosystem = Field(description="Registry the package belongs to.")
    cvss_threshold: float | None = Field(
        default=None,
        description="CVSS threshold to test as a win condition. Null to exclude.",
    )
    purchase_price: int = Field(description="Hypothetical Schmeckle cost to simulate.")
    duration_days: ContractDuration = Field(
        default=30, description="Contract duration to simulate: 7, 14, or 30 days."
    )
    epss_drift: float = Field(
        default=1.0,
        ge=0,
        description="Multiplier applied to current EPSS to model future drift. 1.0 = no change.",
    )


class SimCurvePoint(BaseModel):
    label: str = Field(
        description="X-axis label for this point on the payout curve (e.g. day or scenario name)."
    )
    sell_pnl: int = Field(
        description="Profit/loss in Schmeckles if the contract is sold at this point."
    )
    epss_win: int = Field(
        description="Schmeckle payout if the EPSS win condition triggers at this point."
    )
    cvss_win: int = Field(
        description="Schmeckle payout if the CVSS win condition triggers at this point."
    )
    mal_win: int = Field(
        description="Schmeckle payout if the MAL advisory win condition triggers at this point."
    )


class SimulateResponse(BaseModel):
    epss_payout: int = Field(description="Max payout if the EPSS condition wins.")
    cvss_payout: int = Field(description="Max payout if the CVSS condition wins.")
    mal_payout: int = Field(
        description="Max payout if the MAL advisory condition wins."
    )
    epss_win: int = Field(
        description="Estimated Schmeckle profit on an EPSS win (payout minus purchase price)."
    )
    cvss_win: int = Field(description="Estimated Schmeckle profit on a CVSS win.")
    mal_win: int = Field(description="Estimated Schmeckle profit on a MAL win.")
    max_win: int = Field(description="Best-case profit across all win conditions.")
    max_loss: int = Field(
        description="Worst-case loss (negative) if the contract expires without winning."
    )
    y_min: int = Field(description="Chart Y-axis minimum for the payout curve.")
    y_max: int = Field(description="Chart Y-axis maximum for the payout curve.")
    curve: list[SimCurvePoint] = Field(
        description="Series of payout curve points for charting expected value over time."
    )


class QuoteResponse(BaseModel):
    package_name: str = Field(description="Package the quote is for.")
    ecosystem: Ecosystem = Field(description="Registry the package belongs to.")
    market_type: MarketType = Field(
        description="Win condition type inferred from thresholds."
    )
    cvss_threshold: float | None = Field(
        description="CVSS threshold used in this quote. Null if not applicable."
    )
    epss_threshold: float | None = Field(
        description="EPSS threshold used in this quote. Null if not applicable."
    )
    purchase_price: int = Field(description="Schmeckle cost to buy this contract.")
    max_payout: int = Field(description="Maximum Schmeckle payout on a win.")
    opening_probability: float = Field(
        description="Estimated win probability at quote time (0–1)."
    )
    package_grade: float = Field(description="Package risk score at quote time.")
    expires_at: str = Field(description="ISO datetime this quote expires (short TTL).")
    description: str = Field(
        description="Human-readable summary of the contract terms."
    )
    multiplier: float = Field(
        description="Payout multiplier applied based on risk and duration."
    )


class BuyResponse(BaseModel):
    id: str = Field(description="UUID of the newly created contract.")
    max_payout: int = Field(
        description="Maximum Schmeckle payout if the contract wins."
    )
    opening_probability: float = Field(
        description="Win probability at time of purchase (0–1)."
    )
    package_grade: float = Field(description="Package risk score at time of purchase.")
    expires_at: str = Field(description="ISO datetime when the contract expires.")
    multiplier: float = Field(description="Payout multiplier applied at purchase.")
    description: str = Field(
        description="Human-readable summary of the contract terms."
    )


class ContractDetail(BaseModel):
    id: str = Field(description="UUID for this contract.")
    package_name: str = Field(description="Package the contract is written against.")
    ecosystem: Ecosystem = Field(description="Registry the package belongs to.")
    market_type: MarketType = Field(
        description="Win condition type: all, epss_threshold, or new_cve."
    )
    cvss_threshold: float | None = Field(
        description="CVSS threshold for a win. Null if not applicable."
    )
    epss_threshold: float | None = Field(
        description="EPSS threshold for a win. Null if not applicable."
    )
    purchase_price: int = Field(description="Schmeckles paid to open this contract.")
    max_payout: int = Field(
        description="Maximum Schmeckle payout if the contract wins."
    )
    opening_probability: float = Field(
        description="Estimated win probability at time of purchase (0–1)."
    )
    package_grade: float | None = Field(
        description="Package risk grade at time of purchase. Null if unavailable."
    )
    expires_at: str = Field(
        description="ISO datetime when the contract expires if unresolved."
    )
    status: ContractStatus = Field(
        description="Current state: open, won, sold, expired, or lost."
    )
    resolved_at: str | None = Field(
        description="ISO datetime of resolution. Null if still open."
    )
    sell_price: int | None = Field(
        description="Schmeckles received if the contract was sold early. Null otherwise."
    )
    created_at: str = Field(description="ISO datetime when the contract was purchased.")
    current_sell_value: int | None = Field(
        description="Current early-exit sell value in Schmeckles. Null if not open."
    )
    multiplier: float = Field(
        description="Payout multiplier applied at purchase based on risk and duration."
    )


class SellResponse(BaseModel):
    sell_price: int = Field(
        description="Schmeckles credited to the user for selling early."
    )
    status: ContractStatus = Field(
        description="Contract status after the sell, always 'sold'."
    )


# ── Leaderboard ───────────────────────────────────────────────────────────────


class LeaderboardContract(BaseModel):
    id: str = Field(description="Contract UUID.")
    package_name: str = Field(description="Package the contract is written against.")
    package_ecosystem: str = Field(description="Registry the package belongs to.")
    market_type: MarketType = Field(description="Win condition type.")
    purchase_price: int = Field(description="Schmeckles paid to open the contract.")
    max_payout: int = Field(description="Maximum Schmeckle payout on a win.")
    opening_probability: float = Field(
        description="Win probability at purchase time (0–1)."
    )
    status: ContractStatus = Field(description="Current contract state.")
    expires_at: str = Field(description="ISO datetime when the contract expires.")
    created_at: str | None = Field(
        default=None, description="ISO datetime when the contract was purchased."
    )


class LeaderboardUser(BaseModel):
    rank: int = Field(description="User's position on the leaderboard (1 = top).")
    id: str = Field(description="Auth0 user ID.")
    username: str | None = Field(
        default=None, description="Display name. Null if not set."
    )
    schmeckles: int = Field(description="Current Schmeckle balance.")
    total_contracts: int = Field(
        description="Total contracts ever opened by this user."
    )
    open_contracts: int = Field(description="Currently open (unresolved) contracts.")
    won_contracts: int = Field(description="Total contracts resolved as wins.")
    contracts: list[LeaderboardContract] = Field(
        description="Recent contracts for display on the leaderboard."
    )


class LeaderboardResponse(BaseModel):
    total: int = Field(description="Total number of users on the leaderboard.")
    page: int = Field(description="Current page number (1-indexed).")
    page_size: int = Field(description="Number of users per page.")
    users: list[LeaderboardUser] = Field(
        description="Paginated list of leaderboard users."
    )


# ── Schmeckle timeline ────────────────────────────────────────────────────────


class SchmecklePoint(BaseModel):
    date: str = Field(description="ISO date string for the balance snapshot.")
    balance: int = Field(description="Schmeckle balance at this point in time.")
    event: Literal["buy", "won", "sold"] | None = Field(
        default=None, description="Event that caused the balance change, if any."
    )


class SchmeckleTimeline(BaseModel):
    user_id: str = Field(description="Auth0 user ID this timeline belongs to.")
    points: list[SchmecklePoint] = Field(
        description="Chronological list of balance snapshots."
    )


# ── News / enrichment ─────────────────────────────────────────────────────────


class PackageRisk(BaseModel):
    name: str = Field(
        description="Exact package name as published on the registry. For scoped npm packages include the scope e.g. '@antv/g2'. No version numbers, no descriptions, no parenthetical notes."
    )
    ecosystem: Ecosystem = Field(
        description="The package registry. Use 'npm' for JavaScript, 'PyPI' for Python, 'composer' for PHP."
    )
    weekly_downloads: int | None = Field(
        description="Weekly download count at time of news ingestion. Null if unknown."
    )
    cve_ids: list[str] = Field(
        description="CVE IDs mentioned in the article for this package."
    )
    epss_score: float | None = Field(
        description="Latest EPSS score for this package's CVEs at ingestion time. Null if no CVEs."
    )
    has_mal_advisory: bool = Field(
        default=False, description="True if a MAL advisory exists for this package."
    )


class GptAnalysis(BaseModel):
    """Structured LLM extraction from an article body. Used directly as the
    OpenAI structured-output response schema."""

    description: str = Field(
        description="2-sentence factual summary of the security event."
    )
    company_labels: list[str] = Field(
        description="Canonical organisation names only. Use full official names: 'Microsoft', 'Amazon Web Services', 'Google', 'GitHub'. No abbreviations like 'AWS' or 'GCP' standalone. No registry names like 'npm' or 'PyPI' here."
    )
    sector_labels: list[str] = Field(
        description="Short, consistent sector names in title case. Use these standard terms where applicable: 'Software Development', 'Open Source', 'Cloud Computing', 'DevOps / CI-CD', 'Cybersecurity', 'Artificial Intelligence', 'Enterprise Software'. Avoid long descriptive phrases."
    )
    affected_packages: list[PackageRisk] = Field(
        description="Only concrete package names actually mentioned in the article. No namespace wildcards like '@antv/*'. One entry per distinct package."
    )
    threat_actor: str | None = Field(
        description="Named threat group exactly as identified in the article e.g. 'TeamPCP'. Null if unknown or not attributed."
    )
    exploit_status: ExploitStatus | None = Field(
        description="Exploitation status of the vulnerability: poc_available, actively_exploited, patched, or unpatched. Null if not determinable."
    )
    severity: Severity | None = Field(
        description="Severity level: critical, high, medium, or low. Null if not stated."
    )
    relevancy_score: float = Field(
        ge=0,
        le=1,
        description=(
            "How useful this article is to a software supply-chain risk app that "
            "tracks CVEs and exploits in npm/PyPI packages. "
            "0.9-1.0 = specific vulnerability, exploit, or malicious-package incident with named packages or CVEs. "
            "0.6-0.8 = concrete security incident or advisory affecting open-source software, packages inferable. "
            "0.3-0.5 = general supply-chain security reporting with no specific vulnerability. "
            "0.0-0.2 = listicles ('Top 10 ...'), vendor marketing, webinars, conference promos, product announcements."
        ),
    )


class ExaAnalysis(BaseModel):
    """Article metadata as returned by Exa search — no LLM involved."""

    title: str = Field(description="Article headline.")
    description: str = Field(description="Raw article description or lede.")
    source_name: str | None = Field(
        default=None, description="Publisher name, e.g. 'Bleeping Computer'."
    )
    published_date: datetime | None = Field(
        description="Publication timestamp from the source."
    )
    source_url: str = Field(description="Canonical URL of the article.")


class NewsAnalysis(BaseModel):
    """Combined view of an article: Exa source metadata + GPT extraction."""

    exa: ExaAnalysis = Field(description="Source metadata from Exa search.")
    gpt: GptAnalysis = Field(
        description="Structured LLM extraction: packages, sectors, threat actor, severity."
    )


class NewsEmbeddings(BaseModel):
    title: list[float] = Field(
        exclude=True,
        description="Embedding vector for the article title. Excluded from API serialization.",
    )
    description: list[float] = Field(
        exclude=True,
        description="Embedding vector for the article description. Excluded from API serialization.",
    )
    source: list[float] = Field(
        exclude=True,
        description="Embedding vector for the source URL domain. Excluded from API serialization.",
    )


# ── DB row shapes (ingestion / enrichment) ────────────────────────────────────


class EpssHistoryRow(BaseModel):
    name: str = Field(description="Package name as published on the registry.")
    ecosystem: Ecosystem = Field(
        description="Package registry: npm, PyPI, composer, or other."
    )
    epss_score: float = Field(
        description="EPSS probability score (0–1) at time of recording."
    )
    recorded_at: date = Field(
        default_factory=date.today, description="Date the score snapshot was taken."
    )


class MalAdvisoryRow(BaseModel):
    osv_id: str = Field(
        description="OSV advisory ID, e.g. GHSA-xxxx-xxxx-xxxx. Primary key."
    )
    name: str = Field(description="Affected package name.")
    ecosystem: Ecosystem = Field(description="Package registry.")
    published_at: datetime | None = Field(
        description="When the advisory was first published."
    )
    modified_at: datetime | None = Field(
        description="Last modification timestamp from OSV."
    )
    withdrawn: bool = Field(
        default=False, description="True if the advisory was later retracted."
    )
    summary: str | None = Field(
        default=None,
        description="Short human-readable description of the vulnerability.",
    )


class PackageRow(BaseModel):
    name: str = Field(description="Package name as published on the registry.")
    ecosystem: Ecosystem = Field(description="Package registry.")
    github_org: str | None = Field(
        default=None, description="GitHub org or user that owns the repo, if known."
    )
    logo_url: str | None = Field(
        default=None, description="URL to the package or org logo for display."
    )
    weekly_downloads: int | None = Field(
        default=None, description="Weekly download count from the registry API."
    )
    cve_ids: list[str] = Field(
        default_factory=list,
        description="CVE IDs associated with this package via OSV advisories.",
    )
    epss_score: float | None = Field(
        default=None, description="Latest EPSS score across all the package's CVEs."
    )
    has_mal_advisory: bool = Field(
        default=False,
        description="True if any non-withdrawn MAL advisory exists for this package.",
    )
    mal_advisory_published_at: datetime | None = Field(
        default=None, description="Earliest MAL advisory publish date for this package."
    )
    risk_score: float | None = Field(
        default=None,
        description="Composite risk score combining EPSS, downloads, and advisory signals.",
    )
    last_enriched_at: datetime | None = Field(
        default=None,
        description="Timestamp of the most recent enrichment run for this package.",
    )
    sectors: list[str] = Field(
        default_factory=list,
        description="Sector labels assigned via heuristic or LLM classification.",
    )


class RecentNews(BaseModel):
    id: str = Field(description="URL hash used as a stable dedup key.")
    embeddings: NewsEmbeddings = Field(
        description="Vector embeddings for title, description, and source (excluded from serialization)."
    )
    analysis: NewsAnalysis = Field(
        description="Exa source metadata + structured LLM extraction."
    )

    @property
    def summary(self) -> str:
        return self.analysis.gpt.description
