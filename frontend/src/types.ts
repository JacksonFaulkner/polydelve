export type Grade = "A" | "B" | "C" | "D" | "F"

export interface MarketPackage {
  name: string
  ecosystem: string
  weekly_downloads: number | null
  epss_score: number | null
  has_mal_advisory: boolean
  logo_url: string | null
}

export interface ProbPoint {
  date: string
  prob: number
}

export interface ContractParams {
  cvss_threshold: number | null
  epss_threshold: number | null
  duration_days: number
  purchase_price: number
}

export interface Market {
  id: string
  title: string
  description: string
  grade: Grade
  max_payout: number
  opening_probability: number
  status: "open" | "won" | "expired"
  bet_count: number
  package: MarketPackage
  contract: ContractParams
  probability_history: ProbPoint[]
}

export interface MarketEvent {
  date: string
  label: string
  note: string
  delta: number
}

export interface SpotlightMarket extends Market {
  events: MarketEvent[]
}

export interface AffectedPackage {
  name: string
  ecosystem: "PyPI" | "npm"
}

export interface NewsItem {
  id: string
  title: string
  summary: string | null
  url: string
  source_name: string | null
  published_at: string
  sector_labels: string[]
  company_labels: string[]
  threat_actor: string | null
  exploit_status: "poc_available" | "actively_exploited" | "patched" | "unpatched" | null
  severity: "critical" | "high" | "medium" | "low" | null
  affected_packages: AffectedPackage[]
}

export interface NewsResponse {
  total: number
  page: number
  page_size: number
  items: NewsItem[]
}

export interface BalancePoint {
  date: string
  balance: number
}

export interface User {
  id: string
  username: string
  schmeckles: number
  schmeckle_history: BalancePoint[]
  avatar_url: string | null
}

export interface CveRecord {
  osv_id: string
  cve_id: string | null
  published_date: string | null
  severity: "critical" | "high" | "medium" | "low" | null
  cvss_vector: string | null
  cvss_score: number | null
}

export interface EpssPoint {
  date: string
  epss: number
}

export interface PackageDetail {
  name: string
  ecosystem: string
  weekly_downloads: number | null
  epss_score: number | null
  risk_score: number | null
  has_mal_advisory: boolean
  sectors: string[]
  logo_url: string | null
  cve_ids: string[]
  last_enriched_at: string | null
  max_cvss_score: number | null
  cve_history: CveRecord[]
  epss_history: EpssPoint[]
  recent_news: {
    id: string
    title: string
    published_date: string | null
    source_name: string | null
    url: string
    summary: string | null
    exploit_status: string | null
    severity: string | null
  }[]
}

export interface Package {
  name: string
  ecosystem: "PyPI" | "npm"
  weekly_downloads: number | null
  epss_score: number | null
  risk_score: number | null
  has_mal_advisory: boolean
  num_cves: number
  latest_cve_date: string | null
  worst_severity: "critical" | "high" | "medium" | "low" | null
  max_cvss_score: number | null
  sectors: string[]
  logo_url: string | null
  news_mentions: number
}

export interface PackageListResponse {
  total: number
  page: number
  page_size: number
  packages: Package[]
}

export interface LeaderboardContract {
  id: string
  package_name: string
  package_ecosystem: string
  market_type: string
  purchase_price: number
  max_payout: number
  opening_probability: number
  status: "open" | "won" | "lost" | "sold"
  expires_at: string
  created_at: string | null
}

export interface LeaderboardUser {
  rank: number
  id: string
  username: string | null
  schmeckles: number
  total_contracts: number
  open_contracts: number
  won_contracts: number
  contracts: LeaderboardContract[]
}

export interface LeaderboardResponse {
  total: number
  page: number
  page_size: number
  users: LeaderboardUser[]
}

export interface SchmecklePoint {
  date: string
  balance: number
  event: "buy" | "won" | "sold" | null
}

export interface SchmeckleTimeline {
  user_id: string
  points: SchmecklePoint[]
}
