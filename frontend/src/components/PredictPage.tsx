import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts"
import type { Package } from "@/types"
import { useApi } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { SignupPrompt } from "./SignupPrompt"

const DURATION_OPTIONS = [7, 14, 30]

interface SimCurvePoint {
  label: string
  sell_pnl: number
  epss_win: number
  cvss_win: number
  mal_win: number
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
  y_min: number
  y_max: number
  curve: SimCurvePoint[]
}

export function PredictPage({ onBuy }: { onBuy?: () => void }) {
  const { authFetch } = useApi()
  const { isAuthenticated } = useAuth()
  const [showSignup, setShowSignup] = useState(false)
  const [packages, setPackages] = useState<Package[]>([])
  const [search, setSearch] = useState("")
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)
  const [cvssThreshold, setCvssThreshold] = useState(7.0)
  const [price, setPrice] = useState(100)
  const [duration, setDuration] = useState(30)
  const [epssSliderPos, setEpssSliderPos] = useState(0.5)

  const EPSS_MIN = 0.001
  const EPSS_MAX = 1.0
  const posToEpss = (pos: number) => EPSS_MIN * Math.pow(EPSS_MAX / EPSS_MIN, pos)
  const epssToPos = (v: number) => Math.log(v / EPSS_MIN) / Math.log(EPSS_MAX / EPSS_MIN)
  const currentEpss = selectedPkg?.epss_score ?? 0.01
  const minPos = Math.max(0, Math.min(1, epssToPos(Math.max(currentEpss, EPSS_MIN))))
  const epssTarget = posToEpss(epssSliderPos)
  const epssDrift = epssTarget / Math.max(currentEpss, 0.001)

  const [buying, setBuying] = useState(false)
  const [schmeckles, setSchmeckles] = useState<number | null>(null)
  const [sim, setSim] = useState<SimResult | null>(null)
  const [simLoading, setSimLoading] = useState(false)

  useEffect(() => {
    if (!selectedPkg) { setSim(null); return }
    const t = setTimeout(async () => {
      setSimLoading(true)
      try {
        const res = await authFetch(`/contracts/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            package_name: selectedPkg.name,
            ecosystem: selectedPkg.ecosystem,
            cvss_threshold: cvssThreshold,
            purchase_price: price,
            duration_days: duration,
            epss_drift: epssDrift,
          }),
        })
        if (res.ok) setSim(await res.json())
      } finally {
        setSimLoading(false)
      }
    }, 150)
    return () => clearTimeout(t)
  }, [selectedPkg, cvssThreshold, price, duration, epssDrift, authFetch])

  useEffect(() => {
    if (selectedPkg?.epss_score != null && selectedPkg.epss_score > 0)
      setEpssSliderPos(epssToPos(selectedPkg.epss_score))
    else
      setEpssSliderPos(epssToPos(0.01))
  }, [selectedPkg])

  useEffect(() => {
    authFetch(`/packages?sort=weekly_downloads&page_size=500&has_cves=true`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => setPackages(d.packages ?? []))
      .catch((e) => console.error("packages fetch failed:", e))
  }, [])

  const refreshUser = useCallback(() => {
    authFetch(`/users/me`)
      .then((r) => r.json())
      .then((d) => { setSchmeckles(d.schmeckles) })
      .catch(() => {})
  }, [authFetch])

  useEffect(() => { refreshUser() }, [refreshUser])

  const filtered = packages.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20)

  async function buyContract() {
    if (!selectedPkg) return
    if (!isAuthenticated) { setShowSignup(true); return }
    setBuying(true)
    try {
      await authFetch(`/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_name: selectedPkg.name,
          ecosystem: selectedPkg.ecosystem,
          cvss_threshold: cvssThreshold,
          epss_threshold: epssTarget,
          purchase_price: price,
          duration_days: duration,
        }),
      })
      setSelectedPkg(null)
      refreshUser()
      onBuy?.()
    } finally {
      setBuying(false)
    }
  }

  const WIN_CONFIGS = [
    { label: "EPSS spike",   key: "epss_win", color: "text-emerald-400", dot: "bg-emerald-400", border: "border-emerald-400/20" },
    { label: "CVSS event",   key: "cvss_win", color: "text-[#FDE832]",   dot: "bg-[#FDE832]",  border: "border-[#FDE832]/20" },
    { label: "MAL", key: "mal_win",  color: "text-rose-400",    dot: "bg-rose-400",   border: "border-rose-400/20" },
  ]

  // Shared returns panel content (used in both mobile and desktop)
  const returnsPanel = (
    <div className="flex-1 min-w-0 flex flex-col h-full">
      <AnimatePresence mode="wait">
        {!selectedPkg ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-zinc-700/60 bg-[#181D21] overflow-hidden flex flex-col flex-1"
          >
            <div className="px-5 pt-5 pb-4 border-b border-zinc-800/60">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-2.5 w-32 rounded bg-zinc-700 animate-pulse" />
                <div className="w-3.5 h-3.5 rounded-full bg-zinc-700/60 animate-pulse" />
                <div className="ml-auto h-2 w-10 rounded bg-zinc-700/40 animate-pulse" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { border: "border-emerald-400/20", dot: "bg-emerald-400/40" },
                  { border: "border-[#FDE832]/20",   dot: "bg-[#FDE832]/40" },
                  { border: "border-rose-400/20",    dot: "bg-rose-400/40" },
                ].map(({ border, dot }, i) => (
                  <div key={i} className={`rounded-xl border ${border} bg-zinc-900/60 px-4 py-3 space-y-2`}>
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className={`w-2 h-2 rounded-full ${dot}`} />
                      <div className="h-2 w-16 rounded bg-zinc-700 animate-pulse" />
                    </div>
                    <div className="h-8 w-20 rounded bg-zinc-700/80 animate-pulse" />
                    <div className="h-2.5 w-14 rounded bg-zinc-700/60 animate-pulse mt-1" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 px-2 pt-2 pb-1 flex flex-col">
              <div className="flex-1 relative overflow-hidden rounded-lg">
                <svg className="absolute inset-0 w-full h-full opacity-25" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <path d="M0,95 Q25,70 50,55 T100,48 L100,100 L0,100 Z" fill="#fb7185" fillOpacity="0.25" stroke="#fb7185" strokeWidth="0.5" />
                  <path d="M0,85 Q25,55 50,35 T100,28 L100,100 L0,100 Z" fill="#FDE832" fillOpacity="0.2" stroke="#FDE832" strokeWidth="0.5" />
                  <path d="M0,70 Q25,38 50,18 T100,10 L100,100 L0,100 Z" fill="#34d399" fillOpacity="0.2" stroke="#34d399" strokeWidth="0.5" />
                  <line x1="0" y1="97" x2="100" y2="97" stroke="#f87171" strokeWidth="0.6" strokeDasharray="2 1" />
                </svg>
                <div className="absolute right-0 top-0 bottom-0 w-12 flex flex-col justify-between py-4">
                  {[1,2,3,4].map(i => <div key={i} className="h-2 w-8 ml-2 rounded bg-zinc-700/40 animate-pulse" />)}
                </div>
                <div className="absolute bottom-0 left-0 right-12 flex justify-between px-2 pb-1">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-2 w-6 rounded bg-zinc-700/40 animate-pulse" />)}
                </div>
              </div>
              <div className="flex items-center gap-4 px-3 pt-1 pb-3">
                {[
                  { swatch: "bg-emerald-400/60", w: "w-14" },
                  { swatch: "bg-[#FDE832]/60",   w: "w-16" },
                  { swatch: "bg-rose-400/60",     w: "w-20" },
                  { swatch: "bg-red-400/60 h-px", w: "w-14" },
                ].map(({ swatch, w }, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-sm ${swatch}`} />
                    <div className={`h-2 ${w} rounded bg-zinc-700/60 animate-pulse`} />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="sim"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: simLoading && !sim ? 0.5 : 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-zinc-800 bg-[#181D21] overflow-hidden flex flex-col flex-1"
          >
            <div className="px-5 pt-5 pb-4 border-b border-zinc-800/60">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wide mb-4">
                Simulated Returns
                <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="8" cy="8" r="7" /><path d="M8 7v4M8 5.5v.5" strokeLinecap="round" />
                </svg>
                <span className="ml-auto text-[10px] text-zinc-700 font-normal normal-case tracking-normal">estimate</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {WIN_CONFIGS.map(({ label, key, color, dot, border }) => (
                  <div key={key} className={`rounded-xl border ${border} bg-zinc-900/60 px-3 py-2.5`}>
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
                    </div>
                    <p className={`text-lg font-bold tabular-nums ${color}`}>
                      {sim ? `+${(sim[key as keyof SimResult] as number).toLocaleString()}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            {sim && sim.curve.length > 0 && (
              <div className="px-2 pt-2 pb-1 flex-1 flex flex-col">
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
                            {epss != null && <p className="text-emerald-400">EPSS spike → +{epss.toLocaleString()} sch</p>}
                            {cvss != null && <p className="text-[#FDE832]">CVSS event → +{cvss.toLocaleString()} sch</p>}
                            {mal  != null && <p className="text-rose-400">MAL → +{mal.toLocaleString()} sch</p>}
                            {sell != null && (
                              <p className={`font-medium border-t border-zinc-800 pt-1 mt-1 ${sell >= 0 ? "text-green-400" : "text-red-400"}`}>
                                Sell now → {sell >= 0 ? "+" : ""}{sell.toLocaleString()} sch
                              </p>
                            )}
                          </div>
                        )
                      }}
                    />
                    <Area stackId="win" type="monotone" dataKey="mal_win" stroke="#fb7185" strokeWidth={1} fill="url(#malGrad)" dot={false} activeDot={{ r: 3, fill: "#fb7185", stroke: "none" }} />
                    <Area stackId="win" type="monotone" dataKey="cvss_win" stroke="#FDE832" strokeWidth={1} fill="url(#cvssGrad)" dot={false} activeDot={{ r: 3, fill: "#FDE832", stroke: "none" }} />
                    <Area stackId="win" type="monotone" dataKey="epss_win" stroke="#34d399" strokeWidth={1} fill="url(#epssGrad)" dot={false} activeDot={{ r: 3, fill: "#34d399", stroke: "none" }} />
                    <Area type="monotone" dataKey="sell_pnl" stroke="#f87171" strokeWidth={2} fill="url(#sellGrad)" dot={false} activeDot={{ r: 4, fill: "#e4e4e7", stroke: "none" }} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 px-3 pt-1 pb-3 text-[10px] flex-wrap">
                  <span className="flex items-center gap-1 text-emerald-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/60" /> EPSS spike</span>
                  <span className="flex items-center gap-1 text-[#FDE832]"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#FDE832]/60" /> CVSS event</span>
                  <span className="flex items-center gap-1 text-rose-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/60" /> MAL</span>
                  <span className="flex items-center gap-1 text-red-400"><span className="inline-block h-px w-4 bg-red-400" /> Sell value</span>
                </div>
              </div>
            )}
            {simLoading && !sim && (
              <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">Calculating…</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  return (
    <div className="w-full flex flex-col h-full">
      <SignupPrompt open={showSignup} onClose={() => setShowSignup(false)} />

      {/* ── MOBILE LAYOUT ── */}
      <div className="flex flex-col h-full sm:hidden gap-2">

        {/* Search bar — always visible, clears selection on edit */}
        <div className={`rounded-xl border bg-[#181D21] px-3 py-2.5 transition-all ${
          selectedPkg ? "border-zinc-700" : "border-[#FDE832]/50 shadow-[0_0_0_1px_rgba(253,232,50,0.12)]"
        }`}>
          <div className="flex items-center gap-2">
            {selectedPkg && (
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${selectedPkg.ecosystem === "npm" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"}`}>
                {selectedPkg.ecosystem}
              </span>
            )}
            <input
              type="text"
              placeholder="Search package… (e.g. pandas, lodash)"
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (selectedPkg) setSelectedPkg(null) }}
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
            />
            {(search || selectedPkg) && (
              <button onClick={() => { setSearch(""); setSelectedPkg(null) }} className="shrink-0 text-zinc-600 hover:text-zinc-400 text-base leading-none">✕</button>
            )}
          </div>
          {search && !selectedPkg && (
            <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800 max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-zinc-600">{packages.length === 0 ? "Loading…" : "No results"}</p>
              ) : filtered.map((p) => (
                <button key={`${p.ecosystem}:${p.name}`}
                  onClick={() => { setSelectedPkg(p); setSearch(p.name) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50"
                >
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${p.ecosystem === "npm" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"}`}>{p.ecosystem}</span>
                  <span className="font-mono text-sm text-zinc-200">{p.name}</span>
                  {p.epss_score != null && <span className="ml-auto text-xs text-zinc-500">{Math.round(p.epss_score * 100)}%</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Compact controls — 3 columns */}
        {selectedPkg && (
          <div className="rounded-xl border border-zinc-800 bg-[#181D21] px-3 py-2.5 grid grid-cols-3 gap-x-3 gap-y-2.5">
            {/* Stake */}
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">Stake</p>
              <input type="number" min={10} max={schmeckles ?? 9999} step={10} value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-zinc-500 tabular-nums"
              />
            </div>
            {/* Duration */}
            <div>
              <p className="text-[10px] text-zinc-500 mb-1">Duration</p>
              <div className="flex gap-1">
                {DURATION_OPTIONS.map((d) => (
                  <button key={d} onClick={() => setDuration(d)}
                    className={`flex-1 rounded border py-1 text-[10px] font-medium transition-colors ${
                      duration === d ? "border-[#FDE832] bg-[#FDE832]/10 text-zinc-100" : "border-zinc-700 text-zinc-500"
                    }`}
                  >{d}d</button>
                ))}
              </div>
            </div>
            {/* Balance */}
            <div className="flex flex-col justify-center">
              {schmeckles != null && (
                <>
                  <p className="text-[10px] text-zinc-500">Balance</p>
                  <p className="text-xs font-semibold text-zinc-300 tabular-nums">{schmeckles.toLocaleString()}</p>
                </>
              )}
            </div>
            {/* CVSS slider — spans all 3 */}
            <div className="col-span-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-zinc-500">CVSS threshold</p>
                <span className="text-[10px] font-semibold text-zinc-300">≥ {cvssThreshold.toFixed(1)}</span>
              </div>
              <input type="range" min={1} max={10} step={0.1} value={cvssThreshold}
                onChange={(e) => setCvssThreshold(Number(e.target.value))} className="w-full accent-[#FDE832]" />
            </div>
            {/* EPSS slider — spans all 3 */}
            <div className="col-span-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] text-zinc-500">EPSS scenario</p>
                <span className={`text-[10px] font-semibold tabular-nums ${epssDrift > 1.5 ? "text-green-400" : "text-zinc-400"}`}>
                  {epssDrift >= 0.99 && epssDrift <= 1.01 ? "baseline" : `${epssDrift.toFixed(1)}× → ${(epssTarget * 100).toFixed(1)}%`}
                </span>
              </div>
              <input type="range" min={minPos} max={1} step={0.001} value={epssSliderPos}
                onChange={(e) => setEpssSliderPos(Math.max(minPos, Number(e.target.value)))} className="w-full accent-emerald-400" />
            </div>
          </div>
        )}

        {/* Returns panel — flex-1 fills remaining height */}
        <div className="flex-1 min-h-0 flex flex-col">
          {returnsPanel}
        </div>

        {/* Buy button pinned at bottom */}
        {selectedPkg && (
          <button onClick={buyContract}
            disabled={buying || (schmeckles != null && schmeckles < price)}
            className="w-full shrink-0 rounded-xl bg-[#FDE832] py-2.5 text-sm font-bold text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {buying ? "Buying…" : `Buy for ${price} schmeckles`}
          </button>
        )}
      </div>

      {/* ── DESKTOP LAYOUT ── */}
      <div className="hidden sm:block">
      {/* Page header */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#FDE832]">
            Build a Contract
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Predict a security event. Lock in your payout before it happens.
          </p>
        </div>
        {schmeckles != null && (
          <span className="text-xs text-zinc-500">
            Balance: <span className="font-semibold text-zinc-200">{schmeckles.toLocaleString()} sch</span>
          </span>
        )}
      </div>

      {/* Desktop two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-stretch">

        {/* ── LEFT PANEL: config ── */}
        <div className="w-full lg:w-[360px] lg:flex-shrink-0 space-y-4">

          {/* Package search */}
          <div className={`rounded-xl border bg-[#181D21] p-4 space-y-3 transition-all duration-200 ${
            selectedPkg
              ? "border-zinc-800"
              : "border-[#FDE832]/50 shadow-[0_0_0_1px_rgba(253,232,50,0.12),0_0_24px_rgba(253,232,50,0.06)]"
          }`}>
            <label className={`text-[10px] font-semibold uppercase tracking-wide ${selectedPkg ? "text-zinc-500" : "text-[#FDE832]"}`}>
              1. Package
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. pandas, lodash, requests…"
                value={search}
                autoFocus={!selectedPkg}
                onChange={(e) => {
                  setSearch(e.target.value)
                  if (selectedPkg && e.target.value !== selectedPkg.name) setSelectedPkg(null)
                }}
                className={`w-full rounded-lg border bg-[#1C2229] px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors ${
                  selectedPkg
                    ? "border-zinc-700 focus:border-zinc-500"
                    : "border-[#FDE832]/40 focus:border-[#FDE832]"
                }`}
              />
              {!selectedPkg && !search && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 pointer-events-none">
                  ↑ type to search
                </span>
              )}
            </div>
            {search && !selectedPkg && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800 max-h-52 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-zinc-600">
                    {packages.length === 0 ? "Loading packages…" : "No results"}
                  </p>
                ) : filtered.map((p) => (
                  <button
                    key={`${p.ecosystem}:${p.name}`}
                    onClick={() => { setSelectedPkg(p); setSearch(p.name) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50"
                  >
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${p.ecosystem === "npm" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"}`}>
                      {p.ecosystem}
                    </span>
                    <span className="font-mono text-sm text-zinc-200">{p.name}</span>
                    {p.epss_score != null && (
                      <span className="ml-auto text-xs text-zinc-500">EPSS {Math.round(p.epss_score * 100)}%</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selectedPkg && (
              <div className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${selectedPkg.ecosystem === "npm" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"}`}>
                  {selectedPkg.ecosystem}
                </span>
                <span className="font-mono text-sm text-zinc-100">{selectedPkg.name}</span>
                <span className="ml-auto text-xs text-zinc-500">
                  {selectedPkg.num_cves} CVEs · EPSS {selectedPkg.epss_score != null ? Math.round(selectedPkg.epss_score * 100) + "%" : ""}
                </span>
              </div>
            )}
          </div>

          {/* Left skeleton when no package */}
          {!selectedPkg && (
            <div className="space-y-4 pointer-events-none select-none">
              {/* Stake + Duration skeleton */}
              <div className="rounded-xl border border-zinc-700/60 bg-[#181D21] p-4 space-y-4">
                <div className="space-y-1.5">
                  <div className="h-2.5 w-24 rounded bg-zinc-700 animate-pulse" />
                  <div className="h-9 w-full rounded-lg bg-zinc-700/80 animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-2.5 w-16 rounded bg-zinc-700 animate-pulse" />
                  <div className="flex gap-2">
                    {[1,2,3].map(i => <div key={i} className="flex-1 h-9 rounded-lg bg-zinc-700/80 animate-pulse" />)}
                  </div>
                </div>
              </div>
              {/* CVSS slider skeleton */}
              <div className="rounded-xl border border-zinc-700/60 bg-[#181D21] p-4 space-y-3">
                <div className="flex justify-between">
                  <div className="h-2.5 w-28 rounded bg-zinc-700 animate-pulse" />
                  <div className="h-2.5 w-8 rounded bg-zinc-700 animate-pulse" />
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-700/80 animate-pulse" />
                <div className="flex justify-between gap-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-2 w-6 rounded bg-zinc-700/60 animate-pulse" />)}
                </div>
              </div>
              {/* EPSS slider skeleton */}
              <div className="rounded-xl border border-zinc-700/60 bg-[#181D21] p-4 space-y-3">
                <div className="flex justify-between">
                  <div className="h-2.5 w-28 rounded bg-zinc-700 animate-pulse" />
                  <div className="h-2.5 w-16 rounded bg-zinc-700 animate-pulse" />
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-700/80 animate-pulse" />
                <div className="flex justify-between gap-2">
                  {[1,2,3,4].map(i => <div key={i} className="h-2 w-6 rounded bg-zinc-700/60 animate-pulse" />)}
                </div>
              </div>
              {/* Buy button skeleton */}
              <div className="h-12 w-full rounded-xl bg-zinc-700/60 animate-pulse" />
            </div>
          )}

          <AnimatePresence>
            {selectedPkg && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="space-y-4"
              >
                {/* Stake + Duration */}
                <div className="rounded-xl border border-zinc-800 bg-[#181D21] p-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      Stake (schmeckles)
                    </label>
                    <input
                      type="number" min={10} max={schmeckles ?? 9999} step={10}
                      value={price}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      className="w-full rounded-lg border border-zinc-700 bg-[#1C2229] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-zinc-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      Duration
                    </label>
                    <div className="flex gap-2">
                      {DURATION_OPTIONS.map((d) => (
                        <button
                          key={d}
                          onClick={() => setDuration(d)}
                          className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                            duration === d
                              ? "border-[#FDE832] bg-[#FDE832]/10 text-zinc-100"
                              : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                          }`}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* CVSS threshold slider */}
                <div className="rounded-xl border border-zinc-800 bg-[#181D21] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      CVSS Threshold
                    </label>
                    <span className="text-xs font-semibold text-zinc-300">≥ {cvssThreshold.toFixed(1)}</span>
                  </div>
                  <input
                    type="range" min={1} max={10} step={0.1}
                    value={cvssThreshold}
                    onChange={(e) => setCvssThreshold(Number(e.target.value))}
                    className="w-full accent-[#FDE832]"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-600">
                    <span>1.0</span><span>Low</span><span>Med</span><span>High</span><span>10.0 Critical</span>
                  </div>
                </div>

                {/* EPSS scenario slider */}
                <div className="rounded-xl border border-zinc-800 bg-[#181D21] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      EPSS Scenario
                      {selectedPkg.epss_score != null && (
                        <span className="ml-2 normal-case tracking-normal text-zinc-400 font-normal">
                          now {(selectedPkg.epss_score * 100).toFixed(2)}%
                        </span>
                      )}
                    </label>
                    <span className={`text-xs font-semibold tabular-nums ${epssDrift > 1.5 ? "text-green-400" : "text-zinc-400"}`}>
                      {epssDrift >= 0.99 && epssDrift <= 1.01 ? "baseline" : `${epssDrift.toFixed(1)}× spike`}
                      <span className="ml-1.5 text-zinc-200">→ {(epssTarget * 100).toFixed(2)}%</span>
                    </span>
                  </div>
                  <input
                    type="range" min={minPos} max={1} step={0.001}
                    value={epssSliderPos}
                    onChange={(e) => setEpssSliderPos(Math.max(minPos, Number(e.target.value)))}
                    className="w-full accent-emerald-400"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-600">
                    <span>0.1%</span><span>1%</span><span>10%</span><span>100%</span>
                  </div>
                </div>

                {/* Buy button */}
                <button
                  onClick={buyContract}
                  disabled={buying || !selectedPkg || (schmeckles != null && schmeckles < price)}
                  className="w-full rounded-xl bg-[#FDE832] py-3.5 text-sm font-bold text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {buying ? "Buying…" : `Buy for ${price} schmeckles`}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── RIGHT PANEL: returns + chart ── */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {!selectedPkg ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-zinc-700/60 bg-[#181D21] overflow-hidden flex flex-col h-full"
              >
                {/* Returns header skeleton */}
                <div className="px-5 pt-5 pb-4 border-b border-zinc-800/60">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-2.5 w-32 rounded bg-zinc-700 animate-pulse" />
                    <div className="w-3.5 h-3.5 rounded-full bg-zinc-700/60 animate-pulse" />
                    <div className="ml-auto h-2 w-10 rounded bg-zinc-700/40 animate-pulse" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { border: "border-emerald-400/20", dot: "bg-emerald-400/40" },
                      { border: "border-[#FDE832]/20",   dot: "bg-[#FDE832]/40" },
                      { border: "border-rose-400/20",    dot: "bg-rose-400/40" },
                    ].map(({ border, dot }, i) => (
                      <div key={i} className={`rounded-xl border ${border} bg-zinc-900/60 px-4 py-3 space-y-2`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className={`w-2 h-2 rounded-full ${dot}`} />
                          <div className="h-2 w-16 rounded bg-zinc-700 animate-pulse" />
                        </div>
                        <div className="h-8 w-20 rounded bg-zinc-700/80 animate-pulse" />
                        <div className="h-2.5 w-14 rounded bg-zinc-700/60 animate-pulse mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Chart skeleton */}
                <div className="flex-1 px-2 pt-2 pb-1 flex flex-col">
                  <div className="flex-1 relative overflow-hidden rounded-lg">
                    {/* Muted filled areas mimicking the real stacked chart */}
                    <svg className="absolute inset-0 w-full h-full opacity-25" preserveAspectRatio="none" viewBox="0 0 100 100">
                      <path d="M0,95 Q25,70 50,55 T100,48 L100,100 L0,100 Z" fill="#fb7185" fillOpacity="0.25" stroke="#fb7185" strokeWidth="0.5" />
                      <path d="M0,85 Q25,55 50,35 T100,28 L100,100 L0,100 Z" fill="#FDE832" fillOpacity="0.2" stroke="#FDE832" strokeWidth="0.5" />
                      <path d="M0,70 Q25,38 50,18 T100,10 L100,100 L0,100 Z" fill="#34d399" fillOpacity="0.2" stroke="#34d399" strokeWidth="0.5" />
                      <line x1="0" y1="97" x2="100" y2="97" stroke="#f87171" strokeWidth="0.6" strokeDasharray="2 1" />
                    </svg>
                    {/* Axis tick skeletons */}
                    <div className="absolute right-0 top-0 bottom-0 w-12 flex flex-col justify-between py-4">
                      {[1,2,3,4].map(i => <div key={i} className="h-2 w-8 ml-2 rounded bg-zinc-700/40 animate-pulse" />)}
                    </div>
                    <div className="absolute bottom-0 left-0 right-12 flex justify-between px-2 pb-1">
                      {[1,2,3,4,5].map(i => <div key={i} className="h-2 w-6 rounded bg-zinc-700/40 animate-pulse" />)}
                    </div>
                  </div>
                  {/* Legend skeleton. matches real legend exactly */}
                  <div className="flex items-center gap-4 px-3 pt-1 pb-3">
                    {[
                      { swatch: "bg-emerald-400/60", w: "w-14" },
                      { swatch: "bg-[#FDE832]/60",   w: "w-16" },
                      { swatch: "bg-rose-400/60",     w: "w-20" },
                      { swatch: "bg-red-400/60 h-px", w: "w-14" },
                    ].map(({ swatch, w }, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-sm ${swatch}`} />
                        <div className={`h-2 ${w} rounded bg-zinc-700/60 animate-pulse`} />
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="sim"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: simLoading && !sim ? 0.5 : 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-zinc-800 bg-[#181D21] overflow-hidden flex flex-col h-full"
              >
                {/* Returns header */}
                <div className="px-5 pt-5 pb-4 border-b border-zinc-800/60">
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wide mb-4">
                    Simulated Returns
                    <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                      <circle cx="8" cy="8" r="7" /><path d="M8 7v4M8 5.5v.5" strokeLinecap="round" />
                    </svg>
                    <span className="ml-auto text-[10px] text-zinc-700 font-normal normal-case tracking-normal">estimate</span>
                  </div>

                  {/* Three win cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {WIN_CONFIGS.map(({ label, key, color, dot, border }) => (
                      <div key={key} className={`rounded-xl border ${border} bg-zinc-900/60 px-4 py-3 flex sm:flex-col items-center sm:items-start gap-3 sm:gap-0`}>
                        <div className="flex items-center gap-1.5 sm:mb-2 shrink-0">
                          <span className={`w-2 h-2 rounded-full ${dot}`} />
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
                        </div>
                        <div className="flex items-baseline gap-3 sm:flex-col sm:gap-0">
                          <p className={`text-2xl font-bold tabular-nums ${color}`}>
                            {sim ? `+${(sim[key as keyof SimResult] as number).toLocaleString()}` : ""}
                          </p>
                          <p className="text-[11px] text-zinc-600 sm:mt-1">
                            {sim ? `${(price > 0 ? ((sim[key as keyof SimResult] as number) / price + 1).toFixed(1) : "")}× if YES` : "calculating…"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chart */}
                {sim && sim.curve.length > 0 && (
                  <div className="px-2 pt-2 pb-1 flex-1 flex flex-col">
                    <ResponsiveContainer width="100%" height="100%" minHeight={260}>
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

                        <XAxis
                          dataKey="label"
                          tick={{ fill: "#52525b", fontSize: 10 }}
                          axisLine={false} tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          orientation="right"
                          tick={{ fill: "#52525b", fontSize: 10 }}
                          axisLine={false} tickLine={false}
                          tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${(v / 1000).toFixed(0)}k`}
                          domain={[sim.y_min, sim.y_max]}
                          allowDataOverflow={false}
                          width={52}
                        />

                        <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
                        <ReferenceLine
                          y={sim.max_loss}
                          stroke="#f87171" strokeDasharray="4 3" strokeWidth={1}
                          label={{ value: "MAX LOSS", position: "insideBottomRight", fill: "#f87171", fontSize: 9, fontWeight: 700 }}
                        />

                        <ReTooltip
                          cursor={{ stroke: "#71717a", strokeWidth: 1, strokeDasharray: "3 3" }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null
                            const get = (key: string) => payload.find((p) => p.dataKey === key)?.value as number | undefined
                            const sell = get("sell_pnl")
                            const epss = get("epss_win")
                            const cvss = get("cvss_win")
                            const mal  = get("mal_win")
                            return (
                              <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg space-y-1">
                                <p className="text-zinc-400 font-medium">{label}</p>
                                {epss != null && <p className="text-emerald-400">EPSS spike → +{epss.toLocaleString()} sch</p>}
                                {cvss != null && <p className="text-[#FDE832]">CVSS event → +{cvss.toLocaleString()} sch</p>}
                                {mal  != null && <p className="text-rose-400">MAL → +{mal.toLocaleString()} sch</p>}
                                {sell != null && (
                                  <p className={`font-medium border-t border-zinc-800 pt-1 mt-1 ${sell >= 0 ? "text-green-400" : "text-red-400"}`}>
                                    Sell now → {sell >= 0 ? "+" : ""}{sell.toLocaleString()} sch
                                  </p>
                                )}
                              </div>
                            )
                          }}
                        />

                        <Area stackId="win" type="monotone" dataKey="mal_win"
                          stroke="#fb7185" strokeWidth={1}
                          fill="url(#malGrad)" dot={false}
                          activeDot={{ r: 3, fill: "#fb7185", stroke: "none" }}
                        />
                        <Area stackId="win" type="monotone" dataKey="cvss_win"
                          stroke="#FDE832" strokeWidth={1}
                          fill="url(#cvssGrad)" dot={false}
                          activeDot={{ r: 3, fill: "#FDE832", stroke: "none" }}
                        />
                        <Area stackId="win" type="monotone" dataKey="epss_win"
                          stroke="#34d399" strokeWidth={1}
                          fill="url(#epssGrad)" dot={false}
                          activeDot={{ r: 3, fill: "#34d399", stroke: "none" }}
                        />
                        <Area type="monotone" dataKey="sell_pnl"
                          stroke="#f87171" strokeWidth={2}
                          fill="url(#sellGrad)" dot={false}
                          activeDot={{ r: 4, fill: "#e4e4e7", stroke: "none" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>

                    {/* Legend */}
                    <div className="flex items-center gap-4 px-3 pt-1 pb-3 text-[10px] flex-wrap">
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/60" /> EPSS spike
                      </span>
                      <span className="flex items-center gap-1 text-[#FDE832]">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#FDE832]/60" /> CVSS event
                      </span>
                      <span className="flex items-center gap-1 text-rose-400">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/60" /> MAL
                      </span>
                      <span className="flex items-center gap-1 text-red-400">
                        <span className="inline-block h-px w-4 bg-red-400" /> Sell value
                      </span>
                    </div>
                  </div>
                )}

                {/* Loading state when no sim yet */}
                {simLoading && !sim && (
                  <div className="flex items-center justify-center h-64 text-zinc-600 text-sm">
                    Calculating…
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </div>{/* end hidden sm:block */}
    </div>
  )
}
