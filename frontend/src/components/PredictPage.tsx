import { useState, useEffect, useCallback, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts"
import { Layers, Search } from "lucide-react"
import type { Package, PackageDetail } from "@/types"
import { useApi } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { SignupPrompt } from "./SignupPrompt"
import EpssChart from "./EpssChart"

function buildEpssChartData(detail: PackageDetail, sinceDate?: string) {
  if (!detail.epss_history || detail.epss_history.length < 2) return null
  const epssStart = sinceDate && sinceDate > detail.epss_history[0].date
    ? sinceDate
    : detail.epss_history[0].date
  const epssEnd = detail.epss_history[detail.epss_history.length - 1].date
  const chartData = detail.epss_history
    .filter((pt) => pt.date >= epssStart)
    .map((pt) => ({
      date: pt.date, epss: pt.epss,
      cvss: null as number | null, severity: null as string | null, cve_id: null as string | null,
    }))
  const scatterData = detail.cve_history
    .filter((c) => c.published_date && c.cvss_score != null)
    .map((c) => ({ date: c.published_date!.slice(0, 10), epss: 0, cvss: c.cvss_score, severity: c.severity, cve_id: c.cve_id }))
    .filter((c) => c.date >= epssStart && c.date <= epssEnd)
  return { chartData, scatterData }
}

const DURATION_OPTIONS = [7, 14, 30]
const STAKE_CHIPS = [25, 100, 250, 500]
const MAX_LEGS = 10
const DEFAULT_CVSS = 5.5 // midpoint of the 1–10 slider
const NO_BET_ELIGIBILITY_DAYS = 100 // must match backend NO_BET_ELIGIBILITY_DAYS

const EPSS_MIN = 0.001
const EPSS_MAX = 1.0
const posToEpss = (pos: number) => EPSS_MIN * Math.pow(EPSS_MAX / EPSS_MIN, pos)
const epssToPos = (v: number) => Math.log(v / EPSS_MIN) / Math.log(EPSS_MAX / EPSS_MIN)
// default the EPSS slider to the midpoint between "where the package sits today" and the top of the track
const defaultEpssPos = (epssScore: number | null | undefined) => {
  const minPos = Math.max(0, Math.min(1, epssToPos(Math.max(epssScore ?? EPSS_MIN, EPSS_MIN))))
  return minPos + (1 - minPos) / 2
}

interface Leg {
  pkg: Package
  cvssThreshold: number
  epssSliderPos: number // only used when it's the sole leg
}

const SLIP_STORAGE_KEY = "polydelve.slip.v1"

type StoredSlip = {
  legs: Leg[]
  thresholdCount: number
  price: number
  duration: number
  direction: "yes" | "no"
}

function loadStoredSlip(): StoredSlip | null {
  try {
    const raw = sessionStorage.getItem(SLIP_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredSlip) : null
  } catch {
    return null
  }
}

interface SimCurvePoint {
  label: string
  sell_pnl: number
  epss_win: number
  cvss_win: number
  mal_win: number
}

interface SimResult {
  epss_win: number
  cvss_win: number
  mal_win: number
  max_win: number
  max_loss: number
  y_min: number
  y_max: number
  curve: SimCurvePoint[]
}

function EcoBadge({ ecosystem }: { ecosystem: string }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
      ecosystem === "npm" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"
    }`}>
      {ecosystem}
    </span>
  )
}

export function PredictPage({ onBuy }: { onBuy?: () => void }) {
  const { authFetch } = useApi()
  const { isAuthenticated } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [showSignup, setShowSignup] = useState(false)
  const [packages, setPackages] = useState<Package[]>([])
  const [search, setSearch] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const storedSlipRef = useRef(loadStoredSlip())
  const [legs, setLegs] = useState<Leg[]>(() => storedSlipRef.current?.legs ?? [])
  const [expandedLeg, setExpandedLeg] = useState<string | null>(null)
  const [thresholdCount, setThresholdCount] = useState(() => storedSlipRef.current?.thresholdCount ?? 1)
  const [price, setPrice] = useState(() => storedSlipRef.current?.price ?? 100)
  const [duration, setDuration] = useState(() => storedSlipRef.current?.duration ?? 30)
  const [buying, setBuying] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [bits, setBits] = useState<number | null>(null)
  const [sim, setSim] = useState<SimResult | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)
  const [chartTab, setChartTab] = useState<"returns" | "risk">("returns")
  const [riskDetails, setRiskDetails] = useState<Record<string, PackageDetail>>({})
  const [direction, setDirection] = useState<"yes" | "no">(() => storedSlipRef.current?.direction ?? "yes")
  const [noPackages, setNoPackages] = useState<Package[] | null>(null)

  useEffect(() => {
    try {
      if (legs.length === 0) {
        sessionStorage.removeItem(SLIP_STORAGE_KEY)
      } else {
        const stored: StoredSlip = { legs, thresholdCount, price, duration, direction }
        sessionStorage.setItem(SLIP_STORAGE_KEY, JSON.stringify(stored))
      }
    } catch {
      // sessionStorage unavailable — slip just won't survive a tab switch
    }
  }, [legs, thresholdCount, price, duration, direction])

  const isBasket = legs.length > 1
  const solo = legs.length === 1 ? legs[0] : null
  const soloEpss = solo?.pkg.epss_score ?? 0.01
  const soloMinPos = solo ? Math.max(0, Math.min(1, epssToPos(Math.max(soloEpss, EPSS_MIN)))) : 0
  const soloTarget = solo ? posToEpss(solo.epssSliderPos) : 0
  const soloDrift = solo ? soloTarget / Math.max(soloEpss, 0.001) : 1

  useEffect(() => {
    authFetch(`/packages?sort=weekly_downloads&page_size=500&has_cves=true`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => setPackages(d.packages ?? []))
      .catch((e) => console.error("packages fetch failed:", e))
  }, [])

  // NO bets ("this package won't get another vulnerability") only make sense
  // on packages that have actually had one recently — fetch that narrower
  // list lazily, the first time the user switches to NO.
  useEffect(() => {
    if (direction !== "no" || noPackages !== null) return
    authFetch(`/packages?sort=weekly_downloads&page_size=500&has_cves=true&latest_cve_days=${NO_BET_ELIGIBILITY_DAYS}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => setNoPackages(d.packages ?? []))
      .catch((e) => console.error("no-bet packages fetch failed:", e))
  }, [direction, noPackages, authFetch])

  // NO bets are single-package only — a basket forces YES.
  useEffect(() => {
    if (isBasket) setDirection("yes")
  }, [isBasket])

  // Always land back on "Simulated returns" when the bet direction changes,
  // so it's never possible to be stuck looking at Risk history with no
  // indication returns are one click away.
  useEffect(() => {
    setChartTab("returns")
  }, [direction])

  // A leg added under YES may not be NO-eligible (needs a CVE in the last
  // 100 days) — once the eligible list loads, drop it rather than let a
  // stale/failing quote linger silently.
  useEffect(() => {
    if (direction !== "no" || noPackages === null || legs.length === 0) return
    const eligible = new Set(noPackages.map((p) => `${p.ecosystem}:${p.name}`))
    if (!legs.every((l) => eligible.has(`${l.pkg.ecosystem}:${l.pkg.name}`))) {
      setLegs([])
    }
  }, [direction, noPackages, legs])

  const refreshUser = useCallback(() => {
    authFetch(`/users/me`)
      .then((r) => r.json())
      .then((d) => setBits(d.bits))
      .catch(() => {})
  }, [authFetch])

  useEffect(() => { refreshUser() }, [refreshUser])

  // Simulate: 1 leg → single-contract endpoint (EPSS scenario supported),
  // 2+ legs → basket endpoint with threshold_count
  useEffect(() => {
    if (legs.length === 0) { setSim(null); setSimError(null); return }
    const t = setTimeout(async () => {
      setSimLoading(true)
      try {
        const res = isBasket
          ? await authFetch(`/etf/simulate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(basketBody()),
            })
          : await authFetch(`/contracts/simulate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                package_name: legs[0].pkg.name,
                ecosystem: legs[0].pkg.ecosystem,
                cvss_threshold: legs[0].cvssThreshold,
                purchase_price: price,
                duration_days: duration,
                epss_drift: soloDrift,
                direction,
              }),
            })
        if (res.ok) {
          setSim(await res.json())
          setSimError(null)
        } else {
          setSim(null)
          const err = await res.json().catch(() => ({}))
          setSimError(err.detail ?? "Could not price this bet.")
        }
      } finally {
        setSimLoading(false)
      }
    }, 150)
    return () => clearTimeout(t)
  }, [legs, thresholdCount, price, duration, soloDrift, isBasket, direction, authFetch])

  useEffect(() => {
    if (chartTab !== "risk") return
    const missing = legs.filter((l) => !riskDetails[legKey(l.pkg)])
    if (missing.length === 0) return
    missing.forEach((l) => {
      const key = legKey(l.pkg)
      authFetch(`/packages/${l.pkg.ecosystem}/${encodeURIComponent(l.pkg.name)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: PackageDetail | null) => {
          if (d) setRiskDetails((prev) => ({ ...prev, [key]: d }))
        })
        .catch(() => {})
    })
  }, [chartTab, legs, riskDetails, authFetch])

  function legKey(p: Package) { return `${p.ecosystem}:${p.name}` }

  function basketBody() {
    return {
      members: legs.map((l) => ({
        package_name: l.pkg.name,
        ecosystem: l.pkg.ecosystem,
        cvss_threshold: l.cvssThreshold,
        epss_threshold: posToEpss(l.epssSliderPos),
      })),
      threshold_count: Math.min(thresholdCount, legs.length),
      purchase_price: price,
      duration_days: duration,
    }
  }

  function chipClass(active: boolean) {
    return `rounded border px-1.5 py-1 text-[10px] font-medium transition-colors ${
      active ? "border-[#FDE832] bg-[#FDE832]/10 text-zinc-100" : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
    }`
  }

  function addLeg(p: Package) {
    if (legs.length >= MAX_LEGS) return
    if (direction === "no" && legs.length >= 1) return // NO bets are single-package only
    if (legs.some((l) => legKey(l.pkg) === legKey(p))) return
    setLegs((prev) => [...prev, { pkg: p, cvssThreshold: DEFAULT_CVSS, epssSliderPos: defaultEpssPos(p.epss_score) }])
    setSearch("")
    setExpandedLeg(legKey(p))
  }

  function removeLeg(key: string) {
    setLegs((prev) => prev.filter((l) => legKey(l.pkg) !== key))
    if (expandedLeg === key) setExpandedLeg(null)
  }

  function updateLeg(key: string, patch: Partial<Leg>) {
    setLegs((prev) => prev.map((l) => (legKey(l.pkg) === key ? { ...l, ...patch } : l)))
  }

  async function handleManifest(file: File) {
    setParsing(true)
    try {
      const content = await file.text()
      const res = await authFetch(`/etf/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Could not parse manifest: ${err.detail ?? res.status}`)
        return
      }
      const data = await res.json()
      const existing = new Set(legs.map((l) => legKey(l.pkg)))
      const additions: Leg[] = []
      for (const m of data.matched ?? []) {
        const key = `${m.ecosystem}:${m.name}`
        if (existing.has(key) || legs.length + additions.length >= MAX_LEGS) continue
        additions.push({
          pkg: m as Package,
          cvssThreshold: DEFAULT_CVSS,
          epssSliderPos: defaultEpssPos(m.epss_score),
        })
        existing.add(key)
      }
      setLegs((prev) => [...prev, ...additions])
      if ((data.unmatched ?? []).length > 0 && additions.length === 0)
        alert("No tracked packages matched this manifest.")
    } finally {
      setParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function buySlip() {
    if (legs.length === 0 || simError) return
    if (!isAuthenticated) { setShowSignup(true); return }
    setBuying(true)
    try {
      const res = isBasket
        ? await authFetch(`/etf`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(basketBody()),
          })
        : await authFetch(`/contracts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              package_name: legs[0].pkg.name,
              ecosystem: legs[0].pkg.ecosystem,
              cvss_threshold: legs[0].cvssThreshold,
              epss_threshold: soloTarget,
              purchase_price: price,
              duration_days: duration,
              direction,
            }),
          })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Bet failed: ${err.detail ?? res.status}`)
        return
      }
      setLegs([])
      setThresholdCount(1)
      setDirection("yes")
      refreshUser()
      onBuy?.()
    } finally {
      setBuying(false)
    }
  }

  const searchablePackages = direction === "no" ? (noPackages ?? []) : packages
  const available = searchablePackages.filter((p) => !legs.some((l) => legKey(l.pkg) === legKey(p)))
  const filtered = search
    ? available.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20)
    : [...available].sort((a, b) => (b.epss_score ?? 0) - (a.epss_score ?? 0)).slice(0, 8)
  const showDropdown = search.length > 0 || searchFocused

  const multiplier = sim && price > 0 ? (sim.max_win / price + 1) : null
  const kOfN = Math.min(thresholdCount, legs.length)

  return (
    <div className="w-full h-full flex flex-col gap-3 overflow-y-auto lg:overflow-hidden">
      <SignupPrompt open={showSignup} onClose={() => setShowSignup(false)} />

      {/* Direction toggle — NO bets are single-package only, so hidden once a basket forms */}
      {!isBasket && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Betting</span>
          <div className="flex items-center gap-1 rounded-md bg-zinc-900 p-0.5">
            <button
              onClick={() => setDirection("yes")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${direction === "yes" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Vulnerability happens
            </button>
            <button
              onClick={() => setDirection("no")}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${direction === "no" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              No vulnerability
            </button>
          </div>
          {direction === "no" && (
            <span className="text-[10px] text-zinc-600">
              Only packages with a CVE in the last {NO_BET_ELIGIBILITY_DAYS} days are eligible.
            </span>
          )}
        </div>
      )}

      {/* Search / add */}
      {!(direction === "no" && legs.length >= 1) && (
      <div className="relative shrink-0 rounded-xl border border-zinc-700 bg-zinc-800/70 px-4 py-3 shadow-lg shadow-black/20">
        <div className="flex items-center gap-2.5">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            data-tour="predict-search"
            placeholder={
              legs.length === 0
                ? direction === "no"
                  ? "Search a recently-vulnerable package…"
                  : "Search package to start a slip… (e.g. pandas, lodash)"
                : "Add another package…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="package.json,requirements.txt,pyproject.toml,.json,.txt,.toml"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleManifest(f) }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded border border-zinc-600 px-2 py-1 text-[10px] text-zinc-300 hover:border-zinc-400 hover:text-white transition-colors"
            title="Add all tracked packages from a package.json / requirements.txt / pyproject.toml"
          >
            {parsing ? "parsing…" : "import manifest"}
          </button>
        </div>
        {showDropdown && (
          <div className="absolute left-0 right-0 top-full mt-2 z-20 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl divide-y divide-zinc-800 max-h-56 overflow-y-auto">
            {!search && filtered.length > 0 && (
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Trending risk</p>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-600">{searchablePackages.length === 0 ? "Loading…" : "No results"}</p>
            ) : filtered.map((p) => (
              <button key={legKey(p)} data-tour="predict-add-result" onClick={() => addLeg(p)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50"
              >
                <EcoBadge ecosystem={p.ecosystem} />
                <span className="font-mono text-sm text-zinc-200">{p.name}</span>
                {p.epss_score != null && (
                  <span className="ml-auto text-xs text-zinc-500">EPSS {Math.round(p.epss_score * 100)}%</span>
                )}
                <span className="text-[10px] font-bold text-[#FDE832]">+ add</span>
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden rounded-xl border border-zinc-800 bg-[#181D21] divide-y divide-zinc-800 lg:divide-y-0">

      {/* ── LEFT: payout chart ── */}
      <div className="flex-1 min-w-0 flex flex-col lg:min-h-0 lg:border-r lg:border-zinc-800">
        {/* Payout panel */}
        <div className="flex-1 min-h-[280px] lg:min-h-0 overflow-hidden flex flex-col">
          {legs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-7 px-8 py-10 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-zinc-800/60 border border-zinc-700/60">
                <Layers className="w-7 h-7 text-zinc-500" />
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-medium text-zinc-200">Add packages to build a slip.</p>
                <p className="text-sm text-zinc-500 max-w-md">
                  Search above, or import a manifest to pull in everything you depend on.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg text-left">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">1 package = single contract</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Bet on one package. pick a CVSS threshold and EPSS scenario, get paid per event type.</p>
                </div>
                <div className="rounded-xl border border-[#FDE832]/20 bg-zinc-900/60 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#FDE832]/80 mb-1.5">2+ packages = basket</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">Any leg hitting its event pays out the whole slip. choose how many legs must hit.</p>
                </div>
              </div>

              <div className="flex items-center gap-5 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> EPSS spike</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#FDE832]" /> CVSS event</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400" /> MAL advisory</span>
              </div>
            </div>
          ) : (
            <motion.div
              key={isBasket ? "basket" : legKey(legs[0].pkg)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: simLoading && !sim ? 0.5 : 1, y: 0 }}
              className="flex flex-col flex-1 min-h-0"
            >
              {/* Summary cards */}
              <div className="px-5 pt-4 pb-3 border-b border-zinc-800/60 shrink-0">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide mb-3">
                  <div className="flex items-center gap-1 rounded-md bg-zinc-900 p-0.5">
                    <button
                      onClick={() => setChartTab("returns")}
                      className={`rounded px-2 py-1 transition-colors ${chartTab === "returns" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                      Simulated returns
                    </button>
                    <button
                      onClick={() => setChartTab("risk")}
                      className={`rounded px-2 py-1 transition-colors ${chartTab === "risk" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                      Risk history
                    </button>
                  </div>
                  {chartTab === "returns" && (
                    <span className="ml-auto text-[10px] text-zinc-700 font-normal normal-case tracking-normal">estimate</span>
                  )}
                </div>
                {chartTab === "risk" ? null : isBasket ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-emerald-400/20 bg-zinc-900/60 px-3 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">If {kOfN === 1 ? "any leg" : `${kOfN} legs`} hit</p>
                      <p className="text-lg font-bold tabular-nums text-emerald-400">{sim ? `+${sim.max_win.toLocaleString()}` : "…"}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-700/40 bg-zinc-900/60 px-3 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Multiplier</p>
                      <p className="text-lg font-bold tabular-nums text-zinc-200">{multiplier ? `${multiplier.toFixed(1)}×` : "…"}</p>
                    </div>
                    <div className="rounded-xl border border-red-400/20 bg-zinc-900/60 px-3 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Max loss</p>
                      <p className="text-lg font-bold tabular-nums text-red-400">{sim ? sim.max_loss.toLocaleString() : "…"}</p>
                    </div>
                  </div>
                ) : direction === "no" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-zinc-900/60 px-3 py-2.5">
                      <div className="flex items-center gap-1 mb-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">No new CVE</span>
                      </div>
                      <p className="text-lg font-bold tabular-nums text-emerald-400">
                        {sim ? `+${sim.cvss_win.toLocaleString()}` : "…"}
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        {sim && price > 0 ? `${(sim.cvss_win / price + 1).toFixed(1)}× if it survives` : ""}
                      </p>
                      <p className="text-[9px] text-zinc-700 mt-1 leading-tight">
                        {legs[0] ? `wins if no new CVE ≥ ${legs[0].cvssThreshold.toFixed(1)} CVSS before expiry` : ""}
                      </p>
                    </div>
                    <div className="rounded-xl bg-zinc-900/60 px-3 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">Max loss</p>
                      <p className="text-lg font-bold tabular-nums text-red-400">{sim ? sim.max_loss.toLocaleString() : "…"}</p>
                      <p className="text-[9px] text-zinc-700 mt-1 leading-tight">lost immediately if a qualifying CVE lands</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      {
                        label: "EPSS spike",
                        key: "epss_win",
                        color: "text-emerald-400",
                        dot: "bg-emerald-400",
                        criteria: `wins if EPSS ≥ ${(soloTarget * 100).toFixed(1)}%`,
                      },
                      {
                        label: "CVSS event",
                        key: "cvss_win",
                        color: "text-[#FDE832]",
                        dot: "bg-[#FDE832]",
                        criteria: legs[0] ? `wins if new CVE, CVSS ≥ ${legs[0].cvssThreshold.toFixed(1)}` : "",
                      },
                      {
                        label: "MAL",
                        key: "mal_win",
                        color: "text-rose-400",
                        dot: "bg-rose-400",
                        criteria: "wins if a malicious-package advisory is published",
                      },
                    ] as const).map(({ label, key, color, dot, criteria }) => (
                      <div key={key} className="rounded-xl bg-zinc-900/60 px-3 py-2.5">
                        <div className="flex items-center gap-1 mb-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
                        </div>
                        <p className={`text-lg font-bold tabular-nums ${color}`}>
                          {sim ? `+${sim[key].toLocaleString()}` : "…"}
                        </p>
                        <p className="text-[10px] text-zinc-600">
                          {sim && price > 0 ? `${(sim[key] / price + 1).toFixed(1)}× if YES` : ""}
                        </p>
                        {criteria && (
                          <p className="text-[9px] text-zinc-700 mt-1 leading-tight">{criteria}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chart */}
              {chartTab === "risk" ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
                  {legs.map((l) => {
                    const key = legKey(l.pkg)
                    const detail = riskDetails[key]
                    const sinceDate = direction === "no"
                      ? new Date(Date.now() - NO_BET_ELIGIBILITY_DAYS * 86400000).toISOString().slice(0, 10)
                      : undefined
                    const chart = detail ? buildEpssChartData(detail, sinceDate) : null
                    return (
                      <div
                        key={key}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-col shrink-0"
                        style={{ flex: `1 0 ${100 / Math.min(legs.length, 4)}%`, minHeight: 160 }}
                      >
                        <div className="flex items-center gap-1.5 px-3 pt-2.5 shrink-0">
                          <EcoBadge ecosystem={l.pkg.ecosystem} />
                          <span className="font-mono text-xs text-zinc-300 truncate">{l.pkg.name}</span>
                        </div>
                        {!detail ? (
                          <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">Loading…</div>
                        ) : !chart ? (
                          <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs">No EPSS history</div>
                        ) : (
                          <EpssChart data={chart.chartData} cveData={chart.scatterData} />
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : sim && sim.curve.length > 0 ? (
                <div className="px-2 pt-2 pb-1 flex-1 min-h-[180px] flex flex-col">
                  <ResponsiveContainer width="100%" height="100%" minHeight={160}>
                    <AreaChart data={sim.curve} margin={{ top: 16, right: 56, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="epssGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="cvssGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#FDE832" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#FDE832" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="malGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#fb7185" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#fb7185" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis yAxisId="win" orientation="right" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${(v / 1000).toFixed(0)}k`}
                        domain={[sim.y_min, sim.y_max]} allowDataOverflow={false} width={52} />
                      <ReferenceLine yAxisId="win" y={0} stroke="#3f3f46" strokeWidth={1} />
                      <ReferenceLine yAxisId="win" y={sim.max_loss} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1}
                        label={{ value: "MAX LOSS", position: "insideBottomRight", fill: "#f87171", fontSize: 9, fontWeight: 700 }} />
                      <ReTooltip cursor={{ stroke: "#71717a", strokeWidth: 1, strokeDasharray: "3 3" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const get = (key: string) => payload.find((p) => p.dataKey === key)?.value as number | undefined
                          const sell = get("sell_pnl"); const epss = get("epss_win"); const cvss = get("cvss_win"); const mal = get("mal_win")
                          return (
                            <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg space-y-1">
                              <p className="text-zinc-400 font-medium">{label}</p>
                              {isBasket ? (
                                epss != null && <p className="text-emerald-400">Slip hits → +{epss.toLocaleString()} bits</p>
                              ) : direction === "no" ? (
                                cvss != null && <p className="text-[#FDE832]">No new CVE → +{cvss.toLocaleString()} bits</p>
                              ) : (
                                <>
                                  {epss != null && <p className="text-emerald-400">EPSS spike → +{epss.toLocaleString()} bits</p>}
                                  {cvss != null && <p className="text-[#FDE832]">CVSS event → +{cvss.toLocaleString()} bits</p>}
                                  {mal != null && <p className="text-rose-400">MAL → +{mal.toLocaleString()} bits</p>}
                                </>
                              )}
                              {sell != null && (
                                <p className={`font-medium border-t border-zinc-800 pt-1 mt-1 ${sell >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  Sell now → {sell >= 0 ? "+" : ""}{sell.toLocaleString()} bits
                                </p>
                              )}
                            </div>
                          )
                        }}
                      />
                      {!isBasket && direction === "no" ? (
                        <Area yAxisId="win" stackId="win" type="monotone" dataKey="cvss_win" stroke="#FDE832" strokeWidth={1} fill="url(#cvssGrad)" dot={false} activeDot={{ r: 3, fill: "#FDE832", stroke: "none" }} />
                      ) : (
                        <>
                          {!isBasket && (
                            <>
                              <Area yAxisId="win" stackId="win" type="monotone" dataKey="mal_win" stroke="#fb7185" strokeWidth={1} fill="url(#malGrad)" dot={false} activeDot={{ r: 3, fill: "#fb7185", stroke: "none" }} />
                              <Area yAxisId="win" stackId="win" type="monotone" dataKey="cvss_win" stroke="#FDE832" strokeWidth={1} fill="url(#cvssGrad)" dot={false} activeDot={{ r: 3, fill: "#FDE832", stroke: "none" }} />
                            </>
                          )}
                          <Area yAxisId="win" stackId="win" type="monotone" dataKey="epss_win" stroke="#34d399" strokeWidth={1} fill="url(#epssGrad)" dot={false} activeDot={{ r: 3, fill: "#34d399", stroke: "none" }} />
                        </>
                      )}
                      {/* Invisible — plotting sell value crushes to ~0 next to thousands-scale payouts; kept only so the tooltip can read it */}
                      <Area yAxisId="win" type="monotone" dataKey="sell_pnl" stroke="none" fill="none" dot={false} activeDot={false} legendType="none" />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 px-3 pt-1 pb-3 text-[10px] flex-wrap">
                    {isBasket ? (
                      <span className="flex items-center gap-1 text-emerald-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/60" /> Payout if slip hits</span>
                    ) : direction === "no" ? (
                      <span className="flex items-center gap-1 text-[#FDE832]"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#FDE832]/60" /> No new CVE</span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-emerald-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/60" /> EPSS spike</span>
                        <span className="flex items-center gap-1 text-[#FDE832]"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#FDE832]/60" /> CVSS event</span>
                        <span className="flex items-center gap-1 text-rose-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/60" /> MAL</span>
                      </>
                    )}
                  </div>
                </div>
              ) : simError ? (
                <div className="flex items-center justify-center flex-1 min-h-[180px] text-red-400 text-sm text-center px-6">{simError}</div>
              ) : (
                <div className="flex items-center justify-center flex-1 min-h-[180px] text-zinc-600 text-sm">Calculating…</div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── RIGHT: slip ── */}
      <div className="w-full lg:w-[340px] shrink-0 flex flex-col lg:min-h-0">
        <div className="flex flex-col flex-1 lg:min-h-0 overflow-hidden">
          <div className="px-4 pt-3.5 pb-2.5 border-b border-zinc-800/60 flex items-center shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#FDE832]">Your slip</span>
            {legs.length > 0 && (
              <span className="ml-2 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300 tabular-nums">
                {legs.length}
              </span>
            )}
            {bits != null && (
              <span className="ml-auto text-[10px] text-zinc-500">
                Balance <span className="font-semibold text-zinc-300 tabular-nums">{bits.toLocaleString()}</span>
              </span>
            )}
          </div>

          {/* Legs */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 lg:min-h-0">
            {legs.length === 0 && (
              <p className="px-4 py-6 text-xs text-zinc-600 text-center">Empty. Search a package on the left to add a leg.</p>
            )}
            <AnimatePresence initial={false}>
              {legs.map((l) => {
                const key = legKey(l.pkg)
                const isOpen = expandedLeg === key
                return (
                  <motion.div key={key}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60"
                  >
                    <div data-tour="leg-row" className="flex items-center gap-2 px-4 py-2.5">
                      <EcoBadge ecosystem={l.pkg.ecosystem} />
                      <button data-tour="leg-row-toggle" onClick={() => setExpandedLeg(isOpen ? null : key)}
                        className="flex-1 min-w-0 text-left font-mono text-sm text-zinc-200 truncate hover:text-white"
                      >
                        {l.pkg.name}
                      </button>
                      <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">CVSS ≥ {l.cvssThreshold.toFixed(1)}</span>
                      <button onClick={() => removeLeg(key)} className="shrink-0 text-zinc-600 hover:text-zinc-300 text-sm leading-none">✕</button>
                    </div>
                    {isOpen && (
                      <div className="px-4 pb-3 pt-3 space-y-3 border-t border-zinc-800/60">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-zinc-500">CVSS threshold</span>
                            <span className="text-[10px] font-semibold text-zinc-300">≥ {l.cvssThreshold.toFixed(1)}</span>
                          </div>
                          <input type="range" data-tour="cvss-slider" min={1} max={10} step={0.1} value={l.cvssThreshold}
                            onChange={(e) => updateLeg(key, { cvssThreshold: Number(e.target.value) })}
                            className="w-full accent-[#FDE832]" />
                        </div>
                        {!isBasket && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-zinc-500">
                                EPSS scenario
                                {l.pkg.epss_score != null && (
                                  <span className="ml-1.5 text-zinc-600">now {(l.pkg.epss_score * 100).toFixed(2)}%</span>
                                )}
                              </span>
                              <span className={`text-[10px] font-semibold tabular-nums ${soloDrift > 1.5 ? "text-green-400" : "text-zinc-400"}`}>
                                {soloDrift >= 0.99 && soloDrift <= 1.01 ? "baseline" : `${soloDrift.toFixed(1)}× → ${(soloTarget * 100).toFixed(1)}%`}
                              </span>
                            </div>
                            <input type="range" min={soloMinPos} max={1} step={0.001} value={l.epssSliderPos}
                              onChange={(e) => updateLeg(key, { epssSliderPos: Math.max(soloMinPos, Number(e.target.value)) })}
                              className="w-full accent-emerald-400" />
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          {/* Slip config */}
          <div className="border-t border-zinc-800/60 px-4 py-3 space-y-3 shrink-0">
            {isBasket && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-zinc-500">Legs that must hit</span>
                  <span className="text-[10px] font-semibold text-zinc-300 tabular-nums">
                    {kOfN === 1 ? "any 1" : `at least ${kOfN}`} of {legs.length}
                  </span>
                </div>
                <input type="range" min={1} max={legs.length} step={1} value={kOfN}
                  onChange={(e) => setThresholdCount(Number(e.target.value))}
                  className="w-full accent-[#FDE832]" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-zinc-500 mb-1">Stake</p>
                <input type="number" min={10} max={bits ?? 9999} step={10} value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 tabular-nums"
                />
              </div>
              <div data-tour="stake-chips" className="flex gap-1 pt-4">
                {STAKE_CHIPS.map((v) => (
                  <button key={v} data-tour="stake-chip" onClick={() => setPrice(v)} className={chipClass(price === v)}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">Duration</p>
              <div data-tour="duration-options" className="flex gap-1.5">
                {DURATION_OPTIONS.map((d) => (
                  <button key={d} data-tour="duration-chip" onClick={() => setDuration(d)}
                    className={`flex-1 py-1.5 ${chipClass(duration === d)}`}
                  >{d}d</button>
                ))}
              </div>
            </div>
            {sim && multiplier != null && (
              <p className="text-[11px] text-zinc-500">
                Pays <span className="font-semibold text-emerald-400 tabular-nums">+{sim.max_win.toLocaleString()} bits</span>
                {" "}({multiplier.toFixed(1)}×) if {isBasket ? (kOfN === 1 ? "any leg hits" : `${kOfN} legs hit`) : direction === "no" ? "it survives" : "it hits"}.
              </p>
            )}
            <button
              data-tour="buy-slip-btn"
              onClick={buySlip}
              disabled={legs.length === 0 || buying || !!simError || (bits != null && bits < price)}
              className="w-full rounded-xl bg-[#FDE832] py-2.5 text-sm font-bold text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {buying ? "Buying…" : legs.length === 0 ? "Add a package to bet" : `Buy slip for ${price} bits`}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
