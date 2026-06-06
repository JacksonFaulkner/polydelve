import { useState, useEffect, useCallback } from "react"
import type { NewsItem, NewsResponse } from "@/types"
import { useApi } from "@/lib/api"
import { PackageModal } from "./PackageModal"

const PAGE_SIZE = 20

const SEV_BORDER: Record<string, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-zinc-600",
}

const SEV_TEXT: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-zinc-400",
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

interface SelectedPkg { name: string; ecosystem: string }

function NewsCard({
  item,
  featured,
  onPackageClick,
}: {
  item: NewsItem
  featured?: boolean
  onPackageClick: (pkg: SelectedPkg) => void
}) {
  const borderColor = item.severity ? SEV_BORDER[item.severity] : "border-l-zinc-700"

  return (
    <div className={`flex border-l-4 ${borderColor} rounded-r-xl border border-zinc-800 bg-[#181D21] transition-colors hover:border-zinc-600 hover:bg-[#1e2429]`}>
      <div className="min-w-0 flex-1 space-y-2.5 p-4">
        {/* Top meta: severity + exploit + threat actor */}
        <div className="flex flex-wrap items-center gap-2">
          {item.severity && (
            <span className={`text-[11px] font-bold uppercase tracking-wider ${SEV_TEXT[item.severity]}`}>
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
        </div>

        {/* Title */}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`block font-semibold leading-snug text-zinc-100 hover:text-white transition-colors ${featured ? "text-lg" : "text-sm"}`}
        >
          {item.title}
        </a>

        {/* Summary */}
        {item.summary && (
          <p className={`leading-relaxed text-zinc-400 ${featured ? "text-sm line-clamp-3" : "text-xs line-clamp-2"}`}>
            {item.summary}
          </p>
        )}

        {/* Package chips — clickable */}
        {item.affected_packages.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.affected_packages.slice(0, featured ? 6 : 4).map((p) => (
              <button
                key={`${p.ecosystem}:${p.name}`}
                onClick={() => onPackageClick(p)}
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] transition-opacity hover:opacity-80 ${
                  p.ecosystem === "npm"
                    ? "bg-red-900/40 text-red-300"
                    : "bg-blue-900/40 text-blue-300"
                }`}
              >
                {p.name}
              </button>
            ))}
            {item.affected_packages.length > (featured ? 6 : 4) && (
              <span className="text-[10px] text-zinc-500">
                +{item.affected_packages.length - (featured ? 6 : 4)} pkgs
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600">
          {item.source_name && <span>{item.source_name}</span>}
          <span>·</span>
          <span>{timeAgo(item.published_at)}</span>
          {item.sector_labels.slice(0, 2).map((s) => (
            <span key={s} className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-500">{s}</span>
          ))}
          {item.company_labels.slice(0, 2).map((c) => (
            <span key={c} className="text-zinc-600">{c}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function NewsPage() {
  const { authFetch } = useApi()
  const [items, setItems] = useState<NewsItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [severity, setSeverity] = useState("")
  const [exploitStatus, setExploitStatus] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedPkg, setSelectedPkg] = useState<SelectedPkg | null>(null)

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
  const [featured, ...rest] = items

  return (
    <>
      {selectedPkg && (
        <PackageModal
          name={selectedPkg.name}
          ecosystem={selectedPkg.ecosystem}
          onClose={() => setSelectedPkg(null)}
        />
      )}

      <div className="space-y-5">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">Severity</span>
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
            <span className="text-xs text-zinc-500">Status</span>
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
          <span className="ml-auto text-xs text-zinc-600">{total.toLocaleString()} articles</span>
        </div>

        {loading ? (
          <div className="py-24 text-center text-zinc-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-24 text-center text-zinc-500">No articles found</div>
        ) : (
          <div className="space-y-3">
            {/* Featured */}
            {featured && (
              <NewsCard item={featured} featured onPackageClick={setSelectedPkg} />
            )}

            {/* Card grid */}
            {rest.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2">
                {rest.map((item) => (
                  <NewsCard key={item.id} item={item} onPackageClick={setSelectedPkg} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 text-xs text-zinc-500">
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
        )}
      </div>
    </>
  )
}
