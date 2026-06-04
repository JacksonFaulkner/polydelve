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
  payload?: readonly any[]
  label?: string | number
  events: MarketEvent[]
}) {
  const labelStr = String(label ?? "")
  if (!active || !payload?.length) return null
  const prob = payload[0].value
  const event = events.find((e) => e.date === labelStr)

  return (
    <div style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, padding: "8px 12px", fontSize: 12, maxWidth: 280 }}>
      <p style={{ color: "#71717a", marginBottom: 4 }}>{labelStr}</p>
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
  const { purchase_price, duration_days } = market.contract
  const multiplier = (market.max_payout / purchase_price).toFixed(1)

  return (
    <div className="rounded-xl border border-zinc-700/40 bg-[#181D21] p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-[#FDE832]">Spotlight</span>
      </div>

      <div className="mb-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-100">{market.package.name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              market.package.ecosystem === "PyPI" ? "bg-blue-900/50 text-blue-300" : "bg-red-900/50 text-red-300"
            }`}>{market.package.ecosystem}</span>
            {market.package.has_mal_advisory && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-rose-900/50 text-rose-300">MAL</span>
            )}
            {market.package.epss_score != null && (
              <span className="text-[10px] text-zinc-500">EPSS <span className="text-zinc-300">{(market.package.epss_score * 100).toFixed(1)}%</span></span>
            )}
          </div>
          <h2 className="text-sm font-medium leading-snug text-zinc-100">{market.title}</h2>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-zinc-500 text-xs">Payout</p>
          <p className="text-xl font-semibold text-emerald-400">{multiplier}×</p>
        </div>
        <div>
          <p className="text-zinc-500 text-xs">Price</p>
          <p className="text-xl font-semibold text-white">{purchase_price} <SchmeckleIcon /></p>
        </div>
        <div className="sm:ml-auto text-right">
          <p className="text-zinc-500 text-xs">Duration</p>
          <p className="text-xl font-semibold text-white">{duration_days}d</p>
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
              if (!market.events.some((e) => e.date === String(payload.date))) return <g key={payload.date} />
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
          Bet {purchase_price} <SchmeckleIcon />
        </button>
      </div>
    </div>
  )
}
