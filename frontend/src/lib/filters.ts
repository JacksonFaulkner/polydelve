import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs"

/**
 * URL-backed filter state (nuqs). Keys are short because they live in the
 * address bar; every page that uses a table declares its own map here so
 * links are shareable and the back button restores filters.
 */

export const SEVERITIES = ["critical", "high", "medium", "low"] as const
export type Severity = (typeof SEVERITIES)[number]
export const SEVERITY_OPTIONS = SEVERITIES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))

export const ECOSYSTEM_OPTIONS = [
  { value: "npm", label: "npm" },
  { value: "PyPI", label: "PyPI" },
] as const

export const CVE_WINDOW_OPTIONS = [
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last year" },
]

export const EPSS_MIN_OPTIONS = [
  { value: 0.01, label: "≥ 1%" },
  { value: 0.1, label: "≥ 10%" },
  { value: 0.5, label: "≥ 50%" },
  { value: 0.9, label: "≥ 90%" },
]

export const DOWNLOADS_MIN_OPTIONS = [
  { value: 10_000, label: "≥ 10k / wk" },
  { value: 100_000, label: "≥ 100k / wk" },
  { value: 1_000_000, label: "≥ 1M / wk" },
  { value: 10_000_000, label: "≥ 10M / wk" },
]

export const PACKAGE_SORTS = ["risk_score", "weekly_downloads", "epss_score", "num_cves"] as const
export type PackageSort = (typeof PACKAGE_SORTS)[number]

// Page resets to 1 whenever any other key changes (handled in the page).
export const packageFilterParsers = {
  q: parseAsString.withDefault(""),
  cve: parseAsInteger, // latest CVE within N days
  sev: parseAsStringLiteral(SEVERITIES),
  epss: parseAsString, // min EPSS as decimal string, e.g. "0.1"
  mal: parseAsBoolean,
  dl: parseAsInteger, // min weekly downloads
  sort: parseAsStringLiteral(PACKAGE_SORTS).withDefault("risk_score"),
  page: parseAsInteger.withDefault(1),
}

export const EVENT_TYPES = ["cvss", "epss", "mal"] as const
export type EventType = (typeof EVENT_TYPES)[number]
export const EVENT_TYPE_OPTIONS = [
  { value: "cvss", label: "CVSS event" },
  { value: "epss", label: "EPSS spike" },
  { value: "mal", label: "MAL advisory" },
] as const

export const eventFilterParsers = {
  window: parseAsStringLiteral(["dense", "shallow"] as const).withDefault("dense"),
  type: parseAsArrayOf(parseAsStringLiteral(EVENT_TYPES)).withDefault([]),
  eco: parseAsStringLiteral(["npm", "PyPI"] as const),
  q: parseAsString.withDefault(""),
  sev: parseAsStringLiteral(SEVERITIES),
  page: parseAsInteger.withDefault(1),
}
