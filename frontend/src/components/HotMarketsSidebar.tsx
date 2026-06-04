import { SchmeckleIcon } from "./SchmeckleIcon"
import type { Market } from "@/types"

function fmtVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return v.toString()
}

interface Props {
  markets: Market[]
  onSelect: (market: Market) => void
}

export function HotMarketsSidebar({ markets, onSelect }: Props) {
  const sorted = [...markets].sort((a, b) => b.bet_count - a.bet_count).slice(0, 5)

  return (
    <div className="rounded-xl border border-zinc-700/40 bg-[#181D21] p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#FDE832]">Hot markets</h3>
      <ol className="space-y-3">
        {sorted.map((m, i) => (
          <li
            key={m.id}
            className="flex cursor-pointer items-start gap-3 hover:opacity-80 transition-opacity"
            onClick={() => onSelect(m)}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium leading-snug text-zinc-200 line-clamp-2">{m.title}</p>
            </div>
            <div className="shrink-0 flex flex-col items-end">
              <span className="text-sm font-bold text-white">
                {Math.round((m.probability_history.at(-1)?.prob ?? 0) * 100)}%
              </span>
              <div className="flex items-center gap-0.5">
                <span className="text-xs text-zinc-500">{fmtVolume(m.bet_count * m.contract.purchase_price)}</span>
                <SchmeckleIcon className="h-3 w-3" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
