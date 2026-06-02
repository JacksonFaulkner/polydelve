import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts"
import type { SchmecklePoint } from "@/types"

const EVENT_COLOR: Record<string, string> = {
  won: "#4ade80",
  sold: "#facc15",
  buy: "#f87171",
}

interface TooltipProps {
  active?: boolean
  payload?: { payload: SchmecklePoint }[]
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const pt = payload[0].payload
  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs shadow">
      <p className="text-zinc-400">{pt.date}</p>
      <p className="font-semibold text-[#FDE832] tabular-nums">{pt.balance.toLocaleString()} sch</p>
      {pt.event && (
        <p className="capitalize" style={{ color: EVENT_COLOR[pt.event] ?? "#a1a1aa" }}>
          {pt.event}
        </p>
      )}
    </div>
  )
}

export function SchmeckleTimeline({ points }: { points: SchmecklePoint[] }) {
  if (points.length < 2) return (
    <p className="py-6 text-center text-xs text-zinc-600">Not enough history</p>
  )

  const balances = points.map((p) => p.balance)
  const min = Math.min(...balances)
  const max = Math.max(...balances)
  const yPad = Math.max(100, Math.round((max - min) * 0.1))
  const events = points.filter((p) => p.event)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
        {Object.entries(EVENT_COLOR).map(([label, color]) => (
          <span key={label} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="schmGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FDE832" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#FDE832" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fontSize: 10, fill: "#52525b" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[min - yPad, max + yPad]}
            tick={{ fontSize: 10, fill: "#52525b" }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={(v: number) => v.toLocaleString()}
          />
          <ReTooltip content={<CustomTooltip />} cursor={{ stroke: "#3f3f46", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#FDE832"
            strokeWidth={1.5}
            fill="url(#schmGrad)"
            dot={false}
            activeDot={{ r: 3, fill: "#FDE832" }}
          />
          {events.map((pt, i) => (
            <ReferenceDot
              key={i}
              x={pt.date}
              y={pt.balance}
              r={4}
              fill={EVENT_COLOR[pt.event!] ?? "#a1a1aa"}
              stroke="transparent"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
