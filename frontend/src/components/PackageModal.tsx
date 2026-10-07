import { useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import EpssChart from "./EpssChart"
import type { PackageDetail } from "@/types"
import { useApi } from "@/lib/api"
import { buildEpssChartData, nvdUrl } from "@/lib/epss"
import { SEV_COLOR, SEV_FALLBACK, scoreColor } from "@/lib/severity"

interface Props {
  name: string
  ecosystem: string
  onClose: () => void
}

export function PackageModal({ name, ecosystem, onClose }: Props) {
  const { getJson } = useApi()
  const [detail, setDetail] = useState<PackageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCveId, setSelectedCveId] = useState<string | null>(null)

  useEffect(() => {
    getJson<PackageDetail>(`/packages/${ecosystem}/${encodeURIComponent(name)}`)
      .then((d) => { setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [name, ecosystem, getJson])

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onKey])

  const epssChart = detail ? buildEpssChartData(detail) : null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} details`}
        className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded border border-line-2 bg-surface-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line-1 bg-surface-0 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${
              ecosystem === "npm" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"
            }`}>
              {ecosystem}
            </span>
            <span className="font-mono text-lg font-semibold text-ink-1">{name}</span>
            {detail?.has_mal_advisory && (
              <span className="rounded bg-rose-900/60 px-2 py-0.5 text-xs font-bold text-rose-300">MAL</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-1"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="py-16 text-center text-ink-3">Loading…</div>
          ) : !detail ? (
            <div className="py-16 text-center text-ink-3">Failed to load</div>
          ) : (
            <div className="space-y-6">
              {/* Stats */}
              <div className="flex flex-wrap gap-6 text-sm">
                {[
                  ["Weekly DL", detail.weekly_downloads ? (detail.weekly_downloads / 1_000_000).toFixed(1) + "M" : ""],
                  ["EPSS", detail.epss_score != null ? `${(detail.epss_score * 100).toFixed(1)}%` : ""],
                  ["CVEs", String(detail.cve_ids.length)],
                  ["Risk Score", detail.risk_score ? (detail.risk_score / 1_000_000).toFixed(1) + "M" : ""],
                ].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-xs text-ink-3">{label}</p>
                    <p className="font-medium text-ink-1 tabular-nums">{val}</p>
                  </div>
                ))}
                {detail.sectors.map((s) => (
                  <span key={s} className="self-end rounded bg-surface-3/60 px-2 py-0.5 text-xs text-ink-2">{s}</span>
                ))}
              </div>

              {/* EPSS chart */}
              {epssChart && (
                <div className="h-56 rounded border border-line-1">
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
                <div className="max-h-64 overflow-y-auto rounded border border-line-1">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface-1">
                      <tr className="border-b border-line-1">
                        {["CVE ID", "Published", "Severity", "Score"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-ink-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.cve_history.map((c) => (
                        <tr
                          key={c.osv_id}
                          className={`border-b border-line-1/50 transition-colors ${
                            selectedCveId && c.cve_id === selectedCveId ? "bg-surface-3/50" : "hover:bg-surface-2/30"
                          }`}
                        >
                          <td className="px-3 py-1.5 font-mono">
                            {c.cve_id ? (
                              <a
                                href={nvdUrl(c.cve_id)}
                                target="_blank" rel="noopener noreferrer"
                                className="text-ink-2 underline decoration-line-3 hover:text-ink-1 hover:decoration-ink-3 transition-colors"
                              >{c.cve_id}</a>
                            ) : <span className="text-ink-2">{c.osv_id}</span>}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums text-ink-3">{c.published_date?.slice(0, 10) ?? ""}</td>
                          <td className="px-3 py-1.5">
                            {c.severity
                              ? <span className="capitalize font-medium" style={{ color: SEV_COLOR[c.severity] ?? SEV_FALLBACK }}>{c.severity}</span>
                              : ""}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums">
                            {c.cvss_score != null ? (
                              <span
                                className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
                                style={{ backgroundColor: `${scoreColor(c.cvss_score)}22`, color: scoreColor(c.cvss_score) }}
                              >{c.cvss_score.toFixed(1)}</span>
                            ) : ""}
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
                  <p className="text-xs font-semibold text-ink-3">Recent news</p>
                  {detail.recent_news.slice(0, 3).map((n) => (
                    <a
                      key={n.id}
                      href={n.url}
                      target="_blank" rel="noopener noreferrer"
                      className="block rounded border border-line-1 px-3 py-2 transition-colors hover:border-line-3"
                    >
                      <p className="text-sm text-ink-1 line-clamp-1">{n.title}</p>
                      <p className="mt-0.5 text-xs text-ink-3">{n.source_name} · {n.published_date?.slice(0, 10)}</p>
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
