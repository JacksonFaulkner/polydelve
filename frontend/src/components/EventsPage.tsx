import React, { useCallback, useEffect, useMemo, useState } from "react"
import { createColumnHelper } from "@tanstack/react-table"
import { useQueryStates } from "nuqs"
import { Search } from "lucide-react"
import { useApi } from "@/lib/api"
import { usePagedFetch } from "@/lib/pagination"
import { ECOSYSTEM_OPTIONS, EVENT_TYPE_OPTIONS, SEVERITY_OPTIONS, eventFilterParsers } from "@/lib/filters"
import { DataTable } from "./DataTable"
import { FilterClear, FilterMulti, FilterSelect } from "./FilterBar"
import { PackageExpandedRow } from "./PackageExpandedRow"
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
const col = createColumnHelper<EventRow>()

const columns = [
  col.accessor("date", {
    header: "Date",
    cell: (info) => <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap">{fmtDate(info.getValue())}</span>,
  }),
  col.accessor("ecosystem", {
    header: "Eco",
    cell: (info) => <EcoBadge ecosystem={info.getValue()} />,
  }),
  col.accessor("name", {
    header: "Package",
    cell: (info) => <span className="font-mono text-sm text-zinc-200">{info.getValue()}</span>,
  }),
  col.accessor("type", {
    header: "Event",
    cell: (info) => {
      const meta = TYPE_META[info.getValue()]
      return (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${meta.text}`}>{meta.label}</span>
        </span>
      )
    },
  }),
  col.display({
    id: "what",
    header: "What happened",
    cell: (info) => <span className="text-xs text-zinc-500">{whatHappened(info.row.original)}</span>,
  }),
]

function rowKey(e: EventRow) {
  return `${e.ecosystem}::${e.name}::${e.type}::${e.date}::${e.cve_id ?? ""}`
}

export function EventsPage() {
  const { authFetch } = useApi()
  const [f, setF] = useQueryStates(eventFilterParsers, { history: "push" })
  const { window: window_, type, eco, q, sev, page } = f
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [debouncedQ, setDebouncedQ] = useState(q)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])

  const setFilter = useCallback((patch: Partial<typeof f>) => setF({ ...patch, page: 1 }), [setF])

  const url = useMemo(() => {
    const p = new URLSearchParams({ window: window_, page: String(page), page_size: String(PAGE_SIZE) })
    type.forEach((t) => p.append("type", t))
    if (eco) p.set("ecosystem", eco)
    if (debouncedQ) p.set("search", debouncedQ)
    if (sev) p.set("severity", sev)
    return `/events?${p}`
  }, [window_, page, type, eco, debouncedQ, sev])
  const { data, loading } = usePagedFetch<EventRow>(url, authFetch)
  const events = useMemo(() => data?.items ?? [], [data])
  const totalPages = data?.total_pages ?? 1
  const activeCount = [type.length ? 1 : null, eco, sev, window_ === "shallow" ? 1 : null].filter((v) => v != null).length

  const headerFilters: Record<string, React.ReactNode> = {
    date: (
      <FilterSelect
        compact
        label="Window"
        value={window_ === "dense" ? null : window_}
        options={[{ value: "shallow", label: "All time" }]}
        onChange={(v) => setFilter({ window: v ?? null })}
      />
    ),
    ecosystem: <FilterSelect compact label="Ecosystem" value={eco} options={[...ECOSYSTEM_OPTIONS]} onChange={(v) => setFilter({ eco: v })} />,
    type: <FilterMulti compact label="Event type" value={type} options={[...EVENT_TYPE_OPTIONS]} onChange={(v) => setFilter({ type: v.length ? v : null })} />,
    what: <FilterSelect compact label="Severity" value={sev} options={SEVERITY_OPTIONS} onChange={(v) => setFilter({ sev: v })} />,
  }
  const filteredColumns = columns.map((c) =>
    c.id && headerFilters[c.id] ? { ...c, meta: { ...c.meta, filter: headerFilters[c.id] } } : c,
  )

  const toolbar = (
    <>
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          placeholder="Search packages…"
          value={q}
          onChange={(e) => setF({ q: e.target.value || null, page: 1 }, { history: "replace" })}
          className="w-full bg-transparent pl-8 pr-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none"
        />
      </div>
      <FilterClear count={activeCount} onClear={() => setFilter({ type: null, eco: null, sev: null, window: null })} />
      <span className="shrink-0 text-xs text-zinc-500 pr-1">
        {data ? `${data.total.toLocaleString()} events` : ""}
      </span>
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-white">Security events</h1>
        <p className="text-sm text-zinc-500">
          A ledger of what happened — if a contract like this existed, it would've hit.
        </p>
      </div>

      <DataTable
        columns={filteredColumns}
        data={events}
        loading={loading}
        emptyText="No events in this window."
        toolbar={toolbar}
        rowKey={rowKey}
        expandedKey={expandedKey}
        onRowClick={(e) => setExpandedKey((prev) => (prev === rowKey(e) ? null : rowKey(e)))}
        renderExpanded={(e, colSpan) => (
          <PackageExpandedRow
            key={`${rowKey(e)}::expanded`}
            name={e.name}
            ecosystem={e.ecosystem}
            colSpan={colSpan}
          />
        )}
        footer={<Pagination page={page} totalPages={totalPages} onChange={(p) => setF({ page: p })} />}
      />
    </div>
  )
}
