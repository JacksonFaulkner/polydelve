import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts"
import type { Package } from "@/types"

const API = import.meta.env.VITE_API_URL ?? "/api"
const USER_ID = "default-user"

const DURATION_OPTIONS = [7, 14, 30]

interface SimCurvePoint {
  label: string
  sell_pnl: number
  epss_win: number
  cvss_win: number
  kev_win: number
  mal_win: number
}

interface SimResult {
  epss_payout: number
  cvss_payout: number
  kev_payout: number
  mal_payout: number
  epss_win: number
  cvss_win: number
  kev_win: number
  mal_win: number
  max_win: number
  max_loss: number
  y_min: number
  y_max: number
  curve: SimCurvePoint[]
}

export function PredictPage() {
  const [packages, setPackages] = useState<Package[]>([])
  const [search, setSearch] = useState("")
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)
  const [cvssThreshold, setCvssThreshold] = useState(7.0)
  const [price, setPrice] = useState(100)
  const [duration, setDuration] = useState(30)
  const [epssDrift, setEpssDrift] = useState(1.0)
  const [buying, setBuying] = useState(false)
  const [schmeckles, setSchmeckles] = useState<number | null>(null)
  const [sim, setSim] = useState<SimResult | null>(null)
  const [simLoading, setSimLoading] = useState(false)

  useEffect(() => {
    if (!selectedPkg) { setSim(null); return }
    const t = setTimeout(async () => {
      setSimLoading(true)
      try {
        const res = await fetch(`${API}/contracts/simulate`, {
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
  }, [selectedPkg, cvssThreshold, price, duration, epssDrift])

  const maxEpssDrift = selectedPkg?.epss_score != null && selectedPkg.epss_score > 0
    ? Math.min(10, Math.floor((1.0 / selectedPkg.epss_score) * 10) / 10)
    : 10.0

  useEffect(() => {
    if (!selectedPkg) setEpssDrift(1.0)
    else setEpssDrift(prev => Math.min(prev, maxEpssDrift))
  }, [selectedPkg, maxEpssDrift])

  useEffect(() => {
    fetch(`${API}/packages?sort=weekly_downloads&page_size=500&has_cves=true`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((d) => setPackages(d.packages ?? []))
      .catch((e) => console.error("packages fetch failed:", e))
  }, [])

  const refreshUser = useCallback(() => {
    fetch(`${API}/users/${USER_ID}`)
      .then((r) => r.json())
      .then((d) => setSchmeckles(d.schmeckles))
      .catch(() => {})
  }, [])

  useEffect(() => { refreshUser() }, [refreshUser])

  const filtered = packages.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20)

  async function buyContract() {
    if (!selectedPkg) return
    setBuying(true)
    try {
      await fetch(`${API}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: USER_ID,
          package_name: selectedPkg.name,
          ecosystem: selectedPkg.ecosystem,
          cvss_threshold: cvssThreshold,
          epss_threshold: null,
          purchase_price: price,
          duration_days: duration,
        }),
      })
      setSelectedPkg(null)
      refreshUser()
    } finally {
      setBuying(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between">
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

      {/* Step 1: pick package */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          1 — Package
        </label>
        <input
          type="text"
          placeholder="Search packages…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            if (selectedPkg && e.target.value !== selectedPkg.name) setSelectedPkg(null)
          }}
          className="w-full rounded-lg border border-zinc-700 bg-[#1C2229] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
        />
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
              {selectedPkg.num_cves} CVEs · EPSS {selectedPkg.epss_score != null ? Math.round(selectedPkg.epss_score * 100) + "%" : "—"}
            </span>
          </div>
        )}
      </div>

      {/* Combined contract card — stake, duration, sliders, chart all in one */}
      <AnimatePresence>
        {selectedPkg && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: simLoading && !sim ? 0.4 : 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-xl border border-zinc-800 bg-[#181D21] overflow-hidden"
          >
            {/* Win summary header */}
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-semibold uppercase tracking-wide">
                Simulated Returns
                <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                  <circle cx="8" cy="8" r="7" /><path d="M8 7v4M8 5.5v.5" strokeLinecap="round" />
                </svg>
                <span className="ml-auto text-[10px] text-zinc-700 font-normal normal-case tracking-normal">estimate</span>
              </div>

              {/* Three win amounts in a row */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { label: "EPSS spike",  key: "epss_win", color: "text-emerald-400", dot: "bg-emerald-400" },
                  { label: "CVSS event",  key: "cvss_win", color: "text-[#FDE832]",   dot: "bg-[#FDE832]" },
                  { label: "KEV listed",  key: "kev_win",  color: "text-purple-400",  dot: "bg-purple-400" },
                  { label: "MAL advisory",key: "mal_win",  color: "text-rose-400",    dot: "bg-rose-400" },
                ] .map(({ label, key, color, dot }) => (
                  <div key={key} className="rounded-lg bg-zinc-800/50 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
                    </div>
                    <p className={`text-lg font-bold tabular-nums ${color}`}>
                      {sim ? `+${(sim[key as keyof SimResult] as number).toLocaleString()}` : "—"}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      {sim ? `${(price > 0 ? ((sim[key as keyof SimResult] as number) / price + 1).toFixed(1) : "—")}× if YES` : "calculating…"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Stake + Duration row */}
            <div className="px-5 pb-4 pt-1 grid grid-cols-2 gap-4 border-t border-zinc-800/60">
              <div className="space-y-1.5 pt-3">
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
              <div className="space-y-1.5 pt-3">
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
            <div className="px-5 pb-3 space-y-2 border-t border-zinc-800/60 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  CVSS Threshold
                  <span className="ml-2 text-zinc-300">≥ {cvssThreshold.toFixed(1)}</span>
                </label>
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
            <div className="px-5 pb-3 space-y-2 border-t border-zinc-800/60 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  EPSS Scenario
                  {selectedPkg.epss_score != null && (
                    <span className="ml-2 normal-case tracking-normal text-zinc-400">
                      now {(selectedPkg.epss_score * 100).toFixed(1)}%
                    </span>
                  )}
                </label>
                <span className={`text-xs font-semibold tabular-nums ${
                  epssDrift > 1.5 ? "text-green-400" : epssDrift < 0.75 ? "text-red-400" : "text-zinc-400"
                }`}>
                  {epssDrift === 1.0 ? "baseline"
                    : epssDrift > 1.0
                      ? `+${Math.round((epssDrift - 1) * 100)}% spike`
                      : `−${Math.round((1 - epssDrift) * 100)}% drop`
                  }
                  {selectedPkg.epss_score != null && (
                    <span className="ml-1.5 text-zinc-200">
                      → {((selectedPkg.epss_score * epssDrift) * 100).toFixed(1)}%
                    </span>
                  )}
                </span>
              </div>
              <input
                type="range" min={0.1} max={maxEpssDrift} step={0.01}
                value={epssDrift}
                onChange={(e) => setEpssDrift(Number(e.target.value))}
                className="w-full accent-emerald-400"
              />
              <div className="flex justify-between text-[10px] text-zinc-600">
                <span>0.1× quiet</span>
                <span>{(maxEpssDrift * 0.25).toFixed(1)}×</span>
                <span>{(maxEpssDrift * 0.5).toFixed(1)}×</span>
                <span>{maxEpssDrift.toFixed(1)}× max</span>
              </div>
            </div>

            {/* Stacked area chart */}
            {sim && sim.curve.length > 0 && (
              <div className="px-2 pb-1 border-t border-zinc-800/60">
                <ResponsiveContainer width="100%" height={220}>
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
                      <linearGradient id="kevGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity={0.1} />
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
                        const kev  = get("kev_win")
                        const mal  = get("mal_win")
                        return (
                          <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg space-y-1">
                            <p className="text-zinc-400 font-medium">{label}</p>
                            {epss != null && <p className="text-emerald-400">EPSS spike → +{epss.toLocaleString()} sch</p>}
                            {cvss != null && <p className="text-[#FDE832]">CVSS event → +{cvss.toLocaleString()} sch</p>}
                            {kev  != null && <p className="text-purple-400">KEV listed → +{kev.toLocaleString()} sch</p>}
                            {mal  != null && <p className="text-rose-400">MAL advisory → +{mal.toLocaleString()} sch</p>}
                            {sell != null && (
                              <p className={`font-medium border-t border-zinc-800 pt-1 mt-1 ${sell >= 0 ? "text-green-400" : "text-red-400"}`}>
                                Sell now → {sell >= 0 ? "+" : ""}{sell.toLocaleString()} sch
                              </p>
                            )}
                          </div>
                        )
                      }}
                    />

                    {/* Stacked win areas: MAL (bottom), KEV, CVSS, EPSS (top) */}
                    <Area stackId="win" type="monotone" dataKey="mal_win"
                      stroke="#fb7185" strokeWidth={1}
                      fill="url(#malGrad)" dot={false}
                      activeDot={{ r: 3, fill: "#fb7185", stroke: "none" }}
                    />
                    <Area stackId="win" type="monotone" dataKey="kev_win"
                      stroke="#a855f7" strokeWidth={1}
                      fill="url(#kevGrad)" dot={false}
                      activeDot={{ r: 3, fill: "#a855f7", stroke: "none" }}
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

                    {/* Sell decay — not stacked */}
                    <Area type="monotone" dataKey="sell_pnl"
                      stroke="#f87171" strokeWidth={2}
                      fill="url(#sellGrad)" dot={false}
                      activeDot={{ r: 4, fill: "#e4e4e7", stroke: "none" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="flex items-center gap-4 px-3 pt-1 pb-2 text-[10px] flex-wrap">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/60" /> EPSS spike
                  </span>
                  <span className="flex items-center gap-1 text-[#FDE832]">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#FDE832]/60" /> CVSS event
                  </span>
                  <span className="flex items-center gap-1 text-purple-400">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-purple-400/60" /> KEV listed
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/60" /> MAL advisory
                  </span>
                  <span className="flex items-center gap-1 text-red-400">
                    <span className="inline-block h-px w-4 bg-red-400" /> Sell value
                  </span>
                </div>
              </div>
            )}

            {/* Buy button */}
            <div className="px-5 pt-2 pb-5">
              <button
                onClick={buyContract}
                disabled={buying || !selectedPkg || (schmeckles != null && schmeckles < price)}
                className="w-full rounded-lg bg-[#FDE832] py-3 text-sm font-bold text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {buying ? "Buying…" : `Buy for ${price} schmeckles`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
