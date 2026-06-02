import { useState, useEffect, useCallback, useMemo } from "react"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table"
import type { Package, PackageListResponse } from "@/types"
import { Tooltip } from "@/components/ui/Tooltip"
import { PackageExpandedRow } from "@/components/PackageExpandedRow"
import { useApi } from "@/lib/api"
const PAGE_SIZE = 50

const col = createColumnHelper<Package>()

function ColHeader({
  label,
  tip,
  source,
  sourceLabel,
}: {
  label: string
  tip: string
  source?: string
  sourceLabel?: string
}) {
  return (
    <Tooltip
      content={
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-200 leading-snug">{tip}</p>
          {source && (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[10px] text-[#FDE832] hover:underline pointer-events-auto"
            >
              ↗ {sourceLabel ?? "Source"}
            </a>
          )}
        </div>
      }
    >
      <span className="border-b border-dashed border-zinc-600 cursor-help">{label}</span>
    </Tooltip>
  )
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-zinc-400",
}

const columns = [
  col.accessor("name", {
    header: () => (
      <ColHeader
        label="Package"
        tip="Package name and registry. Covers the top 500 most-downloaded PyPI and npm packages tracked by Polydelve."
        source="https://hugovk.github.io/top-pypi-packages/"
        sourceLabel="hugovk/top-pypi-packages · anvaka/npmrank"
      />
    ),
    enableSorting: false,
    cell: (info) => {
      const eco = info.row.original.ecosystem
      return (
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              eco === "npm" ? "bg-red-900/50 text-red-300" : "bg-blue-900/50 text-blue-300"
            }`}
          >
            {eco}
          </span>
          <span className="truncate font-mono text-sm text-zinc-100">{info.getValue()}</span>
        </div>
      )
    },
  }),
  col.accessor("weekly_downloads", {
    header: () => (
      <ColHeader
        label="Weekly DL"
        tip="Average weekly downloads over the last 7 days. PyPI data from pypistats.org; npm data from the npm downloads API."
        source="https://pypistats.org"
        sourceLabel="pypistats.org · npmjs.com/downloads"
      />
    ),
    cell: (info) => {
      const v = info.getValue()
      if (!v) return <span className="text-zinc-600">—</span>
      return <span className="text-zinc-300 tabular-nums">{(v / 1_000_000).toFixed(1)}M</span>
    },
  }),
  col.accessor("epss_score", {
    header: () => (
      <ColHeader
        label="EPSS"
        tip="Exploit Prediction Scoring System — probability (0–100%) that this package's worst CVE will be exploited in the wild within 30 days. Published daily by FIRST.org. Higher = more dangerous."
        source="https://www.first.org/epss/"
        sourceLabel="first.org/epss — thank you FIRST!"
      />
    ),
    cell: (info) => {
      const v = info.getValue()
      if (v === null || v === undefined) return <span className="text-zinc-600">—</span>
      const pct = Math.round(v * 100)
      const color = pct >= 70 ? "bg-red-500" : pct >= 30 ? "bg-orange-400" : "bg-zinc-500"
      return (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-zinc-700">
            <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums text-xs text-zinc-300">{pct}%</span>
        </div>
      )
    },
  }),
  col.accessor("num_cves", {
    header: () => (
      <ColHeader
        label="CVEs"
        tip="Total number of known CVEs affecting this package, sourced from the OSV vulnerability database. Includes historical and active vulnerabilities."
        source="https://osv.dev"
        sourceLabel="osv.dev — thank you Google!"
      />
    ),
    cell: (info) => {
      const v = info.getValue()
      const maxCvss = info.row.original.max_cvss_score
      if (!v) return <span className="text-zinc-600">0</span>
      const badge = (
        <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-200 cursor-default">
          {v}
        </span>
      )
      if (maxCvss == null) return badge
      return (
        <Tooltip content={`Max CVSS: ${maxCvss.toFixed(1)}`}>
          {badge}
        </Tooltip>
      )
    },
  }),
  col.accessor("worst_severity", {
    header: () => (
      <ColHeader
        label="Severity"
        tip="Highest CVSS severity rating across all CVEs for this package. Based on CVSS v3/v4 vectors from OSV. Critical > High > Medium > Low."
        source="https://www.first.org/cvss/"
        sourceLabel="first.org/cvss"
      />
    ),
    enableSorting: false,
    cell: (info) => {
      const v = info.getValue()
      if (!v) return <span className="text-zinc-600">—</span>
      return (
        <span className={`text-xs font-medium capitalize ${SEVERITY_COLOR[v] ?? "text-zinc-400"}`}>
          {v}
        </span>
      )
    },
  }),
  col.accessor("risk_score", {
    header: () => (
      <ColHeader
        label="Risk Score"
        tip="Composite risk signal: weekly downloads × max EPSS score. Captures both blast radius (how widely used) and exploit likelihood. Not a standardised metric — use as a relative ranking."
      />
    ),
    cell: (info) => {
      const v = info.getValue()
      if (!v) return <span className="text-zinc-600">—</span>
      return <span className="tabular-nums text-sm text-zinc-200">{(v / 1_000_000).toFixed(1)}M</span>
    },
  }),
  col.accessor("has_mal_advisory", {
    header: () => (
      <ColHeader
        label="MAL"
        tip="Has an OSV MAL-* advisory — confirmed or suspected supply chain compromise (malicious code injected into the package)."
        source="https://osv.dev"
        sourceLabel="osv.dev"
      />
    ),
    enableSorting: false,
    cell: (info) =>
      info.getValue() ? (
        <span className="rounded bg-rose-900/60 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
          MAL
        </span>
      ) : null,
  }),
  // latest_cve_date and sectors injected inside component (need state closure)
]

const SORT_KEY_MAP: Record<string, string> = {
  weekly_downloads: "weekly_downloads",
  epss_score: "epss_score",
  num_cves: "num_cves",
  risk_score: "risk_score",
}

const CVE_WINDOW_OPTIONS: { label: string; days: number | null }[] = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: null },
]

interface Props {
  ecosystem?: "PyPI" | "npm"
}

export function PackagesTable({ ecosystem }: Props) {
  const { authFetch } = useApi()
  const [data, setData] = useState<Package[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sorting, setSorting] = useState<SortingState>([{ id: "risk_score", desc: true }])
  const [latestCveDays, setLatestCveDays] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  function toggleRow(name: string, ecosystem: string) {
    const key = `${ecosystem}::${name}`
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  const latestCveDateCol = col.accessor("latest_cve_date", {
    id: "latest_cve_date",
    header: () => (
      <div className="flex flex-col gap-1.5">
        <Tooltip
          content={
            <div className="space-y-1.5">
              <p className="text-xs text-zinc-200 leading-snug">
                Publication date of the most recently disclosed CVE for this package. Sourced from OSV.
              </p>
              <a
                href="https://osv.dev"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[10px] text-[#FDE832] hover:underline pointer-events-auto"
              >
                ↗ osv.dev
              </a>
            </div>
          }
        >
          <span className="border-b border-dashed border-zinc-600 cursor-help">Latest CVE</span>
        </Tooltip>
        <div className="flex gap-1">
          {CVE_WINDOW_OPTIONS.map(({ label, days }) => (
            <button
              key={label}
              onClick={(e) => { e.stopPropagation(); setLatestCveDays(days) }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                latestCveDays === days
                  ? "bg-[#FDE832] text-zinc-900"
                  : "border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    ),
    enableSorting: false,
    cell: (info) => {
      const v = info.getValue()
      if (!v) return <span className="text-zinc-600">—</span>
      return <span className="text-xs text-zinc-400">{v}</span>
    },
  })

  const allColumns = [...columns, latestCveDateCol, col.accessor("sectors", {
    id: "sectors_col",
    header: () => (
      <ColHeader
        label="Sectors"
        tip="Industry sectors this package is commonly used in, classified by Polydelve using package metadata and LLM analysis."
      />
    ),
    enableSorting: false,
    cell: (info) => {
      const sectors = info.getValue()
      if (!sectors?.length) return null
      return (
        <div className="flex flex-wrap gap-1">
          {sectors.slice(0, 2).map((s) => (
            <span key={s} className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {s}
            </span>
          ))}
          {sectors.length > 2 && (
            <span className="text-[10px] text-zinc-500">+{sectors.length - 2}</span>
          )}
        </div>
      )
    },
  })]

  const fetchData = useCallback(async () => {
    setLoading(true)
    const sort = sorting[0]
    const sortKey = sort ? (SORT_KEY_MAP[sort.id] ?? "risk_score") : "risk_score"
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(PAGE_SIZE),
      sort: sortKey,
    })
    if (ecosystem) params.set("ecosystem", ecosystem)
    if (latestCveDays !== null) params.set("latest_cve_days", String(latestCveDays))

    try {
      const res = await authFetch(`/packages?${params}`)
      const json: PackageListResponse = await res.json()
      setData(json.packages)
      setTotal(json.total)
    } catch (e) {
      console.error("Failed to fetch packages", e)
    } finally {
      setLoading(false)
    }
  }, [page, sorting, ecosystem, latestCveDays, authFetch])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setPage(1)
  }, [ecosystem, sorting, latestCveDays])

  const colCount = useMemo(() => allColumns.length, [allColumns.length])

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.ceil(total / PAGE_SIZE),
  })

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-3">
      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-zinc-800">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 whitespace-nowrap ${
                      header.column.getCanSort() ? "cursor-pointer select-none hover:text-zinc-300" : ""
                    }`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="text-zinc-600">
                          {{ asc: "↑", desc: "↓" }[header.column.getIsSorted() as string] ?? "↕"}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={allColumns.length} className="py-12 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={allColumns.length} className="py-12 text-center text-zinc-500">
                  No packages found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.flatMap((row) => {
                const pkg = row.original
                const key = `${pkg.ecosystem}::${pkg.name}`
                const isExpanded = expandedKey === key
                return [
                  <tr
                    key={row.id}
                    onClick={() => toggleRow(pkg.name, pkg.ecosystem)}
                    className={`border-b border-zinc-800/50 cursor-pointer transition-colors hover:bg-zinc-800/30 ${isExpanded ? "bg-zinc-800/20" : ""}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-zinc-600 text-xs select-none">
                      {isExpanded ? "▲" : "▼"}
                    </td>
                  </tr>,
                  ...(isExpanded
                    ? [
                        <PackageExpandedRow
                          key={`${key}::expanded`}
                          name={pkg.name}
                          ecosystem={pkg.ecosystem}
                          colSpan={colCount + 1}
                        />,
                      ]
                    : []),
                ]
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{total.toLocaleString()} packages</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-zinc-700 px-2.5 py-1 hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ←
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-zinc-700 px-2.5 py-1 hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
