import { useEffect, useState } from "react"
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts"
import { useApi } from "@/lib/api"

interface SimCurvePoint {
  label: string
  sell_pnl: number
  epss_win: number
  cvss_win: number
  mal_win: number
}

interface SimResult {
  epss_payout: number
  cvss_payout: number
  mal_payout: number
  epss_win: number
  cvss_win: number
  mal_win: number
  max_win: number
  max_loss: number
  y_min: number
  y_max: number
  curve: SimCurvePoint[]
}

interface Props {
  packageName: string
  ecosystem: string
  cvssThreshold: number | null
  purchasePrice: number
  durationDays: number
}

export function ContractSimChart({ packageName, ecosystem, cvssThreshold, purchasePrice, durationDays }: Props) {
  const { authFetch } = useApi()
  const [sim, setSim] = useState<SimResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    authFetch("/contracts/simulate", {
      method: "POST",
      body: JSON.stringify({
        package_name: packageName,
        ecosystem,
        cvss_threshold: cvssThreshold,
        purchase_price: purchasePrice,
        duration_days: durationDays,
      }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then(setSim)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [packageName, ecosystem, cvssThreshold, purchasePrice, durationDays])

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="h-4 w-4 rounded-full border-2 border-[#FDE832] border-t-transparent animate-spin" />
    </div>
  )
  if (!sim) return <p className="text-xs text-zinc-600 py-4">Could not load simulation.</p>

  return (
    <div className="border-t border-zinc-800/60 pt-3">
      {/* Payout summary */}
      <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
          <p className="text-zinc-600">EPSS spike</p>
          <p className="font-bold text-emerald-400">+{sim.epss_win.toLocaleString()} sch</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
          <p className="text-zinc-600">CVSS event</p>
          <p className="font-bold text-[#FDE832]">+{sim.cvss_win.toLocaleString()} sch</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
          <p className="text-zinc-600">MAL advisory</p>
          <p className="font-bold text-rose-400">+{sim.mal_win.toLocaleString()} sch</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={sim.curve} margin={{ top: 8, right: 52, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="dc-epssGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="dc-cvssGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FDE832" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#FDE832" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="dc-malGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#fb7185" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="dc-sellGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity={0.04} />
              <stop offset="100%" stopColor="#f87171" stopOpacity={0.2} />
            </linearGradient>
          </defs>

          <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis
            orientation="right"
            tick={{ fill: "#52525b", fontSize: 10 }}
            axisLine={false} tickLine={false}
            tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${(v / 1000).toFixed(0)}k`}
            domain={[sim.y_min, sim.y_max]}
            allowDataOverflow={false}
            width={48}
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
              const sell = get("sell_pnl"), epss = get("epss_win"), cvss = get("cvss_win"), mal = get("mal_win")
              return (
                <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg space-y-1">
                  <p className="text-zinc-400 font-medium">{label}</p>
                  {epss != null && <p className="text-emerald-400">EPSS spike → +{epss.toLocaleString()} sch</p>}
                  {cvss != null && <p className="text-[#FDE832]">CVSS event → +{cvss.toLocaleString()} sch</p>}
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
          <Area stackId="win" type="monotone" dataKey="mal_win" stroke="#fb7185" strokeWidth={1} fill="url(#dc-malGrad)" dot={false} activeDot={{ r: 3, fill: "#fb7185", stroke: "none" }} />
          <Area stackId="win" type="monotone" dataKey="cvss_win" stroke="#FDE832" strokeWidth={1} fill="url(#dc-cvssGrad)" dot={false} activeDot={{ r: 3, fill: "#FDE832", stroke: "none" }} />
          <Area stackId="win" type="monotone" dataKey="epss_win" stroke="#34d399" strokeWidth={1} fill="url(#dc-epssGrad)" dot={false} activeDot={{ r: 3, fill: "#34d399", stroke: "none" }} />
          <Area type="monotone" dataKey="sell_pnl" stroke="#f87171" strokeWidth={2} fill="url(#dc-sellGrad)" dot={false} activeDot={{ r: 4, fill: "#e4e4e7", stroke: "none" }} />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 pt-1 text-[10px] flex-wrap">
        <span className="flex items-center gap-1 text-emerald-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-400/60" /> EPSS spike</span>
        <span className="flex items-center gap-1 text-[#FDE832]"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#FDE832]/60" /> CVSS event</span>
        <span className="flex items-center gap-1 text-rose-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-400/60" /> MAL advisory</span>
        <span className="flex items-center gap-1 text-red-400"><span className="inline-block h-px w-4 bg-red-400" /> Sell value</span>
      </div>
    </div>
  )
}
