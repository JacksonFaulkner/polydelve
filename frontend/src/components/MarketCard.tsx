import { SchmeckleIcon } from "./SchmeckleIcon"
import type { Market } from "@/types"

interface Props {
  market: Market
  onBet: (market: Market) => void
}

export function MarketCard({ market, onBet }: Props) {
  const currentProb = market.probability_history.at(-1)?.prob ?? 0
  const daysLeft = Math.ceil(
    (new Date(market.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const multiplier = (market.payout / market.price).toFixed(1)

  return (
    <div className="rounded-xl border border-zinc-700/40 bg-[#181D21] p-4 hover:border-zinc-700 transition-colors">
      <div className="mb-3 flex items-center gap-2">
        <img src={market.company.logo} alt={market.company.title} className="h-5 w-5 object-contain invert opacity-70" />
        <span className="text-xs text-zinc-500">{market.company.title}</span>
        <span className="ml-auto text-xs text-zinc-600">{daysLeft}d left</span>
      </div>

      <p className="mb-4 text-sm font-medium leading-snug text-zinc-100">{market.title}</p>

      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <div>
            <span className="text-zinc-500 text-xs">Prob </span>
            <span className="font-semibold text-white">{Math.round(currentProb * 100)}%</span>
          </div>
          <div>
            <span className="text-zinc-500 text-xs">Win </span>
            <span className="font-semibold text-emerald-400">{multiplier}×</span>
          </div>
        </div>
        <button
          onClick={() => onBet(market)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition-colors"
        >
          Bet {market.price} <SchmeckleIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
