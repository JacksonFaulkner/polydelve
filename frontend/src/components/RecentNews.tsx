import type { NewsItem } from "@/types"

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function RecentNews({ items }: { items: NewsItem[] }) {
  return (
    <div className="rounded-xl border border-zinc-700/40 bg-[#181D21] p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#FDE832]">Recent news</h3>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="group">
            <p className="text-xs font-medium leading-snug text-zinc-200 group-hover:text-white transition-colors line-clamp-2">
              {item.title}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-zinc-600">{item.source}</span>
              <span className="text-zinc-700">·</span>
              <span className="text-xs text-zinc-600">{timeAgo(item.published_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
