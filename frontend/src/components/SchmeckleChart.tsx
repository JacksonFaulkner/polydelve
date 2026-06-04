import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { BalancePoint } from "@/types"

interface Props {
  history: BalancePoint[]
  current: number
}

export function SchmeckleChart({ history, current }: Props) {
  const start = history[0]?.balance ?? current
  const delta = current - start
  const positive = delta >= 0

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-xs text-zinc-500">Your schmeckles</p>
          <p className="text-2xl font-bold text-white">{current.toLocaleString()}</p>
        </div>
        <span className={`text-sm font-medium ${positive ? "text-emerald-400" : "text-red-400"}`}>
          {positive ? "+" : ""}{delta.toLocaleString()} all time
        </span>
      </div>

      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={history} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="schmeckleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={positive ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
              <stop offset="95%" stopColor={positive ? "#10b981" : "#ef4444"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 12 }}
            labelFormatter={(l) => l}
            formatter={(v) => [(v as number).toLocaleString(), "schmeckles"]}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={positive ? "#10b981" : "#ef4444"}
            strokeWidth={2}
            fill="url(#schmeckleGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
