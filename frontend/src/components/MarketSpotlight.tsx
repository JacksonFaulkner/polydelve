import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { SchmeckleIcon } from "./SchmeckleIcon"
import type { MarketEvent, SpotlightMarket } from "@/types"

interface Props {
  market: SpotlightMarket
  onBet: (market: SpotlightMarket) => void
}

function EventTooltip({ active, payload, label, events }: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?: string
  events: MarketEvent[]
}) {
  if (!active || !payload?.length) return null
  const prob = payload[0].value
  const event = events.find((e) => e.date === label)

  return (
    <div style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, padding: "8px 12px", fontSize: 12, maxWidth: 280 }}>
      <p style={{ color: "#71717a", marginBottom: 4 }}>{label}</p>
      <p style={{ color: "white", fontWeight: 600 }}>{Math.round(prob * 100)}% probability</p>
      {event && (
        <div style={{ marginTop: 8, borderTop: "1px solid #3f3f46", paddingTop: 8 }}>
          <p style={{ color: "#FDE832", fontWeight: 600, marginBottom: 4 }}>{event.label}</p>
          <p style={{ color: "#71717a", lineHeight: 1.4 }}>{event.note}</p>
        </div>
      )}
    </div>
  )
}

export function MarketSpotlight({ market, onBet }: Props) {
  const currentProb = market.probability_history[market.probability_history.length - 1]?.prob ?? 0
  const daysLeft = Math.ceil(
    (new Date(market.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const multiplier = (market.payout / market.price).toFixed(1)

  return (
    <div className="rounded-xl border border-zinc-700/40 bg-[#181D21] p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-[#FDE832]">Spotlight</span>
      </div>

      <div className="mb-4 flex items-start gap-3">
        <img src={market.company.logo} alt={market.company.title} className="h-12 shrink-0 object-contain" />
        <div className="flex-1 min-w-0">
          <span className="text-xs text-zinc-500">{market.company.title}</span>
          <h2 className="text-sm font-medium leading-snug text-zinc-100">{market.title}</h2>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-6">
        <div>
          <p className="text-zinc-500 text-xs">Probability</p>
          <p className="text-3xl font-bold text-white">{Math.round(currentProb * 100)}%</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs">Payout</p>
          <p className="text-xl font-semibold text-emerald-400">{multiplier}×</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs">Price</p>
          <p className="text-xl font-semibold text-white">{market.price} <SchmeckleIcon /></p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-zinc-500 text-xs">Ends in</p>
          <p className="text-xl font-semibold text-white">{daysLeft}d</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={market.probability_history} margin={{ top: 16, right: 48, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#27272a" strokeDasharray="3 3" />
          <XAxis dataKey="date" hide />
          <YAxis
            orientation="right"
            domain={["auto", "auto"]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={(props) => <EventTooltip {...props} events={market.events} />} />
          <Line
            type="monotone"
            dataKey="prob"
            stroke="#FDE832"
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, payload } = props
              if (!market.events.some((e) => e.date === payload.date)) return <g key={payload.date} />
              return <circle key={payload.date} cx={cx} cy={cy} r={5} fill="#FDE832" stroke="#111111" strokeWidth={2} />
            }}
          />
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
