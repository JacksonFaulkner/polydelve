import { useState, useEffect, useCallback } from "react"
import type { NewsItem, NewsResponse } from "@/types"
import { useApi } from "@/lib/api"
const PAGE_SIZE = 20

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-900/50 text-red-300 border-red-800",
  high: "bg-orange-900/50 text-orange-300 border-orange-800",
  medium: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  low: "bg-zinc-700/50 text-zinc-400 border-zinc-600",
}

const EXPLOIT_LABEL: Record<string, string> = {
  actively_exploited: "Active",
  poc_available: "PoC",
  patched: "Patched",
  unpatched: "Unpatched",
}

const EXPLOIT_STYLES: Record<string, string> = {
  actively_exploited: "bg-red-900/60 text-red-300",
  poc_available: "bg-orange-900/60 text-orange-300",
  patched: "bg-green-900/60 text-green-300",
  unpatched: "bg-zinc-700 text-zinc-400",
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return "just now"
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const SEVERITY_FILTERS = ["all", "critical", "high", "medium", "low"] as const
const EXPLOIT_FILTERS = [
  { label: "All", value: "" },
  { label: "Active", value: "actively_exploited" },
  { label: "PoC", value: "poc_available" },
  { label: "Unpatched", value: "unpatched" },
] as const

export function NewsPage() {
  const { authFetch } = useApi()
  const [items, setItems] = useState<NewsItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [severity, setSeverity] = useState("")
  const [exploitStatus, setExploitStatus] = useState("")
  const [loading, setLoading] = useState(false)

  const fetchNews = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
    if (severity) params.set("severity", severity)
    if (exploitStatus) params.set("exploit_status", exploitStatus)
    try {
      const res = await authFetch(`/news?${params}`)
      const json: NewsResponse = await res.json()
      setItems(json.items)
      setTotal(json.total)
    } catch (e) {
      console.error("Failed to fetch news", e)
    } finally {
      setLoading(false)
    }
  }, [page, severity, exploitStatus, authFetch])

  useEffect(() => { fetchNews() }, [fetchNews])
  useEffect(() => { setPage(1) }, [severity, exploitStatus])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">Severity:</span>
          {SEVERITY_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setSeverity(s === "all" ? "" : s)}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                (s === "all" && !severity) || severity === s
                  ? "bg-[#FDE832] text-zinc-900"
                  : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500">Status:</span>
          {EXPLOIT_FILTERS.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => setExploitStatus(value)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                exploitStatus === value
                  ? "bg-[#FDE832] text-zinc-900"
                  : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="py-20 text-center text-zinc-500">Loading…</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl border border-zinc-800 bg-[#181D21] p-4 transition-colors hover:border-zinc-600 hover:bg-[#1e2429]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  {/* Title */}
                  <p className="font-medium leading-snug text-zinc-100 line-clamp-2">
                    {item.title}
                  </p>

                  {/* Summary */}
                  {item.summary && (
                    <p className="text-xs leading-relaxed text-zinc-400 line-clamp-2">
                      {item.summary}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {item.severity && (
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_STYLES[item.severity]}`}>
                        {item.severity}
                      </span>
                    )}
                    {item.exploit_status && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${EXPLOIT_STYLES[item.exploit_status]}`}>
                        {EXPLOIT_LABEL[item.exploit_status]}
                      </span>
                    )}
                    {item.threat_actor && (
                      <span className="rounded bg-purple-900/50 px-1.5 py-0.5 text-[10px] text-purple-300">
                        {item.threat_actor}
                      </span>
                    )}
                    {item.affected_packages.slice(0, 3).map((p) => (
                      <span
                        key={`${p.ecosystem}:${p.name}`}
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                          p.ecosystem === "npm"
                            ? "bg-red-900/40 text-red-300"
                            : "bg-blue-900/40 text-blue-300"
                        }`}
                      >
                        {p.name}
                      </span>
                    ))}
                    {item.affected_packages.length > 3 && (
                      <span className="text-[10px] text-zinc-500">
                        +{item.affected_packages.length - 3} pkgs
                      </span>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-2 text-xs text-zinc-600">
                    {item.source_name && <span>{item.source_name}</span>}
                    <span>·</span>
                    <span>{timeAgo(item.published_at)}</span>
                    {item.sector_labels.slice(0, 2).map((s) => (
                      <span key={s} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{total.toLocaleString()} articles</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-zinc-700 px-2.5 py-1 hover:border-zinc-500 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ←
          </button>
          <span>{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-zinc-700 px-2.5 py-1 hover:border-zinc-500 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
