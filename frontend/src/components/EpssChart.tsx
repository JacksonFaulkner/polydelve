import { useEffect, useRef, useState } from "react"
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

type CvePoint = { x: number; cvss: number; severity: string | null; cve_id: string | null; date: string }
type Focus = {
  x: number            // pixel x within the chart container
  y: number            // pixel y within the chart container
  date: string
  epss: number | null
  prevEpss: number | null
  cves: CvePoint[]
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export default function EpssChart({
  data, cveData, selectedCveId, onCveClick,
}: {
  data: ChartPoint[]
  cveData: ChartPoint[]
  selectedCveId?: string | null
  onCveClick?: (cveId: string | null) => void
}) {
  const [hover, setHover] = useState<Focus | null>(null)
  const [pinned, setPinned] = useState<Focus | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPinned(null) }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [pinned])

  if (!data.length) return null

  const epssPoints = data.map((d) => ({
    x: new Date(d.date).getTime(),
    epss: d.epss,
    date: d.date,
  }))

  const cvePoints: CvePoint[] = cveData.map((d) => ({
    x: new Date(d.date).getTime(),
    cvss: d.cvss ?? 0,
    severity: d.severity,
    cve_id: d.cve_id,
    date: d.date,
  }))

  const xMin = epssPoints[0]?.x ?? 0
  const xMax = epssPoints[epssPoints.length - 1]?.x ?? 0

  // Build the focus payload for a given date from the EPSS series + CVEs that day.
  function focusFor(date: string, px: number, py: number): Focus {
    const i = epssPoints.findIndex((p) => p.date === date)
    const epss = i >= 0 ? epssPoints[i].epss : null
    const prevEpss = i > 0 ? epssPoints[i - 1].epss : null
    return { x: px, y: py, date, epss, prevEpss, cves: cvePoints.filter((c) => c.date === date) }
  }

  const focus = pinned ?? hover
  const tooltipLeft = focus ? Math.min(focus.x + 14, (containerRef.current?.clientWidth ?? 9999) - 230) : 0
  const tooltipTop = focus ? Math.max(8, Math.min(focus.y - 12, (containerRef.current?.clientHeight ?? 9999) - 140)) : 0

  return (
    <div ref={containerRef} className="relative flex-1" onMouseLeave={() => setHover(null)}>
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
      {!pinned && <span className="text-[10px] text-zinc-700">click to pin</span>}
    </div>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        margin={{ top: 24, right: 44, bottom: 8, left: 4 }}
        onMouseMove={(state) => {
          if (pinned) return
          const s = state as { activePayload?: { payload: { date: string } }[]; activeCoordinate?: { x: number; y: number } }
          const date = s.activePayload?.[0]?.payload?.date
          if (!date || !s.activeCoordinate) return
          setHover(focusFor(date, s.activeCoordinate.x, s.activeCoordinate.y))
        }}
        onClick={() => {
          if (pinned) { setPinned(null); return }
          if (hover) setPinned(hover)
        }}
        style={{ cursor: pinned ? "default" : "crosshair" }}
      >
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
        <YAxis yAxisId="cvss" domain={[0, 10]} hide />

        {[0.25, 0.5, 0.75].map((v) => (
          <ReferenceLine key={v} yAxisId="epss" y={v} stroke="#27272a" strokeDasharray="3 3" />
        ))}

        {/* Pinned marker */}
        {pinned && (
          <ReferenceLine yAxisId="epss" x={new Date(pinned.date).getTime()} stroke="#FDE832" strokeWidth={1} strokeDasharray="4 3" />
        )}

        {/* Built-in tooltip only supplies the hover cursor; content is our own layer below */}
        <ReTooltip
          cursor={pinned ? false : { stroke: "#52525b", strokeWidth: 1, strokeDasharray: "3 3" }}
          content={() => null}
          isAnimationActive={false}
        />

        <Line
          yAxisId="epss"
          data={epssPoints}
          dataKey="epss"
          type="monotone"
          stroke="#34d399"
          strokeWidth={1.5}
          dot={false}
          activeDot={pinned ? false : { r: 4, fill: "#34d399", stroke: "#18181b", strokeWidth: 1 }}
          isAnimationActive={false}
        />

        <Scatter
          yAxisId="cvss"
          data={cvePoints}
          dataKey="cvss"
          isAnimationActive={false}
          shape={(props: { cx?: number; cy?: number; payload?: CvePoint }) => {
            const { cx = 0, cy = 0, payload } = props
            if (!payload) return <g />
            const isSelected = (selectedCveId != null && payload.cve_id === selectedCveId)
              || (pinned?.cves.some((c) => c.cve_id === payload.cve_id) ?? false)
            return (
              <circle
                cx={cx} cy={cy} r={isSelected ? 7 : 5}
                fill={dotColor(payload.cvss, payload.severity)}
                stroke={isSelected ? "#fff" : "#18181b"}
                strokeWidth={isSelected ? 2 : 1}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => { if (!pinned) setHover(focusFor(payload.date, cx, cy)) }}
                onClick={(e) => {
                  e.stopPropagation()
                  const f = focusFor(payload.date, cx, cy)
                  const already = pinned?.date === payload.date
                  setPinned(already ? null : f)
                  onCveClick?.(already ? null : payload.cve_id)
                }}
              />
            )
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>

    {focus && (
      <div
        className={`absolute z-20 w-[220px] rounded border bg-zinc-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur ${pinned ? "border-[#FDE832]/60" : "border-zinc-700 pointer-events-none"}`}
        style={{ left: tooltipLeft, top: tooltipTop }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-zinc-400 font-medium">{fmtDate(focus.date)}</span>
          {pinned ? (
            <button onClick={() => setPinned(null)} className="text-[10px] text-[#FDE832] hover:underline">unpin</button>
          ) : (
            <span className="text-[10px] text-zinc-600">hover</span>
          )}
        </div>
        {focus.epss != null && (
          <div className="flex items-baseline justify-between">
            <span className="text-emerald-400 font-semibold tabular-nums">EPSS {(focus.epss * 100).toFixed(2)}%</span>
            {focus.prevEpss != null && focus.prevEpss !== focus.epss && (
              <span className={`tabular-nums text-[10px] ${focus.epss > focus.prevEpss ? "text-rose-400" : "text-emerald-500"}`}>
                {focus.epss > focus.prevEpss ? "▲" : "▼"} {Math.abs((focus.epss - focus.prevEpss) * 100).toFixed(2)} pts
              </span>
            )}
          </div>
        )}
        {focus.cves.length > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-zinc-800 space-y-1">
            {focus.cves.map((c) => (
              <div key={c.cve_id ?? c.x} className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-zinc-200 truncate">{c.cve_id ?? "CVE"}</span>
                <span className="shrink-0 tabular-nums font-semibold" style={{ color: dotColor(c.cvss, c.severity) }}>
                  {c.cvss.toFixed(1)}{c.severity ? ` · ${c.severity}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        {focus.cves.length === 0 && focus.epss == null && (
          <p className="text-zinc-600">No data</p>
        )}
      </div>
    )}
    </div>
  )
}
