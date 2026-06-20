import { useEffect, useState, useCallback, Fragment } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useApi } from "@/lib/api"
import { SchmeckleTimeline } from "./SchmeckleTimeline"
import { SchmeckleIcon } from "./SchmeckleIcon"
import { ContractSimChart } from "./ContractSimChart"
import type { SchmecklePoint } from "@/types"

interface UserContract {
  id: string
  package_name: string
  ecosystem: string
  market_type: string
  cvss_threshold: number | null
  epss_threshold: number | null
  purchase_price: number
  max_payout: number
  opening_probability: number
  package_grade: number | null
  expires_at: string
  status: "open" | "won" | "sold" | "expired"
  resolved_at: string | null
  sell_price: number | null
  created_at: string
  current_sell_value: number | null
  multiplier: number
}

const STATUS_STYLE: Record<string, string> = {
  open: "text-[#FDE832] bg-[#FDE832]/10 border-[#FDE832]/30",
  won: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  sold: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  expired: "text-zinc-500 bg-zinc-800 border-zinc-700",
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86400000))
}

function pnlColor(v: number) {
  if (v > 0) return "text-emerald-400"
  if (v < 0) return "text-red-400"
  return "text-zinc-400"
}

export function DashboardPage() {
  const { authFetch } = useApi()
  const [contracts, setContracts] = useState<UserContract[]>([])
  const [timeline, setTimeline] = useState<SchmecklePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [selling, setSelling] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const meRes = await authFetch("/users/me")
      const me = await meRes.json()

      const [cRes, tRes] = await Promise.all([
        authFetch("/contracts/me"),
        authFetch(`/users/leaderboard/${me.id}/timeline`),
      ])
      const [cData, tData] = await Promise.all([cRes.json(), tRes.json()])
      setContracts(cData)
      setTimeline(tData.points ?? [])
    } catch (e) {
      console.error("Dashboard load failed:", e)
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { load() }, [load])

  async function handleSell(id: string) {
    setSelling(id)
    try {
      const res = await authFetch(`/contracts/${id}/sell`, { method: "POST" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(`Sell failed: ${err.detail ?? res.status}`)
        return
      }
      await load()
    } finally {
      setSelling(null)
    }
  }

  const open = contracts.filter((c) => c.status === "open")
  const closed = contracts.filter((c) => c.status !== "open")

  const totalInvested = open.reduce((s, c) => s + c.purchase_price, 0)
  const totalSellValue = open.reduce((s, c) => s + (c.current_sell_value ?? c.purchase_price), 0)
  const unrealizedPnl = totalSellValue - totalInvested

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-5 w-5 rounded-full border-2 border-[#FDE832] border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open contracts" value={open.length.toString()} />
        <StatCard label="Total invested" value={`${totalInvested.toLocaleString()} sch`} icon />
        <StatCard label="Current value" value={`${totalSellValue.toLocaleString()} sch`} icon />
        <StatCard
          label="Unrealized P&L"
          value={`${unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toLocaleString()} sch`}
          valueClass={pnlColor(unrealizedPnl)}
          icon
        />
      </div>

      {/* Balance timeline */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-400">Balance over time</h2>
        <div className="rounded-xl border border-zinc-800 bg-[#1C2229] p-4">
          <SchmeckleTimeline points={timeline} />
        </div>
      </section>

      {/* Active contracts */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-400">Active contracts ({open.length})</h2>
        {open.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-[#1C2229] p-8 text-center text-sm text-zinc-600">
            No open contracts. Go to Predict to buy one.
          </p>
        ) : (
          <ContractTable contracts={open} onSell={handleSell} selling={selling} showSell />
        )}
      </section>

      {/* History */}
      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-400">History ({closed.length})</h2>
          <ContractTable contracts={closed} onSell={handleSell} selling={selling} showSell={false} />
        </section>
      )}

    </div>
  )
}

function StatCard({
  label,
  value,
  valueClass,
  icon,
}: {
  label: string
  value: string
  valueClass?: string
  icon?: boolean
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#1C2229] p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 flex items-center gap-1 text-lg font-bold tabular-nums ${valueClass ?? "text-white"}`}>
        {icon && <SchmeckleIcon className="h-4 w-4 shrink-0" />}
        {value}
      </p>
    </div>
  )
}

function GradeScore({ grade }: { grade: number | null }) {
  if (grade == null) return <span className="text-zinc-600">  </span>
  const g = Math.round(grade * 10) / 10
  const color = g >= 8 ? "text-red-400 border-red-500/30 bg-red-500/10"
    : g >= 6 ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
    : g >= 4 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
    : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-bold tabular-nums ${color}`}>
      {g.toFixed(1)}
    </span>
  )
}

function ContractCard({
  c,
  onSell,
  selling,
  showSell,
}: {
  c: UserContract
  onSell: (id: string) => void
  selling: string | null
  showSell: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const sellVal = c.status === "sold" ? (c.sell_price ?? 0) : c.status === "won" ? c.max_payout : (c.current_sell_value ?? c.purchase_price)
  const pnl = sellVal - c.purchase_price
  const days = daysUntil(c.expires_at)

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#1C2229] p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <span className="font-medium text-white truncate block">{c.package_name}</span>
          <span className="text-xs text-zinc-500">{c.ecosystem}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <GradeScore grade={c.package_grade} />
          <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[c.status] ?? STATUS_STYLE.expired}`}>
            {c.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div>
          <p className="text-zinc-600 mb-0.5">Cost</p>
          <p className="tabular-nums text-zinc-300">{c.purchase_price.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-zinc-600 mb-0.5">Max payout</p>
          <p className="tabular-nums text-zinc-300">{c.max_payout.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-zinc-600 mb-0.5">P&L</p>
          <p className={`tabular-nums font-medium ${pnlColor(pnl)}`}>{pnl >= 0 ? "+" : ""}{pnl.toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">
          {c.status === "open"
            ? days === 0 ? <span className="text-red-400">Expires today</span> : `Expires in ${days}d`
            : c.resolved_at ? c.resolved_at.slice(0, 10) : c.expires_at.slice(0, 10)}
        </span>
        <div className="flex items-center gap-2">
          {showSell && (
            <button
              onClick={() => onSell(c.id)}
              disabled={selling === c.id || c.status !== "open"}
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {selling === c.id ? "..." : "Sell"}
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs mb-4">
            <Detail label="Contract ID" value={c.id.slice(0, 8) + "…"} />
            <Detail label="Opened" value={c.created_at.slice(0, 10)} />
            <Detail label="Multiplier" value={`${c.multiplier.toFixed(2)}×`} />
            <Detail label="Open probability" value={`${(c.opening_probability * 100).toFixed(1)}%`} />
            <Detail label="CVSS threshold" value={c.cvss_threshold != null ? `≥ ${c.cvss_threshold}` : ""} />
            <Detail label="EPSS threshold" value={c.epss_threshold != null ? `≥ ${(c.epss_threshold * 100).toFixed(1)}%` : ""} />
          </div>
          <ContractSimChart
            packageName={c.package_name}
            ecosystem={c.ecosystem}
            cvssThreshold={c.cvss_threshold}
            purchasePrice={c.purchase_price}
            durationDays={(() => {
              const d = Math.round((new Date(c.expires_at).getTime() - new Date(c.created_at).getTime()) / 86400000)
              return d <= 7 ? 7 : d <= 14 ? 14 : 30
            })()}
          />
        </div>
      )}
    </div>
  )
}

function ContractTable({
  contracts,
  onSell,
  selling,
  showSell,
}: {
  contracts: UserContract[]
  onSell: (id: string) => void
  selling: string | null
  showSell: boolean
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <>
      {/* Mobile card list */}
      <div className="sm:hidden space-y-3">
        {contracts.map((c) => (
          <ContractCard key={c.id} c={c} onSell={onSell} selling={selling} showSell={showSell} />
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="w-6 px-3 py-2.5" />
              <th className="px-4 py-2.5 font-medium">Package</th>
              <th className="px-4 py-2.5 font-medium">Risk</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium text-right">Cost</th>
              <th className="px-4 py-2.5 font-medium text-right">Max payout</th>
              <th className="px-4 py-2.5 font-medium text-right">Sell value</th>
              <th className="px-4 py-2.5 font-medium text-right">P&L</th>
              <th className="px-4 py-2.5 font-medium">Expires</th>
              {showSell && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {contracts.map((c) => {
              const sellVal = c.status === "sold" ? (c.sell_price ?? 0) : c.status === "won" ? c.max_payout : (c.current_sell_value ?? c.purchase_price)
              const pnl = sellVal - c.purchase_price
              const days = daysUntil(c.expires_at)
              const isOpen = expanded.has(c.id)

              return (
                <Fragment key={c.id}>
                  <tr
                    className="bg-[#1C2229] hover:bg-zinc-800/40 transition-colors cursor-pointer"
                    onClick={() => toggle(c.id)}
                  >
                    <td className="px-3 py-3 text-zinc-600">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-white">{c.package_name}</span>
                      <span className="ml-1.5 text-xs text-zinc-500">{c.ecosystem}</span>
                    </td>
                    <td className="px-4 py-3">
                      <GradeScore grade={c.package_grade} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[c.status] ?? STATUS_STYLE.expired}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{c.purchase_price.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">{c.max_payout.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                      {c.status === "open" ? (c.current_sell_value?.toLocaleString() ?? "") : ""}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${pnlColor(pnl)}`}>
                      {pnl >= 0 ? "+" : ""}{pnl.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {c.status === "open" ? (
                        days === 0 ? <span className="text-red-400">Today</span> : `${days}d`
                      ) : (
                        c.resolved_at ? c.resolved_at.slice(0, 10) : c.expires_at.slice(0, 10)
                      )}
                    </td>
                    {showSell && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onSell(c.id)}
                          disabled={selling === c.id || c.status !== "open"}
                          className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {selling === c.id ? "..." : "Sell"}
                        </button>
                      </td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr className="bg-zinc-900/60 border-b border-zinc-800/60">
                      <td colSpan={showSell ? 10 : 9} className="px-8 py-4">
                        <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-xs sm:grid-cols-4 mb-4">
                          <Detail label="Contract ID" value={c.id.slice(0, 8) + "…"} />
                          <Detail label="Opened" value={c.created_at.slice(0, 10)} />
                          <Detail label="Expires" value={c.expires_at} />
                          <Detail label="Multiplier" value={`${c.multiplier.toFixed(2)}×`} />
                          <Detail label="Open probability" value={`${(c.opening_probability * 100).toFixed(1)}%`} />
                          <Detail label="CVSS threshold" value={c.cvss_threshold != null ? `≥ ${c.cvss_threshold}` : ""} />
                          <Detail label="EPSS threshold" value={c.epss_threshold != null ? `≥ ${(c.epss_threshold * 100).toFixed(1)}%` : ""} />
                          <Detail label="Market type" value={c.market_type} />
                        </div>
                        <ContractSimChart
                          packageName={c.package_name}
                          ecosystem={c.ecosystem}
                          cvssThreshold={c.cvss_threshold}
                          purchasePrice={c.purchase_price}
                          durationDays={(() => {
                            const d = Math.round((new Date(c.expires_at).getTime() - new Date(c.created_at).getTime()) / 86400000)
                            return d <= 7 ? 7 : d <= 14 ? 14 : 30
                          })()}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-zinc-600">{label}</p>
      <p className="font-mono text-zinc-300">{value}</p>
    </div>
  )
}
