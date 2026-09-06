import { useState, useEffect, useCallback, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts"
import { Layers, Search } from "lucide-react"
import type { Package } from "@/types"
import { useApi } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { SignupPrompt } from "./SignupPrompt"

const DURATION_OPTIONS = [7, 14, 30]
const STAKE_CHIPS = [25, 100, 250, 500]
const MAX_LEGS = 10
const DEFAULT_CVSS = 7.0

const EPSS_MIN = 0.001
const EPSS_MAX = 1.0
const posToEpss = (pos: number) => EPSS_MIN * Math.pow(EPSS_MAX / EPSS_MIN, pos)
const epssToPos = (v: number) => Math.log(v / EPSS_MIN) / Math.log(EPSS_MAX / EPSS_MIN)

interface Leg {
  pkg: Package
  cvssThreshold: number
  epssSliderPos: number // only used when it's the sole leg
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
  const [legs, setLegs] = useState<Leg[]>([])
  const [expandedLeg, setExpandedLeg] = useState<string | null>(null)
  const [thresholdCount, setThresholdCount] = useState(1)
  const [price, setPrice] = useState(100)
  const [duration, setDuration] = useState(30)
  const [buying, setBuying] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [schmeckles, setSchmeckles] = useState<number | null>(null)
  const [sim, setSim] = useState<SimResult | null>(null)
  const [simLoading, setSimLoading] = useState(false)

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

  const refreshUser = useCallback(() => {
    authFetch(`/users/me`)
      .then((r) => r.json())
      .then((d) => setSchmeckles(d.schmeckles))
      .catch(() => {})
  }, [authFetch])

  useEffect(() => { refreshUser() }, [refreshUser])

  // Simulate: 1 leg → single-contract endpoint (EPSS scenario supported),
  // 2+ legs → basket endpoint with threshold_count
  useEffect(() => {
    if (legs.length === 0) { setSim(null); return }
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
              }),
            })
        if (res.ok) setSim(await res.json())
      } finally {
        setSimLoading(false)
      }
    }, 150)
    return () => clearTimeout(t)
  }, [legs, thresholdCount, price, duration, soloDrift, isBasket, authFetch])

  function legKey(p: Package) { return `${p.ecosystem}:${p.name}` }

  function basketBody() {
    return {
      members: legs.map((l) => ({
        package_name: l.pkg.name,
        ecosystem: l.pkg.ecosystem,
        cvss_threshold: l.cvssThreshold,
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
    if (legs.some((l) => legKey(l.pkg) === legKey(p))) return
    const startPos = p.epss_score != null && p.epss_score > 0 ? epssToPos(p.epss_score) : epssToPos(0.01)
    setLegs((prev) => [...prev, { pkg: p, cvssThreshold: DEFAULT_CVSS, epssSliderPos: Math.max(0, Math.min(1, startPos)) }])
    setSearch("")
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
        const startPos = m.epss_score != null && m.epss_score > 0 ? epssToPos(m.epss_score) : epssToPos(0.01)
        additions.push({
          pkg: m as Package,
          cvssThreshold: DEFAULT_CVSS,
          epssSliderPos: Math.max(0, Math.min(1, startPos)),
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
    if (legs.length === 0) return
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
            }),
          })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Bet failed: ${err.detail ?? res.status}`)
        return
      }
      setLegs([])
      setThresholdCount(1)
      refreshUser()
      onBuy?.()
    } finally {
      setBuying(false)
    }
  }

  const available = packages.filter((p) => !legs.some((l) => legKey(l.pkg) === legKey(p)))
  const filtered = search
    ? available.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20)
    : [...available].sort((a, b) => (b.epss_score ?? 0) - (a.epss_score ?? 0)).slice(0, 8)
  const showDropdown = search.length > 0 || searchFocused

  const multiplier = sim && price > 0 ? (sim.max_win / price + 1) : null
  const kOfN = Math.min(thresholdCount, legs.length)

  return (
    <div className="w-full h-full flex flex-col gap-3 overflow-y-auto lg:overflow-hidden">
      <SignupPrompt open={showSignup} onClose={() => setShowSignup(false)} />

      {/* Search / add */}
      <div className="relative shrink-0 rounded-xl border border-zinc-700 bg-zinc-800/70 px-4 py-3 shadow-lg shadow-black/20">
        <div className="flex items-center gap-2.5">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            type="text"
            data-tour="predict-search"
            placeholder={legs.length === 0 ? "Search package to start a slip… (e.g. pandas, lodash)" : "Add another package…"}
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
              <p className="px-3 py-2 text-sm text-zinc-600">{packages.length === 0 ? "Loading…" : "No results"}</p>
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
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wide mb-3">
                  Simulated returns
                  <span className="ml-auto text-[10px] text-zinc-700 font-normal normal-case tracking-normal">estimate</span>
                </div>
                {isBasket ? (
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
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { label: "EPSS spike", key: "epss_win", color: "text-emerald-400", dot: "bg-emerald-400", border: "border-emerald-400/20" },
                      { label: "CVSS event", key: "cvss_win", color: "text-[#FDE832]", dot: "bg-[#FDE832]", border: "border-[#FDE832]/20" },
                      { label: "MAL", key: "mal_win", color: "text-rose-400", dot: "bg-rose-400", border: "border-rose-400/20" },
                    ] as const).map(({ label, key, color, dot, border }) => (
                      <div key={key} className={`rounded-xl border ${border} bg-zinc-900/60 px-3 py-2.5`}>
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
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chart */}
              {sim && sim.curve.length > 0 ? (
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
                        <linearGradient id="sellGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f87171" stopOpacity={0.04} />
                          <stop offset="100%" stopColor="#f87171" stopOpacity={0.2} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis orientation="right" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${(v / 1000).toFixed(0)}k`}
                        domain={[sim.y_min, sim.y_max]} allowDataOverflow={false} width={52} />
                      <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
                      <ReferenceLine y={sim.max_loss} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1}
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
                                epss != null && <p className="text-emerald-400">Slip hits → +{epss.toLocaleString()} sch</p>
                              ) : (
                                <>
                                  {epss != null && <p className="text-emerald-400">EPSS spike → +{epss.toLocaleString()} sch</p>}
                                  {cvss != null && <p className="text-[#FDE832]">CVSS event → +{cvss.toLocaleString()} sch</p>}
                                  {mal != null && <p className="text-rose-400">MAL → +{mal.toLocaleString()} sch</p>}
                                </>
                              )}
                              {sell != null && (
                                <p className={`font-medium border-t border-zinc-800 pt-1 mt-1 ${sell >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  Sell now → {sell >= 0 ? "+" : ""}{sell.toLocaleString()} sch
                                </p>
                              )}
                            </div>
                          )
                        }}
                      />
                      {!isBasket && (
                        <>
                          <Area stackId="win" type="monotone" dataKey="mal_win" stroke="#fb7185" strokeWidth={1} fill="url(#malGrad)" dot={false} activeDot={{ r: 3, fill: "#fb7185", stroke: "none" }} />
                          <Area stackId="win" type="monotone" dataKey="cvss_win" stroke="#FDE832" strokeWidth={1} fill="url(#cvssGrad)" dot={false} activeDot={{ r: 3, fill: "#FDE832", stroke: "none" }} />
                        </>
                      )}
                      <Area stackId="win" type="monotone" dataKey="epss_win" stroke="#34d399" strokeWidth={1} fill="url(#epssGrad)" dot={false} activeDot={{ r: 3, fill: "#34d399", stroke: "none" }} />
                      <Area type="monotone" dataKey="sell_pnl" stroke="#f87171" strokeWidth={2} fill="url(#sellGrad)" dot={false} activeDot={{ r: 4, fill: "#e4e4e7", stroke: "none" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 px-3 pt-1 pb-3 text-[10px] flex-wrap">
                    {isBasket ? (
                      <span className="flex items-center gap-1 text-emerald-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/60" /> Payout if slip hits</span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-emerald-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/60" /> EPSS spike</span>
                        <span className="flex items-center gap-1 text-[#FDE832]"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#FDE832]/60" /> CVSS event</span>
                        <span className="flex items-center gap-1 text-rose-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/60" /> MAL</span>
                      </>
                    )}
                    <span className="flex items-center gap-1 text-red-400"><span className="inline-block h-px w-4 bg-red-400" /> Sell value</span>
                  </div>
                </div>
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
            {schmeckles != null && (
              <span className="ml-auto text-[10px] text-zinc-500">
                Balance <span className="font-semibold text-zinc-300 tabular-nums">{schmeckles.toLocaleString()}</span>
              </span>
            )}
          </div>

          {/* Legs */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60 lg:min-h-0">
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
                    className="overflow-hidden"
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
                      <div className="px-4 pb-3 space-y-3">
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
                <input type="number" min={10} max={schmeckles ?? 9999} step={10} value={price}
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
                Pays <span className="font-semibold text-emerald-400 tabular-nums">+{sim.max_win.toLocaleString()} sch</span>
                {" "}({multiplier.toFixed(1)}×) if {isBasket ? (kOfN === 1 ? "any leg hits" : `${kOfN} legs hit`) : "it hits"}.
              </p>
            )}
            <button
              data-tour="buy-slip-btn"
              onClick={buySlip}
              disabled={legs.length === 0 || buying || (schmeckles != null && schmeckles < price)}
              className="w-full rounded-xl bg-[#FDE832] py-2.5 text-sm font-bold text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {buying ? "Buying…" : legs.length === 0 ? "Add a package to bet" : `Buy slip for ${price} schmeckles`}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
