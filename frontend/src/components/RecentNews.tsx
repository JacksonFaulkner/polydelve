import type { NewsItem } from "@/types"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function RecentNews({ items }: { items: NewsItem[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-700/40 bg-[#181D21] p-4">
      <h3 className="mb-3 shrink-0 text-xs font-bold uppercase tracking-widest text-[#FDE832]">Recent news</h3>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="group">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs font-medium leading-snug text-zinc-200 group-hover:text-white hover:underline decoration-zinc-500 underline-offset-2 transition-colors line-clamp-2"
            >
              {item.title}
            </a>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-zinc-600">{item.source_name}</span>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-600">{timeAgo(item.published_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
