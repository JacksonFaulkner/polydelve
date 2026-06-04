import { useState, useEffect, useCallback } from "react"
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table"
import type { LeaderboardUser, LeaderboardResponse } from "@/types"
import { SchmeckleIcon } from "./SchmeckleIcon"
import { UserExpandedRow } from "./UserExpandedRow"
import { useApi } from "@/lib/api"
const PAGE_SIZE = 50

const col = createColumnHelper<LeaderboardUser>()

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

const columns = [
  col.accessor("rank", {
    header: () => <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">#</span>,
    enableSorting: false,
    cell: (info) => {
      const r = info.getValue()
      return (
        <span className="tabular-nums text-sm text-zinc-400">
          {MEDAL[r] ?? r}
        </span>
      )
    },
  }),
  col.accessor("username", {
    header: () => <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">User</span>,
    enableSorting: false,
    cell: (info) => {
      const v = info.getValue()
      return (
        <span className="font-mono text-sm text-zinc-100 truncate">
          {v ?? <span className="text-zinc-600 italic">anonymous</span>}
        </span>
      )
    },
  }),
  col.accessor("schmeckles", {
    header: () => <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Schmeckles</span>,
    enableSorting: false,
    cell: (info) => {
      const v = info.getValue()
      return (
        <div className="flex items-center gap-1.5">
          <SchmeckleIcon className="h-3.5 w-3.5 text-[#FDE832]" />
          <span className="tabular-nums text-sm text-zinc-200 font-medium">{v.toLocaleString()}</span>
        </div>
      )
    },
  }),
  col.accessor("total_contracts", {
    header: () => <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Contracts</span>,
    enableSorting: false,
    meta: { className: "hidden sm:table-cell" },
    cell: (info) => (
      <span className="tabular-nums text-sm text-zinc-400">{info.getValue()}</span>
    ),
  }),
  col.accessor("open_contracts", {
    header: () => <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Open</span>,
    enableSorting: false,
    meta: { className: "hidden sm:table-cell" },
    cell: (info) => {
      const v = info.getValue()
      return v > 0 ? (
        <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-xs text-blue-300">{v}</span>
      ) : <span className="text-zinc-600">0</span>
    },
  }),
  col.accessor("won_contracts", {
    header: () => <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Won</span>,
    enableSorting: false,
    meta: { className: "hidden sm:table-cell" },
    cell: (info) => {
      const v = info.getValue()
      return v > 0 ? (
        <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-300">{v}</span>
      ) : <span className="text-zinc-600">0</span>
    },
  }),
  col.display({
    id: "win_rate",
    header: () => <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">Win Rate</span>,
    meta: { className: "hidden md:table-cell" },
    cell: (info) => {
      const { total_contracts, won_contracts } = info.row.original
      if (!total_contracts) return <span className="text-zinc-600">—</span>
      const pct = Math.round((won_contracts / total_contracts) * 100)
      const color = pct >= 60 ? "bg-green-500" : pct >= 30 ? "bg-yellow-400" : "bg-zinc-500"
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
]

export function LeaderboardTable() {
  const { authFetch } = useApi()
  const [data, setData] = useState<LeaderboardUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function toggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`/users/leaderboard?page=${page}&page_size=${PAGE_SIZE}`)
      const json: LeaderboardResponse = await res.json()
      setData(json.users)
      setTotal(json.total)
    } catch (e) {
      console.error("Failed to fetch leaderboard", e)
    } finally {
      setLoading(false)
    }
  }, [page, authFetch])

  useEffect(() => { fetchData() }, [fetchData])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.ceil(total / PAGE_SIZE),
  })

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const colCount = columns.length

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-zinc-800">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-3 py-2.5 text-left whitespace-nowrap ${(header.column.columnDef.meta as { className?: string })?.className ?? ""}`}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
                <th className="px-2 py-2.5" />
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount + 1} className="py-12 text-center text-zinc-500">Loading…</td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colCount + 1} className="py-12 text-center text-zinc-500">No users</td>
              </tr>
            ) : (
              table.getRowModel().rows.flatMap((row) => {
                const user = row.original
                const isExpanded = expandedId === user.id
                return [
                  <tr
                    key={row.id}
                    onClick={() => toggleRow(user.id)}
                    className={`border-b border-zinc-800/50 cursor-pointer transition-colors hover:bg-zinc-800/30 ${isExpanded ? "bg-zinc-800/20" : ""}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`px-3 py-2.5 ${(cell.column.columnDef.meta as { className?: string })?.className ?? ""}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    <td className="px-2 py-2.5 text-zinc-600 text-xs select-none">
                      {isExpanded ? "▲" : "▼"}
                    </td>
                  </tr>,
                  ...(isExpanded
                    ? [
                        <UserExpandedRow
                          key={`${user.id}::expanded`}
                          user={user}
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

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{total.toLocaleString()} players</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-zinc-700 px-2.5 py-1 hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ←
          </button>
          <span>{page} / {totalPages}</span>
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