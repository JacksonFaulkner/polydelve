import { useState, useEffect, useCallback, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Layers, Search } from "lucide-react"
import type { Package, PackageDetail, PackageListResponse, User } from "@/types"
import { useApi } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { SignupPrompt } from "./SignupPrompt"
import EpssChart from "./EpssChart"
import { Tooltip } from "@/components/ui/Tooltip"
import { EcoBadge } from "@/components/ui/Badges"
import { buildEpssChartData } from "@/lib/epss"

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

interface SimResult {
  epss_payout: number
  cvss_payout: number
  mal_payout: number
  epss_win: number
  cvss_win: number
  mal_win: number
  max_win: number
  max_loss: number
  win_probability: number
}

export function PredictPage({ onBuy }: { onBuy?: () => void }) {
  const { authFetch, getJson } = useApi()
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
  const [riskDetails, setRiskDetails] = useState<Record<string, PackageDetail>>({})
  const [direction, setDirection] = useState<"yes" | "no">(() => storedSlipRef.current?.direction ?? "yes")
  const [noPackages, setNoPackages] = useState<Package[] | null>(null)
  const [packagesError, setPackagesError] = useState(false)
  // NO bets hold a single package, so some actions need the user to confirm
  // or choose which package survives.
  const [pending, setPending] = useState<{ kind: "replace"; pkg: Package } | { kind: "pick" } | { kind: "ineligible"; name: string } | null>(null)

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
    getJson<PackageListResponse>(`/packages?sort=weekly_downloads&page_size=500&has_cves=true`)
      .then((d) => setPackages(d.packages ?? []))
      .catch(() => setPackagesError(true))
  }, [getJson])

  // NO bets ("this package won't get another vulnerability") only make sense
  // on packages that have actually had one recently — fetch that narrower
  // list lazily, the first time the user switches to NO.
  useEffect(() => {
    if ((direction !== "no" && pending?.kind !== "pick") || noPackages !== null) return
    getJson<PackageListResponse>(`/packages?sort=weekly_downloads&page_size=500&has_cves=true&latest_cve_days=${NO_BET_ELIGIBILITY_DAYS}`)
      .then((d) => setNoPackages(d.packages ?? []))
      .catch(() => setPackagesError(true))
  }, [direction, pending, noPackages, getJson])

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
    getJson<User>(`/users/me`)
      .then((d) => setBits(d.bits))
      .catch(() => {})
  }, [getJson])

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
    const missing = legs.filter((l) => !riskDetails[legKey(l.pkg)])
    if (missing.length === 0) return
    missing.forEach((l) => {
      const key = legKey(l.pkg)
      getJson<PackageDetail>(`/packages/${l.pkg.ecosystem}/${encodeURIComponent(l.pkg.name)}`)
        .then((d) => setRiskDetails((prev) => ({ ...prev, [key]: d })))
        .catch(() => {})
    })
  }, [legs, riskDetails, getJson])

  function legKey(p: Package) { return `${p.ecosystem}:${p.name}` }

  // Slider at baseline = no EPSS leg. Sending the current score as the target
  // would read as "already reached" and price as a near-certain win.
  function epssTargetOrNull(l: Leg): number | null {
    const target = posToEpss(l.epssSliderPos)
    const current = Math.max(l.pkg.epss_score ?? 0.01, 0.001)
    return target / current > 1.01 ? target : null
  }

  function basketBody() {
    return {
      members: legs.map((l) => ({
        package_name: l.pkg.name,
        ecosystem: l.pkg.ecosystem,
        cvss_threshold: l.cvssThreshold,
        epss_threshold: epssTargetOrNull(l),
      })),
      threshold_count: Math.min(thresholdCount, legs.length),
      purchase_price: price,
      duration_days: duration,
    }
  }

  const sectionLabel = "text-xs font-medium text-ink-3"
  function addLeg(p: Package) {
    if (legs.length >= MAX_LEGS) return
    if (legs.some((l) => legKey(l.pkg) === legKey(p))) return
    if (direction === "no" && legs.length >= 1) { // NO bets are single-package only
      setPending({ kind: "replace", pkg: p })
      setSearch("")
      return
    }
    setLegs((prev) => [...prev, { pkg: p, cvssThreshold: DEFAULT_CVSS, epssSliderPos: defaultEpssPos(p.epss_score) }])
    setSearch("")
    setExpandedLeg(legKey(p))
  }

  function newLeg(p: Package): Leg {
    return { pkg: p, cvssThreshold: DEFAULT_CVSS, epssSliderPos: defaultEpssPos(p.epss_score) }
  }

  function confirmReplace(p: Package) {
    setLegs([newLeg(p)])
    setExpandedLeg(legKey(p))
    setPending(null)
  }

  function chooseDirection(d: "yes" | "no") {
    if (d === direction) return
    if (d === "no" && legs.length > 1) {
      setPending({ kind: "pick" })
      return
    }
    if (d === "no" && legs.length === 1) {
      void switchToNo(legs[0])
      return
    }
    setPending(null)
    setDirection(d)
  }

  // Switch to NO holding only `l`. If `l` has no recent CVE it can't be bet
  // NO, so ask before the switch clears it from the slip.
  async function switchToNo(l: Leg) {
    let eligible = noPackages
    if (eligible === null) {
      try {
        const d = await getJson<PackageListResponse>(`/packages?sort=weekly_downloads&page_size=500&has_cves=true&latest_cve_days=${NO_BET_ELIGIBILITY_DAYS}`)
        eligible = d.packages ?? []
        setNoPackages(eligible)
      } catch {
        setPackagesError(true)
        return
      }
    }
    if (eligible.some((p) => legKey(p) === legKey(l.pkg))) {
      setLegs([l])
      setDirection("no")
      setPending(null)
    } else {
      setPending({ kind: "ineligible", name: l.pkg.name })
    }
  }

  function confirmClearForNo() {
    setLegs([])
    setDirection("no")
    setPending(null)
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
      if (additions.length > 0) {
        setDirection("yes")
        setPending(null)
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
              epss_threshold: soloDrift > 1.01 ? soloTarget : null,
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
  const packagesLoading = direction === "no" ? noPackages === null : packages.length === 0
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
      {pending && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setPending(null)}>
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded border border-line-2 bg-surface-1 p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {pending.kind === "replace" ? (
              <>
                <h2 className="text-lg font-bold text-ink-1">Replace your pick?</h2>
                <p className="mt-2 text-sm text-ink-2">
                  No-vulnerability bets hold one package. Swap <span className="font-mono text-ink-1">{legs[0]?.pkg.name}</span> for{" "}
                  <span className="font-mono text-ink-1">{pending.pkg.name}</span>?
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <button onClick={() => confirmReplace(pending.pkg)} className="btn-primary px-4 py-2 text-sm">Replace</button>
                  <button onClick={() => setPending(null)} className="rounded px-4 py-2 text-sm font-medium text-ink-2 hover:text-ink-1">Keep current</button>
                </div>
              </>
            ) : pending.kind === "ineligible" ? (
              <>
                <h2 className="text-lg font-bold text-ink-1">Can't bet NO on this</h2>
                <p className="mt-2 text-sm text-ink-2">
                  <span className="font-mono text-ink-1">{pending.name}</span> has had no CVE in the last {NO_BET_ELIGIBILITY_DAYS} days.
                  Switching will remove it from your slip.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                  <button onClick={confirmClearForNo} className="btn-primary px-4 py-2 text-sm">Switch &amp; remove</button>
                  <button onClick={() => setPending(null)} className="rounded px-4 py-2 text-sm font-medium text-ink-2 hover:text-ink-1">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-ink-1">Keep which package?</h2>
                <p className="mt-2 text-sm text-ink-2">No-vulnerability bets hold one package.</p>
                <div className="mt-5 flex flex-col gap-2">
                  {legs.map((l) => {
                    const ineligible = noPackages !== null && !noPackages.some((p) => legKey(p) === legKey(l.pkg))
                    return (
                      <button
                        key={legKey(l.pkg)}
                        onClick={() => void switchToNo(l)}
                        disabled={noPackages === null || ineligible}
                        className="chip px-4 py-2 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {l.pkg.name}
                        {ineligible && <span className="ml-2 font-sans text-xs">no CVE in {NO_BET_ELIGIBILITY_DAYS}d</span>}
                      </button>
                    )
                  })}
                  <button onClick={() => setPending(null)} className="rounded px-4 py-2 text-sm font-medium text-ink-2 hover:text-ink-1">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col rounded border border-line-1 bg-surface-1">

      {/* Search / add */}
      <div className="relative z-20 shrink-0 rounded-t border-b border-line-2 bg-surface-2/70 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Search className="w-4 h-4 text-ink-2 shrink-0" />
          <input
            type="text"
            data-tour="predict-search"
            placeholder={
              legs.length === 0
                ? direction === "no"
                  ? "Search a recently-vulnerable package…"
                  : "Search package to start a slip… (e.g. pandas, lodash)"
                : direction === "no"
                  ? "Swap in another package…"
                  : "Add another package…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            className="flex-1 bg-transparent text-sm text-ink-1 placeholder-ink-3 outline-none"
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
            className="chip shrink-0 px-2.5 py-1 text-xs"
            title="Add all tracked packages from a package.json / requirements.txt / pyproject.toml"
          >
            {parsing ? "parsing…" : "import manifest"}
          </button>
        </div>
        {showDropdown && (
          <div className="absolute left-0 right-0 top-full mt-2 z-20 rounded border border-line-2 bg-surface-1 shadow-xl divide-y divide-line-1 max-h-56 overflow-y-auto">
            {!search && filtered.length > 0 && (
              <p className="px-3 py-1.5 text-xs font-medium text-ink-4">Trending risk</p>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-4">{packagesError ? "Couldn't load packages" : packagesLoading ? "Loading…" : "No results"}</p>
            ) : filtered.map((p) => (
              <button key={legKey(p)} data-tour="predict-add-result" onClick={() => addLeg(p)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-2/50"
              >
                <EcoBadge ecosystem={p.ecosystem} />
                <span className="font-mono text-sm text-ink-1">{p.name}</span>
                {p.epss_score != null && (
                  <span className="ml-auto text-xs text-ink-3">EPSS {Math.round(p.epss_score * 100)}%</span>
                )}
                <span className="text-xs font-medium text-ink-3">+ add</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden rounded-b divide-y divide-line-1 lg:divide-y-0">

      {/* ── LEFT: payout chart ── */}
      <div className="flex-1 min-w-0 flex flex-col lg:min-h-0 lg:border-r lg:border-line-1">
        {/* Payout panel */}
        <div className="flex-1 min-h-[280px] lg:min-h-0 overflow-hidden flex flex-col">
          {legs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-7 px-8 py-10 text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-surface-2/60 border border-line-2/60">
                <Layers className="w-7 h-7 text-ink-3" />
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-medium text-ink-1">Add packages to build a slip.</p>
                <p className="text-sm text-ink-3 max-w-md">
                  Search above, or import a manifest to pull in everything you depend on.
                </p>
              </div>

              <div className="flex items-center gap-5 text-xs text-ink-3">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> EPSS spike</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand" /> CVSS event</span>
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
              {/* Risk history — fills the left panel */}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col divide-y divide-line-1">
                {legs.map((l) => {
                  const key = legKey(l.pkg)
                  const detail = riskDetails[key]
                  const chart = detail ? buildEpssChartData(detail) : null
                  return (
                    <div
                      key={key}
                      className="relative w-full flex flex-col shrink-0"
                      style={{ flex: `1 0 ${100 / Math.min(legs.length, 4)}%`, minHeight: 180 }}
                    >
                      {legs.length > 1 && (
                        <div className="absolute top-2 right-3 z-10 flex items-center gap-1.5">
                          <EcoBadge ecosystem={l.pkg.ecosystem} />
                          <span className="font-mono text-xs text-ink-2 truncate">{l.pkg.name}</span>
                        </div>
                      )}
                      {!detail ? (
                        <div className="flex-1 flex items-center justify-center text-ink-4 text-xs">Loading…</div>
                      ) : !chart ? (
                        <div className="flex-1 flex items-center justify-center text-ink-4 text-xs">No EPSS history</div>
                      ) : (
                        <EpssChart data={chart.chartData} cveData={chart.scatterData} />
                      )}
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── RIGHT: slip ── */}
      <div className="w-full lg:w-[380px] shrink-0 flex flex-col lg:min-h-0">
        <div className="flex flex-col flex-1 lg:min-h-0 overflow-hidden">
          <div className="px-4 pt-3.5 pb-2.5 border-b border-line-1/60 flex items-center shrink-0">
            <span className="text-sm font-semibold text-ink-1">Your slip</span>
            {legs.length > 0 && (
              <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2 tabular-nums">
                {legs.length}
              </span>
            )}
            {bits != null && (
              <span className="ml-auto text-[11px] text-ink-3">
                Balance <span className="font-semibold text-ink-2 tabular-nums">{bits.toLocaleString()}</span>
              </span>
            )}
          </div>

          {/* Legs */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 lg:min-h-0">
            {legs.length === 0 && (
              <p className="px-4 py-6 text-xs text-ink-4 text-center">Empty. Search a package on the left to add a leg.</p>
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
                    className="overflow-hidden rounded border border-line-1 bg-surface-1/60"
                  >
                    <div data-tour="leg-row" className="flex items-center gap-2 px-4 py-2.5">
                      <EcoBadge ecosystem={l.pkg.ecosystem} />
                      <button data-tour="leg-row-toggle" onClick={() => setExpandedLeg(isOpen ? null : key)}
                        className="flex-1 min-w-0 text-left font-mono text-sm text-ink-1 truncate hover:text-ink-1"
                      >
                        {l.pkg.name}
                      </button>
                      <span className="text-[11px] text-ink-4 tabular-nums shrink-0">CVSS ≥ {l.cvssThreshold.toFixed(1)}</span>
                      <button onClick={() => removeLeg(key)} className="shrink-0 text-ink-4 hover:text-ink-2 text-sm leading-none">✕</button>
                    </div>
                    {isOpen && (
                      <div className="px-4 pb-3 pt-3 space-y-3 border-t border-line-1/60">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-ink-3">CVSS threshold</span>
                            <span className="text-[11px] font-semibold text-ink-2">≥ {l.cvssThreshold.toFixed(1)}</span>
                          </div>
                          <input type="range" data-tour="cvss-slider" min={1} max={10} step={0.1} value={l.cvssThreshold}
                            onChange={(e) => updateLeg(key, { cvssThreshold: Number(e.target.value) })}
                            className="w-full accent-brand" />
                        </div>
                        {!isBasket && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] text-ink-3">
                                EPSS scenario
                                {l.pkg.epss_score != null && (
                                  <span className="ml-1.5 text-ink-4">now {(l.pkg.epss_score * 100).toFixed(2)}%</span>
                                )}
                              </span>
                              <span className={`text-[11px] font-semibold tabular-nums ${soloDrift > 1.5 ? "text-green-400" : "text-ink-2"}`}>
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
          <div className="border-t border-line-1/60 px-4 py-4 space-y-4 shrink-0">
            {isBasket && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={sectionLabel}>Legs that must hit</span>
                  <span className="text-xs font-semibold text-ink-2 tabular-nums">
                    {kOfN === 1 ? "any 1" : `at least ${kOfN}`} of {legs.length}
                  </span>
                </div>
                <input type="range" min={1} max={legs.length} step={1} value={kOfN}
                  onChange={(e) => setThresholdCount(Number(e.target.value))}
                  className="w-full accent-brand" />
              </div>
            )}

            {/* Outcome — three plain stats, no boxes */}
            {legs.length > 0 && (
              <div>
                {simError ? (
                  <div className="text-red-400 text-xs">{simError}</div>
                ) : (
                  <div className="grid grid-cols-3 divide-x divide-line-1">
                    <div className="pr-3">
                      <p className={sectionLabel}>
                        {isBasket ? (kOfN === 1 ? "Any leg hits" : `${kOfN} legs hit`) : direction === "no" ? "If it survives" : "If it hits"}
                      </p>
                      <p className="text-xl font-bold tabular-nums text-emerald-400 leading-tight">{sim ? `+${sim.max_win.toLocaleString()}` : "…"}</p>
                      <p className="text-[11px] text-ink-3">{multiplier ? `${multiplier.toFixed(1)}× stake` : ""}</p>
                    </div>
                    <div className="px-3">
                      <p className={sectionLabel}>Win chance</p>
                      <p className="text-xl font-bold tabular-nums text-ink-1 leading-tight">{sim ? `${(sim.win_probability * 100).toFixed(1)}%` : "…"}</p>
                      <p className="text-[11px] text-ink-3">{duration}d window</p>
                    </div>
                    <div className="pl-3">
                      <p className={sectionLabel}>Max loss</p>
                      <p className="text-xl font-bold tabular-nums text-red-400 leading-tight">{sim ? sim.max_loss.toLocaleString() : "…"}</p>
                      <p className="text-[11px] text-ink-3">{direction === "no" ? "on any CVE" : "at expiry"}</p>
                    </div>
                  </div>
                )}
                {!isBasket && legs[0] && (
                  <p className="mt-2 text-[11px] text-ink-3 leading-snug">
                    {direction === "no"
                      ? `Wins if no new CVE with CVSS ≥ ${legs[0].cvssThreshold.toFixed(1)} lands before expiry. Settles automatically.`
                      : `Wins on the first of: CVE with CVSS ≥ ${legs[0].cvssThreshold.toFixed(1)}` +
                        (soloDrift > 1.01 ? `, EPSS ≥ ${(soloTarget * 100).toFixed(1)}%` : "") +
                        `, or a MAL advisory. Settles automatically.`}
                  </p>
                )}
              </div>
            )}

            {/* Direction — NO bets are single-package only; switching with a basket asks which leg to keep */}
            <div>
              <p className={`${sectionLabel} mb-1.5`}>Betting on</p>
              <div className="grid grid-cols-2 gap-2">
                <button data-demo="direction-yes" onClick={() => chooseDirection("yes")} aria-pressed={direction === "yes"} className="chip px-3 py-2">
                  Vulnerability happens
                </button>
                <Tooltip content={`Only packages with a CVE in the last ${NO_BET_ELIGIBILITY_DAYS} days are eligible.`}>
                  <button data-demo="direction-no" onClick={() => chooseDirection("no")} aria-pressed={direction === "no"} className="chip w-full px-3 py-2">
                    No vulnerability
                  </button>
                </Tooltip>
              </div>
            </div>

            <div>
              <p className={`${sectionLabel} mb-1.5`}>Stake</p>
              <div className="flex items-center gap-2">
                <div className="relative w-24 shrink-0">
                  <input type="number" min={10} max={bits ?? 9999} step={10} value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    aria-label="Stake in bits"
                    className="w-full rounded-md border border-line-2 bg-surface-1 py-2 pl-3 pr-9 text-sm text-ink-1 outline-none focus:border-line-3 tabular-nums"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-4">bits</span>
                </div>
                <div data-tour="stake-chips" className="flex flex-1 gap-2">
                  {STAKE_CHIPS.map((v) => (
                    <button key={v} data-tour="stake-chip" onClick={() => setPrice(v)} aria-pressed={price === v} className="chip flex-1 px-3 py-2 tabular-nums">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className={`${sectionLabel} mb-1.5`}>Duration</p>
              <div data-tour="duration-options" className="grid grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((d) => (
                  <button key={d} data-tour="duration-chip" onClick={() => setDuration(d)} aria-pressed={duration === d} className="chip px-3 py-2">
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            <button
              data-tour="buy-slip-btn"
              onClick={buySlip}
              disabled={legs.length === 0 || buying || !!simError || (bits != null && bits < price)}
              className="w-full btn-primary py-3 text-sm"
            >
              {buying ? "Buying…" : legs.length === 0 ? "Add a package to bet" : `Buy slip for ${price} bits`}
            </button>
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  )
}