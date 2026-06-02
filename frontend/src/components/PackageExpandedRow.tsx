import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import EpssChart from "./EpssChart"
import type { PackageDetail } from "@/types"
import { useApi } from "@/lib/api"

const SEV_COLOR: Record<string, string> = {
  critical: "#f87171",
  high: "#fb923c",
  medium: "#facc15",
  low: "#71717a",
}

const EXPLOIT_STYLES: Record<string, string> = {
  actively_exploited: "bg-red-900/60 text-red-300",
  poc_available: "bg-orange-900/60 text-orange-300",
  patched: "bg-green-900/60 text-green-300",
  unpatched: "bg-zinc-700 text-zinc-400",
}

const EXPLOIT_LABEL: Record<string, string> = {
  actively_exploited: "Active",
  poc_available: "PoC",
  patched: "Patched",
  unpatched: "Unpatched",
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const SCORE_COLOR = (s: number) =>
  s >= 9 ? "#f87171" : s >= 7 ? "#fb923c" : s >= 4 ? "#facc15" : "#71717a"

function CvssScoreBadge({ score }: { score: number }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{ backgroundColor: `${SCORE_COLOR(score)}22`, color: SCORE_COLOR(score) }}
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
        className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors underline decoration-dotted"
        onClick={() => setOpen((o) => !o)}
      >
        CVSS:{version}
      </button>
      {open && (
        <div className="absolute left-0 top-5 z-50 rounded border border-zinc-700 bg-zinc-900 p-2 shadow-xl min-w-48">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {metrics.map(({ key, val }) => (
              <div key={key} className="contents">
                <span className="text-[10px] text-zinc-500 font-mono">{key}</span>
                <span className="text-[10px] text-zinc-300">
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

interface Props {
  name: string
  ecosystem: string
  colSpan: number
}

const TABS = ["CVEs", "News", "Trend"] as const
type Tab = typeof TABS[number]

export function PackageExpandedRow({ name, ecosystem, colSpan }: Props) {
  const { authFetch } = useApi()
  const [detail, setDetail] = useState<PackageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("CVEs")

  useEffect(() => {
    setLoading(true)
    authFetch(`/packages/${ecosystem}/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [name, ecosystem])

  const epssChart = detail && detail.epss_history && detail.epss_history.length > 1 ? (() => {
    const epssStart = detail.epss_history[0].date
    const epssEnd = detail.epss_history[detail.epss_history.length - 1].date
    const chartData = detail.epss_history.map((pt) => ({
      date: pt.date, epss: pt.epss,
      cvss: null as number | null, severity: null as string | null, cve_id: null as string | null,
    }))
    const scatterData = detail.cve_history
      .filter((c) => c.published_date && c.cvss_score != null)
      .map((c) => ({ date: c.published_date!.slice(0, 10), epss: 0, cvss: c.cvss_score, severity: c.severity, cve_id: c.cve_id }))
      .filter((c) => c.date >= epssStart && c.date <= epssEnd)
    return { chartData, scatterData, cveCount: scatterData.length }
  })() : null

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800 bg-zinc-900/60 px-6 py-5">
              {loading ? (
                <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>
              ) : !detail ? (
                <div className="py-8 text-center text-sm text-zinc-500">Failed to load</div>
              ) : (
                <div className="space-y-4">

                  {/* Stats strip */}
                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div>
                      <span className="text-xs text-zinc-500">Weekly DL</span>
                      <p className="font-medium text-zinc-200 tabular-nums">
                        {detail.weekly_downloads ? (detail.weekly_downloads / 1_000_000).toFixed(1) + "M" : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500">EPSS</span>
                      <p className="font-medium text-zinc-200">
                        {detail.epss_score !== null ? `${(detail.epss_score * 100).toFixed(1)}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500">CVEs</span>
                      <p className="font-medium text-zinc-200">{detail.cve_ids.length}</p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500">Risk Score</span>
                      <p className="font-medium text-zinc-200">
                        {detail.risk_score ? (detail.risk_score / 1_000_000).toFixed(1) + "M" : "—"}
                      </p>
                    </div>
                    {detail.has_mal_advisory && (
                      <span className="rounded bg-rose-900/60 px-2 py-0.5 text-xs font-bold text-rose-300">OSV MAL</span>
                    )}
                    {detail.sectors.map((s) => (
                      <span key={s} className="rounded bg-zinc-700/60 px-2 py-0.5 text-xs text-zinc-400">{s}</span>
                    ))}
                  </div>

                  {/* Tab bar */}
                  <div className="flex gap-1 border-b border-zinc-800 pb-0">
                    {TABS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors border-b-2 -mb-px ${
                          tab === t
                            ? "border-zinc-400 text-zinc-200"
                            : "border-transparent text-zinc-600 hover:text-zinc-400"
                        }`}
                      >
                        {t === "CVEs" && `CVEs${detail.cve_history.length > 0 ? ` · ${detail.cve_history.length}` : ""}`}
                        {t === "News" && `News${detail.recent_news.length > 0 ? ` · ${detail.recent_news.length}` : ""}`}
                        {t === "Trend" && `Trend${epssChart ? ` · ${epssChart.cveCount} CVE${epssChart.cveCount !== 1 ? "s" : ""}` : ""}`}
                      </button>
                    ))}
                  </div>

                  {/* Panels */}
                  {tab === "CVEs" && (
                    detail.cve_history.length > 0 ? (
                      <div className="max-h-52 overflow-y-auto rounded border border-zinc-800">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-zinc-900">
                            <tr className="border-b border-zinc-800">
                              <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">CVE ID</th>
                              <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Published</th>
                              <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Severity</th>
                              <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Score</th>
                              <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Vector</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.cve_history.map((c) => (
                              <tr key={c.osv_id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                                <td className="px-3 py-1.5 font-mono">
                                  {c.cve_id ? (
                                    <a
                                      href={`https://nvd.nist.gov/vuln/detail/${c.cve_id}`}
                                      target="_blank" rel="noopener noreferrer"
                                      className="text-zinc-300 hover:text-white underline decoration-zinc-600 hover:decoration-zinc-400 transition-colors"
                                    >{c.cve_id}</a>
                                  ) : <span className="text-zinc-300">{c.osv_id}</span>}
                                </td>
                                <td className="px-3 py-1.5 text-zinc-500 tabular-nums">{c.published_date?.slice(0, 10) ?? "—"}</td>
                                <td className="px-3 py-1.5">
                                  {c.severity
                                    ? <span className="capitalize font-medium" style={{ color: SEV_COLOR[c.severity] ?? "#71717a" }}>{c.severity}</span>
                                    : "—"}
                                </td>
                                <td className="px-3 py-1.5 tabular-nums">
                                  {c.cvss_score != null ? <CvssScoreBadge score={c.cvss_score} /> : "—"}
                                </td>
                                <td className="px-3 py-1.5">
                                  {c.cvss_vector ? <CvssVectorBreakdown vector={c.cvss_vector} /> : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="py-6 text-center text-xs text-zinc-600">No CVEs recorded</p>
                    )
                  )}

                  {tab === "News" && (
                    detail.recent_news.length > 0 ? (
                      <div className="space-y-2">
                        {detail.recent_news.slice(0, 5).map((n) => (
                          <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 group">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-zinc-300 group-hover:text-white line-clamp-1 transition-colors">{n.title}</p>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                {n.exploit_status && (
                                  <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${EXPLOIT_STYLES[n.exploit_status]}`}>
                                    {EXPLOIT_LABEL[n.exploit_status]}
                                  </span>
                                )}
                                {n.severity && (
                                  <span className="text-[10px] capitalize" style={{ color: SEV_COLOR[n.severity] ?? "#71717a" }}>{n.severity}</span>
                                )}
                                <span className="text-[10px] text-zinc-600">
                                  {n.source_name} · {n.published_date ? timeAgo(n.published_date) : ""}
                                </span>
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="py-6 text-center text-xs text-zinc-600">No recent news</p>
                    )
                  )}

                  {tab === "Trend" && (
                    epssChart ? (
                      <EpssChart data={epssChart.chartData} cveData={epssChart.scatterData} />
                    ) : (
                      <p className="py-6 text-center text-xs text-zinc-600">No EPSS history</p>
                    )
                  )}

                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </td>
    </tr>
  )
}
