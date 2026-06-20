import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import EpssChart from "./EpssChart"
import { SchmeckleIcon } from "./SchmeckleIcon"
import type { Market, PackageDetail } from "@/types"
import { useApi } from "@/lib/api"

interface Props {
  markets: Market[]
  onBet: (market: Market) => void
  showTitle?: boolean
}

type EpssChartData = {
  chartData: { date: string; epss: number; cvss: number | null; severity: string | null; cve_id: string | null }[]
  scatterData: { date: string; epss: number; cvss: number | null; severity: string | null; cve_id: string | null }[]
}

function buildChartData(detail: PackageDetail): EpssChartData | null {
  if (!detail.epss_history || detail.epss_history.length < 2) return null
  const epssStart = detail.epss_history[0].date
  const epssEnd = detail.epss_history[detail.epss_history.length - 1].date
  const chartData = detail.epss_history.map((pt) => ({
    date: pt.date, epss: pt.epss,
    cvss: null as number | null, severity: null as string | null, cve_id: null as string | null,
  }))
  const scatterData = detail.cve_history
    .filter((c) => c.published_date && c.cvss_score != null)
    .map((c) => ({ date: c.published_date!.slice(0, 10), epss: 0, cvss: c.cvss_score, severity: c.severity, cve_id: c.cve_id }))
    .filter((c) => c.date >= epssStart && c.date <= epssEnd)
  return { chartData, scatterData }
}

export function MarketSpotlight({ markets, onBet, showTitle = true }: Props) {
  const { authFetch } = useApi()
  const [index, setIndex] = useState(0)
  const [details, setDetails] = useState<Record<string, PackageDetail | null>>({})

  const market = markets[Math.min(index, markets.length - 1)]

  useEffect(() => {
    if (!market) return
    const key = `${market.package.ecosystem}/${market.package.name}`
    if (key in details) return
    authFetch(`/packages/${market.package.ecosystem}/${encodeURIComponent(market.package.name)}`)
      .then((r) => r.json())
      .then((d: PackageDetail) => setDetails((prev) => ({ ...prev, [key]: d })))
      .catch(() => setDetails((prev) => ({ ...prev, [key]: null })))
  }, [market, details])

  // Auto-advance at a random cadence; manual dot clicks reset the timer
  // because the effect re-runs whenever index changes. Each card instance
  // gets its own phase offset so cards mounted together don't flip in sync.
  const [phase] = useState(() => Math.random() * 10000)
  useEffect(() => {
    if (markets.length < 2) return
    const t = setTimeout(
      () => setIndex((i) => (i + 1) % markets.length),
      6000 + phase + Math.random() * 6000,
    )
    return () => clearTimeout(t)
  }, [index, markets.length, phase])

  if (!market) return null

  const { purchase_price, duration_days } = market.contract
  const multiplier = (market.max_payout / purchase_price).toFixed(1)
  const detail = details[`${market.package.ecosystem}/${market.package.name}`]
  const chart = detail ? buildChartData(detail) : null

  return (
    <div className="rounded-xl border border-zinc-700/40 bg-[#181D21] p-4">
      {showTitle && (
        <div className="mb-3">
          <span className="text-xs font-bold uppercase tracking-widest text-[#FDE832]">Spotlight</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={market.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
        >
      <div className="mb-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-sm font-semibold text-zinc-100">{market.package.name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              market.package.ecosystem === "PyPI" ? "bg-blue-900/50 text-blue-300" : "bg-red-900/50 text-red-300"
            }`}>{market.package.ecosystem}</span>
            {market.package.has_mal_advisory && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-rose-900/50 text-rose-300">MAL</span>
            )}
            {market.package.epss_score != null && (
              <span className="text-[10px] text-zinc-400">EPSS <span className="text-zinc-300">{(market.package.epss_score * 100).toFixed(1)}%</span></span>
            )}
            <span className="text-[10px] text-zinc-400">Payout <span className="text-emerald-400">{multiplier}×</span></span>
            <span className="text-[10px] text-zinc-400">Price <span className="text-zinc-300">{purchase_price} <SchmeckleIcon className="inline h-3 w-3" /></span></span>
            <span className="text-[10px] text-zinc-400">Duration <span className="text-zinc-300">{duration_days}d</span></span>
          </div>
          <h2 className="text-sm font-medium leading-snug text-zinc-100">{market.title}</h2>
        </div>
      </div>

      <div className="relative flex" style={{ height: 180 }}>
        {chart ? (
          <EpssChart data={chart.chartData} cveData={chart.scatterData} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-zinc-600">
            {detail === undefined ? "Loading EPSS history…" : "No EPSS history for this package"}
          </div>
        )}
      </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="shrink-0 text-xs text-zinc-400">{market.bet_count.toLocaleString()} bets</span>
        {markets.length > 1 && (
          <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
            {markets.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setIndex(i)}
                aria-label={`Go to market ${i + 1}`}
                className={`h-2.5 rounded-full transition-all ${
                  i === index ? "w-7 bg-[#FDE832]" : "w-2.5 bg-zinc-700 hover:bg-zinc-500"
                }`}
              />
            ))}
          </div>
        )}
        <button
          onClick={() => onBet(market)}
          className="shrink-0 rounded-lg bg-[#FDE832] px-5 py-2 text-sm font-semibold text-white hover:bg-[#D4C020] transition-colors"
        >
          Bet {purchase_price} <SchmeckleIcon />
        </button>
      </div>
    </div>
  )
}
