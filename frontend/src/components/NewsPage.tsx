import { useState, useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { NewsItem, NewsResponse } from "@/types"
import { useApi } from "@/lib/api"
import { ErrorState } from "@/components/ui/ErrorState"
import { PackageModal } from "./PackageModal"
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid"

const PAGE_SIZE = 20

interface SelectedPkg { name: string; ecosystem: string }


function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return "just now"
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

type CardSize = "large" | "medium" | "small"
const CARD_SIZES: CardSize[] = ["small", "medium", "medium", "small", "small", "medium"]

function screenshotUrl(url: string) {
  return `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`
}

const SUMMARY_LINES: Record<CardSize, string> = {
  large:  "line-clamp-8",
  medium: "line-clamp-8",
  small:  "line-clamp-4",
}

const THUMB_MAX_H: Record<CardSize, string> = {
  large:  "group-hover:max-h-52",
  medium: "group-hover:max-h-40",
  small:  "group-hover:max-h-28",
}

function faviconUrl(url: string) {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
  } catch { return null }
}

function newsBackground(item: NewsItem, size: CardSize) {
  const favicon = faviconUrl(item.url)

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden flex flex-col">
      {/* screenshot. slides down from top on hover */}
      <div className={`relative w-full max-h-0 overflow-hidden transition-[max-height] duration-500 ease-in-out ${THUMB_MAX_H[size]}`}>
        <img
          src={screenshotUrl(item.url)}
          alt=""
          className="w-full object-cover object-top"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-surface-1" />
      </div>

      {/* content */}
      <div className="flex flex-col px-4 pt-3 pb-4 group-hover:pt-2 transition-[padding] duration-300 flex-1 min-h-0">
        {/* source metadata. top */}
        <div className="flex items-center gap-1.5 mb-2 shrink-0">
          {favicon && <img src={favicon} alt="" className="h-3.5 w-3.5 rounded-sm opacity-70" />}
          <span className="text-[11px] font-medium text-ink-2">{item.source_name}</span>
          <span className="text-ink-4">·</span>
          <span className="text-[11px] text-ink-4">{timeAgo(item.published_at)}</span>
          {item.severity && (
            <>
              <span className="text-ink-4">·</span>
              <span className="text-[9px] font-bold text-ink-3">{item.severity}</span>
            </>
          )}
        </div>

        <p className={`font-bold text-ink-1 leading-snug shrink-0 ${size === "small" ? "text-xs line-clamp-4" : "text-sm line-clamp-4"}`}>
          {item.title}
        </p>

        {item.summary && (
          <div className={`border-t border-line-1/60 mt-2 pt-2 flex-1 overflow-hidden transition-all duration-300 ${size === "small" ? "group-hover:hidden" : ""}`}>
            <p className={`text-ink-2 leading-relaxed text-xs ${SUMMARY_LINES[size]}`}>
              {item.summary}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

const BENTO_LAYOUTS = [
  "lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-2",  // left top. small
  "lg:col-start-1 lg:col-end-2 lg:row-start-2 lg:row-end-4",  // left bottom. medium
  "lg:col-start-2 lg:col-end-3 lg:row-start-1 lg:row-end-3",  // center top. medium
  "lg:col-start-2 lg:col-end-3 lg:row-start-3 lg:row-end-4",  // center bottom. small
  "lg:col-start-3 lg:col-end-4 lg:row-start-1 lg:row-end-2",  // right top. small
  "lg:col-start-3 lg:col-end-4 lg:row-start-2 lg:row-end-4",  // right bottom. medium
]

export function NewsPage() {
  const { getJson } = useApi()
  const [items, setItems] = useState<NewsItem[]>([])
  const [slide, setSlide] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [selectedPkg, setSelectedPkg] = useState<SelectedPkg | null>(null)

  const fetchNews = useCallback(async () => {
    setLoading(true)
    setError(false)
    const params = new URLSearchParams({ page: "1", page_size: String(PAGE_SIZE) })
    try {
      const json = await getJson<NewsResponse>(`/news?${params}`)
      setItems(json.items)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [getJson])

  useEffect(() => { fetchNews() }, [fetchNews])

  const slides: NewsItem[][] = []
  for (let i = 0; i < items.length; i += 6) slides.push(items.slice(i, i + 6))
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
          {totalSlides > 1 && <>
            <button
              onClick={() => setSlide((s) => Math.max(0, s - 1))}
              disabled={slide === 0}
              className="rounded-full border border-line-2 p-1 text-ink-2 hover:border-line-3 hover:text-ink-1 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="text-xs text-ink-3">{slide + 1} / {totalSlides}</span>
            <button
              onClick={() => setSlide((s) => Math.min(totalSlides - 1, s + 1))}
              disabled={slide >= totalSlides - 1}
              className="rounded-full border border-line-2 p-1 text-ink-2 hover:border-line-3 hover:text-ink-1 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </>}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-ink-3 text-sm">Loading…</div>
        ) : error ? (
          <ErrorState onRetry={fetchNews} />
        ) : items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-ink-3 text-sm">No articles found</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden rounded border border-line-1 bg-surface-2">
            <BentoGrid className="h-full gap-px lg:grid-rows-3 [&>*]:bg-surface-1 [&>*]:rounded-none [&>*]:dark:[box-shadow:none] [&>*]:dark:border-0">
              {current.slice(0, 6).map((item, i) => {
                const size = CARD_SIZES[i] ?? "small"
                return (
                  <BentoCard
                    key={item.id}
                    name=""
                    href={item.url}
                    background={newsBackground(item, size)}
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
