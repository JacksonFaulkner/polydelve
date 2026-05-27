import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { SchmeckleIcon } from "./SchmeckleIcon"
import type { Market } from "@/types"

interface Props {
  market: Market
  onBet: (market: Market) => void
}

export function FeaturedMarket({ market, onBet }: Props) {
  const currentProb = market.probability_history.at(-1)?.prob ?? 0
  const daysLeft = Math.ceil(
    (new Date(market.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const multiplier = (market.payout / market.price).toFixed(1)

  return (
    <div className="rounded-xl border border-zinc-700/40 bg-[#181D21] p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
          <img src={market.company.logo} alt={market.company.title} className="h-8 w-8 object-contain invert" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs text-zinc-500">{market.company.title}</span>
          </div>
          <h2 className="text-base font-semibold leading-snug text-white">{market.title}</h2>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-6 text-sm">
        <div>
          <p className="text-zinc-500 text-xs">Probability</p>
          <p className="text-2xl font-bold text-white">{Math.round(currentProb * 100)}%</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs">Payout</p>
          <p className="text-lg font-semibold text-emerald-400">{multiplier}×</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs">Price</p>
          <p className="text-lg font-semibold text-white">{market.price} <SchmeckleIcon /></p>
        </div>
        <div className="ml-auto">
          <p className="text-zinc-500 text-xs">Ends in</p>
          <p className="text-lg font-semibold text-white">{daysLeft}d</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={market.probability_history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[0, 1]} />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 12 }}
            formatter={(v: number) => [`${Math.round(v * 100)}%`, "probability"]}
          />
          <Line type="monotone" dataKey="prob" stroke="#FDE832" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-zinc-500">{market.bet_count.toLocaleString()} bets</span>
        <button
          onClick={() => onBet(market)}
          className="rounded-lg bg-[#FDE832] px-5 py-2 text-sm font-semibold text-white hover:bg-[#D4C020] transition-colors"
        >
          Bet {market.price} <SchmeckleIcon />
        </button>
      </div>
    </div>
  )
}
