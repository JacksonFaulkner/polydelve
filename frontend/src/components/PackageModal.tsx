import { useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import EpssChart from "./EpssChart"
import type { PackageDetail } from "@/types"
import { useApi } from "@/lib/api"

const SEV_COLOR: Record<string, string> = {
  critical: "#f87171",
  high: "#fb923c",
  medium: "#facc15",
  low: "#71717a",
}

const SCORE_COLOR = (s: number) =>
  s >= 9 ? "#f87171" : s >= 7 ? "#fb923c" : s >= 4 ? "#facc15" : "#71717a"

interface Props {
  name: string
  ecosystem: string
  onClose: () => void
}

export function PackageModal({ name, ecosystem, onClose }: Props) {
  const { authFetch } = useApi()
  const [detail, setDetail] = useState<PackageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCveId, setSelectedCveId] = useState<string | null>(null)

  useEffect(() => {
    authFetch(`/packages/${ecosystem}/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => { setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [name, ecosystem])

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onKey])

  const epssChart = detail && detail.epss_history.length > 1 ? (() => {
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
    return { chartData, scatterData }
  })() : null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-[#15191D] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-[#15191D] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
              ecosystem === "npm" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"
            }`}>
              {ecosystem}
            </span>
            <span className="font-mono text-lg font-semibold text-zinc-100">{name}</span>
            {detail?.has_mal_advisory && (
              <span className="rounded bg-rose-900/60 px-2 py-0.5 text-xs font-bold text-rose-300">MAL</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-16 text-center text-zinc-500">Loading…</div>
          ) : !detail ? (
            <div className="py-16 text-center text-zinc-500">Failed to load</div>
          ) : (
            <div className="space-y-6">
              {/* Stats */}
              <div className="flex flex-wrap gap-6 text-sm">
                {[
                  ["Weekly DL", detail.weekly_downloads ? (detail.weekly_downloads / 1_000_000).toFixed(1) + "M" : "—"],
                  ["EPSS", detail.epss_score != null ? `${(detail.epss_score * 100).toFixed(1)}%` : "—"],
                  ["CVEs", String(detail.cve_ids.length)],
                  ["Risk Score", detail.risk_score ? (detail.risk_score / 1_000_000).toFixed(1) + "M" : "—"],
                ].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-xs text-zinc-500">{label}</p>
                    <p className="font-medium text-zinc-200 tabular-nums">{val}</p>
                  </div>
                ))}
                {detail.sectors.map((s) => (
                  <span key={s} className="self-end rounded bg-zinc-700/60 px-2 py-0.5 text-xs text-zinc-400">{s}</span>
                ))}
              </div>

              {/* EPSS chart */}
              {epssChart && (
                <div className="h-56 rounded border border-zinc-800">
                  <EpssChart
                    data={epssChart.chartData}
                    cveData={epssChart.scatterData}
                    selectedCveId={selectedCveId}
                    onCveClick={setSelectedCveId}
                  />
                </div>
              )}

              {/* CVE table */}
              {detail.cve_history.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="border-b border-zinc-800">
                        {["CVE ID", "Published", "Severity", "Score"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-zinc-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.cve_history.map((c) => (
                        <tr
                          key={c.osv_id}
                          className={`border-b border-zinc-800/50 transition-colors ${
                            selectedCveId && c.cve_id === selectedCveId ? "bg-zinc-700/50" : "hover:bg-zinc-800/30"
                          }`}
                        >
                          <td className="px-3 py-1.5 font-mono">
                            {c.cve_id ? (
                              <a
                                href={`https://nvd.nist.gov/vuln/detail/${c.cve_id}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-zinc-300 underline decoration-zinc-600 hover:text-white hover:decoration-zinc-400 transition-colors"
                              >{c.cve_id}</a>
                            ) : <span className="text-zinc-300">{c.osv_id}</span>}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-zinc-500">{c.published_date?.slice(0, 10) ?? "—"}</td>
                          <td className="px-3 py-1.5">
                            {c.severity
                              ? <span className="capitalize font-medium" style={{ color: SEV_COLOR[c.severity] ?? "#71717a" }}>{c.severity}</span>
                              : "—"}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums">
                            {c.cvss_score != null ? (
                              <span
                                className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                                style={{ backgroundColor: `${SCORE_COLOR(c.cvss_score)}22`, color: SCORE_COLOR(c.cvss_score) }}
                              >{c.cvss_score.toFixed(1)}</span>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Recent news */}
              {detail.recent_news.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Recent news</p>
                  {detail.recent_news.slice(0, 3).map((n) => (
                    <a
                      key={n.id}
                      href={n.url}
                      target="_blank" rel="noopener noreferrer"
                      className="block rounded-lg border border-zinc-800 px-3 py-2 transition-colors hover:border-zinc-600"
                    >
                      <p className="text-sm text-zinc-200 line-clamp-1">{n.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{n.source_name} · {n.published_date?.slice(0, 10)}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
