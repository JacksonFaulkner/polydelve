import { useState } from "react"
import {
  ComposedChart, Line, Scatter, XAxis, YAxis,
  Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts"

const SEV_COLOR: Record<string, string> = {
  critical: "#f87171",
  high:     "#fb923c",
  medium:   "#facc15",
  low:      "#71717a",
}

// CVSS 0→10 gradient: slate → yellow → orange → red
function cvssColor(score: number): string {
  const t = Math.max(0, Math.min(10, score)) / 10
  if (t < 0.4) {
    // 0–4: slate to yellow
    const u = t / 0.4
    const r = Math.round(113 + (250 - 113) * u)
    const g = Math.round(113 + (204 - 113) * u)
    const b = Math.round(122 + (21  - 122) * u)
    return `rgb(${r},${g},${b})`
  } else if (t < 0.7) {
    // 4–7: yellow to orange
    const u = (t - 0.4) / 0.3
    const r = Math.round(250 + (251 - 250) * u)
    const g = Math.round(204 + (146 - 204) * u)
    const b = Math.round(21  + (60  - 21)  * u)
    return `rgb(${r},${g},${b})`
  } else {
    // 7–10: orange to red
    const u = (t - 0.7) / 0.3
    const r = Math.round(251 + (248 - 251) * u)
    const g = Math.round(146 + (113 - 146) * u)
    const b = Math.round(60  + (113 - 60)  * u)
    return `rgb(${r},${g},${b})`
  }
}

function dotColor(cvss: number | null | undefined, severity: string | null | undefined): string {
  if (cvss != null) return cvssColor(cvss)
  return SEV_COLOR[severity ?? ""] ?? "#52525b"
}

type ChartPoint = {
  date: string
  epss: number
  cvss: number | null
  severity: string | null
  cve_id: string | null
}

type CveTooltip = { cx: number; cy: number; payload: { cve_id: string | null; cvss: number; severity: string | null; date: string } }

export default function EpssChart({
  data, cveData, selectedCveId, onCveClick,
}: {
  data: ChartPoint[]
  cveData: ChartPoint[]
  selectedCveId?: string | null
  onCveClick?: (cveId: string | null) => void
}) {
  const [cveHover, setCveHover] = useState<CveTooltip | null>(null)

  if (!data.length) return null

  const epssPoints = data.map((d) => ({
    x: new Date(d.date).getTime(),
    epss: d.epss,
    date: d.date,
  }))

  const cvePoints = cveData.map((d) => ({
    x: new Date(d.date).getTime(),
    cvss: d.cvss ?? 0,
    severity: d.severity,
    cve_id: d.cve_id,
    date: d.date,
  }))

  const xMin = epssPoints[0]?.x ?? 0
  const xMax = epssPoints[epssPoints.length - 1]?.x ?? 0

  return (
    <div className="relative flex-1">
    {/* Chart title + legend */}
    <div className="absolute top-2 left-3 z-10 flex items-center gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">EPSS Trend</span>
      <span className="flex items-center gap-1 text-[10px] text-zinc-600">
        <span className="inline-block h-px w-4 bg-emerald-400" />
        EPSS
      </span>
      <span className="flex items-center gap-1 text-[10px] text-zinc-600">
        <span className="inline-block h-2 w-2 rounded-full bg-orange-400" />
        CVE
      </span>
    </div>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart margin={{ top: 24, right: 44, bottom: 8, left: 4 }}>
        <XAxis
          dataKey="x"
          type="number"
          domain={[xMin, xMax]}
          scale="time"
          tickFormatter={(ms: number) => {
            const d = new Date(ms)
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          }}
          tick={{ fill: "#52525b", fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          tickCount={4}
        />

        {/* EPSS axis (right, 0–1) */}
        <YAxis
          yAxisId="epss"
          domain={[0, 1]}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          tick={{ fill: "#52525b", fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          orientation="right"
          width={44}
          tickCount={4}
          label={{ value: "EPSS", angle: 90, position: "insideRight", offset: 12, style: { fill: "#52525b", fontSize: 9, textAnchor: "middle" } }}
        />

        {/* CVSS axis (left, 0–10) for scatter dots */}
        <YAxis
          yAxisId="cvss"
          domain={[0, 10]}
          hide
        />

        {[0.25, 0.5, 0.75].map((v) => (
          <ReferenceLine key={v} yAxisId="epss" y={v} stroke="#27272a" strokeDasharray="3 3" />
        ))}

        <ReTooltip
          cursor={{ stroke: "#52525b", strokeWidth: 1, strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const epss = payload.find((p) => p.name === "epss")?.payload
            const cve  = payload.find((p) => p.name === "cvss")?.payload
            return (
              <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg space-y-0.5">
                <p className="text-zinc-500">{epss?.date ?? cve?.date}</p>
                {epss && <p className="text-emerald-400">EPSS {(epss.epss * 100).toFixed(2)}%</p>}
                {cve?.cve_id && (
                  <p style={{ color: dotColor(cve.cvss ?? null, cve.severity) }}>
                    {cve.cve_id} · CVSS {cve.cvss?.toFixed(1)}
                  </p>
                )}
              </div>
            )
          }}
        />

        <Line
          yAxisId="epss"
          data={epssPoints}
          dataKey="epss"
          type="monotone"
          stroke="#34d399"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, fill: "#34d399", stroke: "#18181b", strokeWidth: 1 }}
        />

        <Scatter
          yAxisId="cvss"
          data={cvePoints}
          dataKey="cvss"
          shape={(props: { cx?: number; cy?: number; payload?: { cve_id: string | null; cvss: number; severity: string | null; date: string } }) => {
            const { cx = 0, cy = 0, payload } = props
            if (!payload) return <g />
            const isSelected = selectedCveId != null && payload.cve_id === selectedCveId
            return (
              <circle
                cx={cx} cy={cy} r={isSelected ? 7 : 5}
                fill={dotColor(payload.cvss, payload.severity)}
                stroke={isSelected ? "#fff" : "#18181b"}
                strokeWidth={isSelected ? 2 : 1}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setCveHover({ cx, cy, payload })}
                onMouseLeave={() => setCveHover(null)}
                onClick={() => onCveClick?.(isSelected ? null : payload.cve_id)}
              />
            )
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>

    {/* CVE dot tooltip. positioned relative to chart container */}
    {cveHover && (
      <div
        className="pointer-events-none absolute z-10 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-lg space-y-0.5"
        style={{ left: cveHover.cx + 12, top: cveHover.cy }}
      >
        <p className="text-zinc-500">{cveHover.payload.date}</p>
        <p style={{ color: dotColor(cveHover.payload.cvss, cveHover.payload.severity) }}>
          {cveHover.payload.cve_id} · CVSS {cveHover.payload.cvss?.toFixed(1)}
        </p>
      </div>
    )}
    </div>
  )
}
