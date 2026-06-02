import { SchmeckleIcon } from "./SchmeckleIcon"
import type { Market } from "@/types"

function fmtDownloads(n: number | null): string {
  if (n == null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M/wk`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k/wk`
  return `${n}/wk`
}

function conditionLabel(market: Market): string {
  const { cvss_threshold, epss_threshold, duration_days } = market.contract
  if (cvss_threshold != null) return `CVSS ≥ ${cvss_threshold} · ${duration_days}d`
  if (epss_threshold != null) return `EPSS ≥ ${(epss_threshold * 100).toFixed(0)}% · ${duration_days}d`
  return `${duration_days}d contract`
}

interface Props {
  market: Market
  onBet: (market: Market) => void
}

export function MarketCard({ market, onBet }: Props) {
  const multiplier = (market.max_payout / market.contract.purchase_price).toFixed(1)
  const { name, ecosystem, epss_score, weekly_downloads, has_mal_advisory } = market.package

  return (
    <div className="rounded-xl border border-zinc-700/40 bg-[#181D21] p-4 hover:border-zinc-700 transition-colors">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-xs font-semibold text-zinc-200">{name}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          ecosystem === "PyPI" ? "bg-blue-900/50 text-blue-300" : "bg-red-900/50 text-red-300"
        }`}>{ecosystem}</span>
        {has_mal_advisory && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-rose-900/50 text-rose-300">MAL</span>
        )}
        <span className="ml-auto text-[10px] text-zinc-600">{conditionLabel(market)}</span>
      </div>

      <p className="mb-3 text-sm font-medium leading-snug text-zinc-100">{market.title}</p>

      <div className="mb-3 flex gap-3 text-[10px] text-zinc-500">
        {epss_score != null && (
          <span>EPSS <span className="text-zinc-300 font-semibold">{(epss_score * 100).toFixed(1)}%</span></span>
        )}
        <span>{fmtDownloads(weekly_downloads)}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-zinc-500 text-xs">Win </span>
            <span className="font-semibold text-emerald-400">{multiplier}×</span>
          </div>
        </div>
        <button
          onClick={() => onBet(market)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors"
        >
          Bet {market.contract.purchase_price} <SchmeckleIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
