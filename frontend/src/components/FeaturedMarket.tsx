import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { SchmeckleIcon } from "./SchmeckleIcon"
import type { Market } from "@/types"

interface Props {
  market: Market
  onBet: (market: Market) => void
}

export function FeaturedMarket({ market, onBet }: Props) {
  const history = market.probability_history
  const currentProb = history[history.length - 1]?.prob ?? 0
  const { purchase_price, duration_days } = market.contract
  const multiplier = (market.max_payout / purchase_price).toFixed(1)
  const { name, ecosystem, epss_score } = market.package

  return (
    <div className="rounded-xl border border-zinc-700/40 bg-[#181D21] p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-zinc-200">{name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              ecosystem === "PyPI" ? "bg-blue-900/50 text-blue-300" : "bg-red-900/50 text-red-300"
            }`}>{ecosystem}</span>
            {epss_score != null && (
              <span className="text-[10px] text-zinc-500">EPSS <span className="text-zinc-300">{(epss_score * 100).toFixed(1)}%</span></span>
            )}
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
          <p className="text-lg font-semibold text-white">{purchase_price} <SchmeckleIcon /></p>
        </div>
        <div className="ml-auto">
          <p className="text-zinc-500 text-xs">Duration</p>
          <p className="text-lg font-semibold text-white">{duration_days}d</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={market.probability_history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[0, 1]} />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 12 }}
            formatter={(v) => [`${Math.round(Number(v) * 100)}%`, "probability"]}
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
          Bet {purchase_price} <SchmeckleIcon />
        </button>
      </div>
    </div>
  )
}
