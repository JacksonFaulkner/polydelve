import { useState } from "react"
import { useApi } from "@/lib/api"
import { usePaginatedFetch } from "@/lib/pagination"
import { Pagination } from "./Pagination"

type EventRow = {
  name: string
  ecosystem: string
  cve_id: string | null
  severity: string | null
  score: number | null
  date: string
  type: "cvss" | "epss" | "mal"
}

const TYPE_META: Record<EventRow["type"], { label: string; dot: string; text: string }> = {
  cvss: { label: "CVSS event", dot: "bg-[#FDE832]", text: "text-[#FDE832]" },
  epss: { label: "EPSS spike", dot: "bg-emerald-400", text: "text-emerald-400" },
  mal: { label: "MAL advisory", dot: "bg-rose-400", text: "text-rose-400" },
}

function EcoBadge({ ecosystem }: { ecosystem: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
      ecosystem === "npm" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"
    }`}>
      {ecosystem}
    </span>
  )
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function whatHappened(e: EventRow): string {
  if (e.type === "cvss") return e.cve_id ? `${e.cve_id} published (CVSS ${e.score?.toFixed(1) ?? "?"}, ${e.severity ?? "unknown"})` : `New CVE published (${e.severity ?? "unknown"})`
  if (e.type === "epss") return `EPSS crossed ${((e.score ?? 0) * 100).toFixed(0)}%`
  return "Malicious-package advisory published"
}

const PAGE_SIZE = 25

export function EventsPage() {
  const { authFetch } = useApi()
  const [window_, setWindow] = useState<"dense" | "shallow">("dense")

  const { page, setPage, data, loading } = usePaginatedFetch<EventRow>(
    (p, ps) => `/events?window=${window_}&page=${p}&page_size=${ps}`,
    authFetch,
    { pageSize: PAGE_SIZE, resetKey: window_ },
  )
  const events = data?.items ?? []
  const totalPages = data?.total_pages ?? 1

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-1 pb-4 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white">Security events</h1>
          <p className="text-sm text-zinc-500">
            A ledger of what happened — if a contract like this existed, it would've hit.
            {data && <span className="text-zinc-600"> {data.total.toLocaleString()} total.</span>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-md bg-zinc-900 p-0.5">
          <button
            onClick={() => setWindow("dense")}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${window_ === "dense" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            Last 30 days
          </button>
          <button
            onClick={() => setWindow("shallow")}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${window_ === "shallow" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            All time
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800/60">
        {loading ? (
          <div className="py-12 text-center text-sm text-zinc-500">Loading…</div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500">No events in this window.</div>
        ) : (
          events.map((e, i) => {
            const meta = TYPE_META[e.type]
            return (
              <div key={`${e.name}-${e.ecosystem}-${e.type}-${e.date}-${i}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-900/40">
                <span className="text-[11px] text-zinc-600 tabular-nums w-24 shrink-0">{fmtDate(e.date)}</span>
                <EcoBadge ecosystem={e.ecosystem} />
                <span className="font-mono text-sm text-zinc-200 truncate w-44 shrink-0" title={e.name}>{e.name}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.text}`}>{meta.label}</span>
                </span>
                <span className="text-xs text-zinc-500 truncate">{whatHappened(e)}</span>
              </div>
            )
          })
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  )
}
