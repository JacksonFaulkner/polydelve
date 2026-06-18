import React, { useState, useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight, ShieldAlert, Flame, AlertTriangle, Globe, Bell } from "lucide-react"
import type { NewsItem, NewsResponse } from "@/types"
import { useApi } from "@/lib/api"
import { PackageModal } from "./PackageModal"
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid"

const PAGE_SIZE = 20

const SEVERITY_FILTERS = ["all", "critical", "high", "medium", "low"] as const

interface SelectedPkg { name: string; ecosystem: string }

const SEV_GRADIENT: Record<string, string> = {
  critical: "from-purple-950/60 to-transparent",
  high:     "from-orange-950/60 to-transparent",
  medium:   "from-yellow-950/40 to-transparent",
  low:      "from-zinc-900/60 to-transparent",
}

const SEV_ICON: Record<string, React.ElementType> = {
  critical: ShieldAlert,
  high:     Flame,
  medium:   AlertTriangle,
  low:      Globe,
}

const EXPLOIT_LABEL: Record<string, string> = {
  actively_exploited: "Active",
  poc_available: "PoC",
  patched: "Patched",
  unpatched: "Unpatched",
}

const EXPLOIT_STYLES: Record<string, string> = {
  actively_exploited: "bg-purple-900/60 text-purple-300",
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

function newsBackground(item: NewsItem) {
  const grad = item.severity ? SEV_GRADIENT[item.severity] : "from-zinc-900/60 to-transparent"
  return (
    <div className={`absolute inset-0 bg-gradient-to-b ${grad} pointer-events-none`}>
      {item.affected_packages.length > 0 && (
        <div className="absolute bottom-16 left-4 right-4 flex flex-wrap gap-1 opacity-40">
          {item.affected_packages.slice(0, 6).map((p) => (
            <span key={`${p.ecosystem}:${p.name}`} className="rounded bg-zinc-700 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300">
              {p.name}
            </span>
          ))}
        </div>
      )}
      {item.exploit_status && (
        <span className={`absolute top-3 right-3 rounded px-1.5 py-0.5 text-[10px] font-medium ${EXPLOIT_STYLES[item.exploit_status]}`}>
          {EXPLOIT_LABEL[item.exploit_status]}
        </span>
      )}
      <div className="absolute bottom-2 right-3 text-[10px] text-zinc-600">
        {item.source_name} · {timeAgo(item.published_at)}
      </div>
    </div>
  )
}

const BENTO_LAYOUTS = [
  "lg:row-start-1 lg:row-end-4 lg:col-start-2 lg:col-end-3",
  "lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3",
  "lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4",
  "lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-2",
  "lg:col-start-3 lg:col-end-4 lg:row-start-2 lg:row-end-4",
]

export function NewsPage() {
  const { authFetch } = useApi()
  const [items, setItems] = useState<NewsItem[]>([])
  const [page, setPage] = useState(1)
  const [slide, setSlide] = useState(0)
  const [severity, setSeverity] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedPkg, setSelectedPkg] = useState<SelectedPkg | null>(null)

  const fetchNews = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
    if (severity) params.set("severity", severity)
    try {
      const res = await authFetch(`/news?${params}`)
      const json: NewsResponse = await res.json()
      setItems(json.items)
    } catch (e) {
      console.error("Failed to fetch news", e)
    } finally {
      setLoading(false)
    }
  }, [page, severity, authFetch])

  useEffect(() => { fetchNews() }, [fetchNews])
  useEffect(() => { setPage(1); setSlide(0) }, [severity])

  const slides: NewsItem[][] = []
  for (let i = 0; i < items.length; i += 5) slides.push(items.slice(i, i + 5))
  const current = slides[slide] ?? []
  const totalSlides = slides.length

  return (
    <>
      {selectedPkg && (
        <PackageModal
          name={selectedPkg.name}
          ecosystem={selectedPkg.ecosystem}
          onClose={() => setSelectedPkg(null)}
        />
      )}

      <div className="flex flex-col gap-3 h-full">
        {/* Controls */}
        <div className="flex shrink-0 items-center justify-center gap-1.5">
          <span className="text-xs text-zinc-500">Severity</span>
          {SEVERITY_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setSeverity(f === "all" ? "" : f)}
              className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                (f === "all" && !severity) || severity === f
                  ? "bg-[#FDE832] text-zinc-900"
                  : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {f}
            </button>
          ))}
          {totalSlides > 1 && <>
            <span className="text-zinc-700">·</span>
            <button
              onClick={() => setSlide((s) => Math.max(0, s - 1))}
              disabled={slide === 0}
              className="rounded-full border border-zinc-700 p-1 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="text-xs text-zinc-500">{slide + 1} / {totalSlides}</span>
            <button
              onClick={() => setSlide((s) => Math.min(totalSlides - 1, s + 1))}
              disabled={slide >= totalSlides - 1}
              className="rounded-full border border-zinc-700 p-1 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </>}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-zinc-500 text-sm">No articles found</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden">
            <BentoGrid className="h-full lg:grid-rows-3 [&>*]:bg-[#181D21] [&>*]:dark:[box-shadow:none] [&>*]:dark:[border:1px_solid_rgb(39_39_42)]">
              {current.slice(0, 5).map((item, i) => {
                const Icon = item.severity ? SEV_ICON[item.severity] : Bell
                return (
                  <BentoCard
                    key={item.id}
                    name={item.title}
                    description={item.summary ?? ""}
                    href={item.url}
                    cta="Read article"
                    Icon={Icon}
                    background={newsBackground(item)}
                    className={BENTO_LAYOUTS[i] ?? ""}
                  />
                )
              })}
            </BentoGrid>
          </div>
        )}
      </div>
    </>
  )
}
