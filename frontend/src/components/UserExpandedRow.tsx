import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { LeaderboardUser, LeaderboardContract, SchmecklePoint } from "@/types"
import { SchmeckleIcon } from "./SchmeckleIcon"
import { SchmeckleTimeline } from "./SchmeckleTimeline"
import { useApi } from "@/lib/api"

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-900/50 text-blue-300",
  won: "bg-green-900/50 text-green-300",
  lost: "bg-zinc-700 text-zinc-400",
  sold: "bg-yellow-900/50 text-yellow-300",
}

const MARKET_LABEL: Record<string, string> = {
  new_cve: "New CVE",
  epss_threshold: "EPSS Thresh",
}

function multiplier(c: LeaderboardContract): string {
  if (!c.purchase_price) return "—"
  return `${(c.max_payout / c.purchase_price).toFixed(1)}×`
}

const TABS = ["Contracts", "Timeline"] as const
type Tab = (typeof TABS)[number]

interface Props {
  user: LeaderboardUser
  colSpan: number
}

export function UserExpandedRow({ user, colSpan }: Props) {
  const { authFetch } = useApi()
  const [tab, setTab] = useState<Tab>("Contracts")
  const [timeline, setTimeline] = useState<SchmecklePoint[] | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)

  useEffect(() => {
    if (tab !== "Timeline" || timeline !== null) return
    setTimelineLoading(true)
    authFetch(`/users/leaderboard/${encodeURIComponent(user.id)}/timeline`)
      .then((r) => r.json())
      .then((d) => { setTimeline(d.points ?? []); setTimelineLoading(false) })
      .catch(() => setTimelineLoading(false))
  }, [tab, user.id, timeline])

  const sorted = [...user.contracts].sort((a, b) => {
    const order = { open: 0, won: 1, sold: 2, lost: 3 }
    return (order[a.status] ?? 9) - (order[b.status] ?? 9)
  })

  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800 bg-zinc-900/60 px-6 py-5">
              {/* Stats strip */}
              <div className="flex flex-wrap items-center gap-6 text-sm mb-4">
                <div>
                  <span className="text-xs text-zinc-500">Schmeckles</span>
                  <p className="font-medium text-zinc-200 tabular-nums flex items-center gap-1">
                    <SchmeckleIcon className="h-3.5 w-3.5" />
                    {user.schmeckles.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500">Total Contracts</span>
                  <p className="font-medium text-zinc-200">{user.total_contracts}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500">Open</span>
                  <p className="font-medium text-blue-300">{user.open_contracts}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500">Won</span>
                  <p className="font-medium text-green-300">{user.won_contracts}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-500">Win Rate</span>
                  <p className="font-medium text-zinc-200">
                    {user.total_contracts > 0
                      ? `${Math.round((user.won_contracts / user.total_contracts) * 100)}%`
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex gap-1 border-b border-zinc-800 mb-3">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors border-b-2 -mb-px ${
                      tab === t
                        ? "border-zinc-400 text-zinc-200"
                        : "border-transparent text-zinc-600 hover:text-zinc-400"
                    }`}
                  >
                    {t === "Contracts" ? `Contracts · ${user.total_contracts}` : t}
                  </button>
                ))}
              </div>

              {/* Contracts panel */}
              {tab === "Contracts" && (
                sorted.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto rounded border border-zinc-800">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-zinc-900">
                        <tr className="border-b border-zinc-800">
                          <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Package</th>
                          <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Type</th>
                          <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Status</th>
                          <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Paid</th>
                          <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Payout</th>
                          <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Multi</th>
                          <th className="px-3 py-1.5 text-left text-zinc-500 font-medium">Expires</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((c) => (
                          <tr key={c.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="px-3 py-1.5 font-mono">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                                    c.package_ecosystem === "npm"
                                      ? "bg-red-900/50 text-red-300"
                                      : "bg-blue-900/50 text-blue-300"
                                  }`}
                                >
                                  {c.package_ecosystem}
                                </span>
                                <span className="text-zinc-300 truncate max-w-32">{c.package_name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-zinc-500">
                              {MARKET_LABEL[c.market_type] ?? c.market_type}
                            </td>
                            <td className="px-3 py-1.5">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[c.status]}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-zinc-400 tabular-nums">{c.purchase_price}</td>
                            <td className="px-3 py-1.5 text-zinc-400 tabular-nums">{c.max_payout}</td>
                            <td className="px-3 py-1.5 text-zinc-300 tabular-nums">{multiplier(c)}</td>
                            <td className="px-3 py-1.5 text-zinc-500 tabular-nums">{c.expires_at.slice(0, 10)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-6 text-center text-xs text-zinc-600">No contracts</p>
                )
              )}

              {/* Timeline panel */}
              {tab === "Timeline" && (
                timelineLoading ? (
                  <p className="py-6 text-center text-xs text-zinc-500">Loading…</p>
                ) : timeline ? (
                  <SchmeckleTimeline points={timeline} />
                ) : (
                  <p className="py-6 text-center text-xs text-zinc-600">No data</p>
                )
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </td>
    </tr>
  )
}