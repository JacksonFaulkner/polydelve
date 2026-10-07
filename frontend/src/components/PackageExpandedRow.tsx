import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import EpssChart from "./EpssChart"
import type { PackageDetail } from "@/types"
import { useApi } from "@/lib/api"
import { buildEpssChartData, nvdUrl } from "@/lib/epss"
import { SEV_COLOR, SEV_FALLBACK, scoreColor } from "@/lib/severity"

function CvssScoreBadge({ score }: { score: number }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ backgroundColor: `${scoreColor(score)}22`, color: scoreColor(score) }}
    >
      {score.toFixed(1)}
    </span>
  )
}

const V3_LABELS: Record<string, Record<string, string>> = {
  AV: { N: "Network", A: "Adjacent", L: "Local", P: "Physical" },
  AC: { L: "Low", H: "High" },
  PR: { N: "None", L: "Low", H: "High" },
  UI: { N: "None", R: "Required", P: "Passive", A: "Active" },
  S:  { U: "Unchanged", C: "Changed" },
  C:  { N: "None", L: "Low", H: "High" },
  I:  { N: "None", L: "Low", H: "High" },
  A:  { N: "None", L: "Low", H: "High" },
}

function parseCvssVector(vector: string): { version: string; metrics: { key: string; val: string }[] } {
  const parts = vector.split("/")
  const version = parts[0].replace("CVSS:", "")
  const metrics = parts.slice(1).map((p) => {
    const [k, v] = p.split(":")
    return { key: k, val: v }
  })
  return { version, metrics }
}

function CvssVectorBreakdown({ vector }: { vector: string }) {
  const [open, setOpen] = useState(false)
  const { version, metrics } = parseCvssVector(vector)
  return (
    <div className="relative inline-block">
      <button
        className="font-mono text-[11px] text-ink-3 hover:text-ink-2 transition-colors underline decoration-dotted"
        onClick={() => setOpen((o) => !o)}
      >
        CVSS:{version}
      </button>
      {open && (
        <div className="absolute left-0 top-5 z-50 rounded border border-line-2 bg-surface-1 p-2 shadow-xl min-w-48">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {metrics.map(({ key, val }) => (
              <div key={key} className="contents">
                <span className="text-[11px] text-ink-3 font-mono">{key}</span>
                <span className="text-[11px] text-ink-2">
                  {V3_LABELS[key]?.[val] ?? val}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Skel({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-3/60 ${className}`} />
}

function TableSkeleton() {
  return (
    <div className="rounded border border-line-1 overflow-hidden">
      <div className="border-b border-line-1 px-3 py-2"><Skel className="h-3 w-1/2" /></div>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line-1/50 px-3 py-2.5 last:border-b-0">
          <Skel className="h-3 w-28" /><Skel className="h-3 w-16" /><Skel className="h-3 w-12" /><Skel className="h-4 w-8" />
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return <Skel className="h-full min-h-[200px] w-full rounded-none bg-surface-2/60" />
}

interface Props {
  name: string
  ecosystem: string
  colSpan: number
  tourTag?: string
}

export function PackageExpandedRow({ name, ecosystem, colSpan, tourTag }: Props) {
  const { getJson } = useApi()
  const [detail, setDetail] = useState<PackageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCveId, setSelectedCveId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"graph" | "table">("graph")

  useEffect(() => {
    setLoading(true)
    getJson<PackageDetail>(`/packages/${ecosystem}/${encodeURIComponent(name)}`)
      .then((d) => { setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [name, ecosystem, getJson])

  const failed = !loading && !detail
  const cves = detail?.cve_history ?? []
  const fmtM = (n: number | null | undefined) => (n ? (n / 1_000_000).toFixed(1) + "M" : "—")
  const stats = [
    { label: "Weekly DL", short: "DL", value: fmtM(detail?.weekly_downloads) },
    { label: "EPSS", short: "EPSS", value: detail?.epss_score != null ? `${(detail.epss_score * 100).toFixed(1)}%` : "—" },
    { label: "CVEs", short: "CVEs", value: String(detail?.cve_ids?.length ?? 0) },
    { label: "Risk Score", short: "Risk", value: fmtM(detail?.risk_score) },
  ]
  const statValue = (v: string, w: string) => (loading ? <Skel className={`h-4 ${w} mt-0.5`} /> : v)

  const epssChart = detail ? buildEpssChartData(detail) : null

  return (
    <tr data-tour={tourTag}>
      <td colSpan={colSpan} className="p-0">
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          {/* min-h keeps the reveal a single motion: the panel opens to roughly
              its final size while the detail request is in flight, so content
              fades into place instead of the row growing a second time. */}
          <div className={`border-t border-line-1 bg-surface-1/60 px-3 sm:px-6 py-4 sm:py-5`}>
            <div>
                  {/* ── MOBILE LAYOUT ── */}
                  <div className="sm:hidden space-y-3">
                    {/* 1×4 stats + tab toggle */}
                    <div className="flex items-center gap-0">
                      {stats.map(({ short, value }) => (
                        <div key={short} className="flex-1 text-center">
                          <p className="text-[11px] text-ink-3">{short}</p>
                          <div className="flex justify-center text-xs font-semibold text-ink-1 tabular-nums">{statValue(value, "w-8")}</div>
                        </div>
                      ))}
                      {/* Tab toggle */}
                      <div className="ml-auto flex rounded border border-line-2 overflow-hidden text-[11px] font-semibold shrink-0">
                        <button
                          onClick={() => setMobileView("graph")}
                          className={`px-2.5 py-1 transition-colors ${mobileView === "graph" ? "bg-surface-3 text-ink-1" : "text-ink-3"}`}
                        >
                          Graph
                        </button>
                        <button
                          onClick={() => setMobileView("table")}
                          className={`px-2.5 py-1 border-l border-line-2 transition-colors ${mobileView === "table" ? "bg-surface-3 text-ink-1" : "text-ink-3"}`}
                        >
                          Table
                        </button>
                      </div>
                    </div>

                    {/* Graph view */}
                    {mobileView === "graph" && loading && (
                      <div className="rounded border border-line-1 h-[200px] overflow-hidden"><ChartSkeleton /></div>
                    )}
                    {mobileView === "graph" && epssChart && (
                      <div className="rounded border border-line-1 h-[200px] flex flex-col">
                        <EpssChart
                          data={epssChart.chartData}
                          cveData={epssChart.scatterData}
                          selectedCveId={selectedCveId}
                          onCveClick={(id) => setSelectedCveId(id)}
                        />
                      </div>
                    )}
                    {mobileView === "graph" && !loading && !epssChart && (
                      <p className="py-8 text-center text-xs text-ink-4">No EPSS history</p>
                    )}

                    {/* Table view */}
                    {mobileView === "table" && (
                      loading ? <TableSkeleton /> : cves.length > 0 ? (
                        <div className="rounded border border-line-1 max-h-52 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-surface-1">
                              <tr className="border-b border-line-1">
                                <th className="px-3 py-1.5 text-left text-ink-3 font-medium">CVE</th>
                                <th className="px-3 py-1.5 text-left text-ink-3 font-medium">Score</th>
                                <th className="px-3 py-1.5 text-left text-ink-3 font-medium">Severity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cves.map((c) => (
                                <tr key={c.osv_id} className="border-b border-line-1/50 hover:bg-surface-2/30">
                                  <td className="px-3 py-1.5 font-mono">
                                    {c.cve_id ? (
                                      <a
                                        href={nvdUrl(c.cve_id)}
                                        target="_blank" rel="noopener noreferrer"
                                        className="text-ink-2 hover:text-ink-1 underline decoration-line-3 transition-colors"
                                      >{c.cve_id}</a>
                                    ) : <span className="text-ink-2">{c.osv_id}</span>}
                                    {c.published_date && (
                                      <span className="block text-[11px] text-ink-4 font-sans">{c.published_date.slice(0, 10)}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 tabular-nums">
                                    {c.cvss_score != null ? <CvssScoreBadge score={c.cvss_score} /> : "—"}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {c.severity
                                      ? <span className="capitalize font-medium" style={{ color: SEV_COLOR[c.severity] ?? SEV_FALLBACK }}>{c.severity}</span>
                                      : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="py-6 text-center text-xs text-ink-4">No CVEs recorded</p>
                      )
                    )}
                  </div>

                  {/* ── DESKTOP LAYOUT ── */}
                  <div className="hidden sm:flex sm:items-stretch sm:gap-6" style={{ minHeight: 220 }}>
                    {/* Left: stats + CVE table */}
                    <div className="shrink-0 space-y-4">
                      <div className="flex flex-wrap items-center gap-6 text-sm">
                        {stats.map(({ label, value }) => (
                          <div key={label}>
                            <span className="text-xs text-ink-3">{label}</span>
                            <div className="font-medium text-ink-1 tabular-nums">{statValue(value, "w-12")}</div>
                          </div>
                        ))}
                        {detail?.has_mal_advisory && (
                          <span className="rounded bg-rose-900/60 px-2 py-0.5 text-xs font-bold text-rose-300">OSV MAL</span>
                        )}
                        {(detail?.sectors ?? []).map((s) => (
                          <span key={s} className="rounded bg-surface-3/60 px-2 py-0.5 text-xs text-ink-2">{s}</span>
                        ))}
                      </div>

                      {loading ? <TableSkeleton /> : failed ? (
                        <p className="py-6 text-center text-xs text-ink-4">Failed to load</p>
                      ) : cves.length > 0 ? (
                        <div className="max-h-52 overflow-y-auto rounded border border-line-1">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-surface-1">
                              <tr className="border-b border-line-1">
                                <th className="px-3 py-1.5 text-left text-ink-3 font-medium">CVE ID</th>
                                <th className="px-3 py-1.5 text-left text-ink-3 font-medium">Published</th>
                                <th className="px-3 py-1.5 text-left text-ink-3 font-medium">Severity</th>
                                <th className="px-3 py-1.5 text-left text-ink-3 font-medium">Score</th>
                                <th className="px-3 py-1.5 text-left text-ink-3 font-medium">Vector</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cves.map((c) => (
                                <tr
                                  key={c.osv_id}
                                  className={`border-b border-line-1/50 transition-colors ${
                                    selectedCveId && c.cve_id === selectedCveId ? "bg-surface-3/50" : "hover:bg-surface-2/30"
                                  }`}
                                >
                                  <td className="px-3 py-1.5 font-mono">
                                    {c.cve_id ? (
                                      <a href={nvdUrl(c.cve_id)} target="_blank" rel="noopener noreferrer"
                                        className="text-ink-2 hover:text-ink-1 underline decoration-line-3 hover:decoration-ink-3 transition-colors"
                                      >{c.cve_id}</a>
                                    ) : <span className="text-ink-2">{c.osv_id}</span>}
                                  </td>
                                  <td className="px-3 py-1.5 text-ink-3 tabular-nums">{c.published_date?.slice(0, 10) ?? ""}</td>
                                  <td className="px-3 py-1.5">
                                    {c.severity ? <span className="capitalize font-medium" style={{ color: SEV_COLOR[c.severity] ?? SEV_FALLBACK }}>{c.severity}</span> : ""}
                                  </td>
                                  <td className="px-3 py-1.5 tabular-nums">
                                    {c.cvss_score != null ? <CvssScoreBadge score={c.cvss_score} /> : ""}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {c.cvss_vector ? <CvssVectorBreakdown vector={c.cvss_vector} /> : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="py-6 text-center text-xs text-ink-4">No CVEs recorded</p>
                      )}
                    </div>

                    {/* Right: chart */}
                    {loading && (
                      <div className="min-w-0 flex-1 rounded border border-line-1 overflow-hidden"><ChartSkeleton /></div>
                    )}
                    {epssChart && (
                      <div className="min-w-0 flex-1 flex flex-col rounded border border-line-1">
                        <EpssChart
                          data={epssChart.chartData}
                          cveData={epssChart.scatterData}
                          selectedCveId={selectedCveId}
                          onCveClick={(id) => setSelectedCveId(id)}
                        />
                      </div>
                    )}
                  </div>
            </div>
          </div>
        </motion.div>
      </td>
    </tr>
  )
}
