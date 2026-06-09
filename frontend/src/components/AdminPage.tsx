import { useState } from "react"
import type { Market } from "@/types"

const STATUS_STYLES: Record<string, string> = {
  open: "bg-green-900/60 text-green-300",
  won: "bg-blue-900/60 text-blue-300",
  expired: "bg-zinc-700 text-zinc-400",
}

function StatusBadge({ status }: { status: Market["status"] }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

const EMPTY_FORM = {
  id: "",
  title: "",
  description: "",
  packageName: "",
  ecosystem: "PyPI",
  epssThreshold: "",
  cvssThreshold: "",
  durationDays: "30",
  purchasePrice: "100",
}

export function AdminPage() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editStatus, setEditStatus] = useState<Market["status"]>("open")
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [copied, setCopied] = useState(false)

  function saveStatus(id: string) {
    setMarkets((ms) => ms.map((m) => m.id === id ? { ...m, status: editStatus } : m))
    setEditing(null)
  }

  function deleteMarket(id: string) {
    if (!confirm("Delete this market?")) return
    setMarkets((ms) => ms.filter((m) => m.id !== id))
  }

  function createMarket() {
    if (!form.title || !form.packageName) return
    const id = `mkt-${form.packageName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`
    const epss = form.epssThreshold ? parseFloat(form.epssThreshold) : null
    const cvss = form.cvssThreshold ? parseFloat(form.cvssThreshold) : null
    const price = parseInt(form.purchasePrice) || 100
    const dur = parseInt(form.durationDays) || 30
    const payout = Math.round(price * (epss != null ? (1 / (1 - epss)) : 2))

    const market: Market = {
      id,
      title: form.title,
      description: form.description,
      grade: "F",
      max_payout: payout,
      opening_probability: epss ?? 0.5,
      status: "open",
      bet_count: 0,
      package: {
        name: form.packageName,
        ecosystem: form.ecosystem,
        weekly_downloads: null,
        epss_score: epss,
        has_mal_advisory: false,
        logo_url: null,
      },
      contract: {
        cvss_threshold: cvss,
        epss_threshold: epss,
        duration_days: dur,
        purchase_price: price,
      },
      probability_history: [],
    }
    setMarkets((ms) => [market, ...ms])
    setForm(EMPTY_FORM)
    setShowCreate(false)
  }

  function exportJson() {
    const json = JSON.stringify(markets, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Markets Admin</h1>
          <p className="text-xs text-zinc-500">{markets.length} markets · in-memory edit · export to update mock</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportJson}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
          >
            {copied ? "Copied!" : "Export JSON"}
          </button>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded bg-[#FDE832] px-3 py-1.5 text-xs font-bold text-zinc-900 hover:bg-yellow-300 transition-colors"
          >
            + New Market
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-200">New Market</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-zinc-500">Title</label>
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. requests actively exploited within 30 days"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-zinc-500">Description</label>
              <textarea
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500 resize-none"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Package name</label>
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500"
                value={form.packageName}
                onChange={(e) => setForm((f) => ({ ...f, packageName: e.target.value }))}
                placeholder="requests"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Ecosystem</label>
              <select
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500"
                value={form.ecosystem}
                onChange={(e) => setForm((f) => ({ ...f, ecosystem: e.target.value }))}
              >
                <option>PyPI</option>
                <option>npm</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500">EPSS threshold (0–1)</label>
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500"
                value={form.epssThreshold}
                onChange={(e) => setForm((f) => ({ ...f, epssThreshold: e.target.value }))}
                placeholder="0.94"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">CVSS threshold (optional)</label>
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500"
                value={form.cvssThreshold}
                onChange={(e) => setForm((f) => ({ ...f, cvssThreshold: e.target.value }))}
                placeholder="9.0"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Duration (days)</label>
              <select
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500"
                value={form.durationDays}
                onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))}
              >
                <option>7</option>
                <option>14</option>
                <option>30</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500">Price (sch)</label>
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500"
                value={form.purchasePrice}
                onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))}
                placeholder="100"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={createMarket}
              className="rounded bg-[#FDE832] px-4 py-1.5 text-xs font-bold text-zinc-900 hover:bg-yellow-300 transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => { setShowCreate(false); setForm(EMPTY_FORM) }}
              className="rounded border border-zinc-700 px-4 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Markets table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 border-b border-zinc-800">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Package</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Title</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">EPSS</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Duration</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Price</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Max Payout</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Bets</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {markets.map((m) => (
              <tr key={m.id} className="hover:bg-zinc-800/20">
                <td className="px-4 py-2.5">
                  <div className="font-mono text-xs text-zinc-300">{m.package.name}</div>
                  <div className="text-[10px] text-zinc-600">{m.package.ecosystem}</div>
                </td>
                <td className="px-4 py-2.5 max-w-xs">
                  <p className="text-xs text-zinc-300 line-clamp-2">{m.title}</p>
                </td>
                <td className="px-4 py-2.5">
                  {editing === m.id ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200 outline-none"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as Market["status"])}
                      >
                        <option value="open">open</option>
                        <option value="won">won</option>
                        <option value="expired">expired</option>
                      </select>
                      <button
                        onClick={() => saveStatus(m.id)}
                        className="text-[10px] text-green-400 hover:text-green-300"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <StatusBadge status={m.status} />
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400 tabular-nums">
                  {m.contract.epss_threshold != null ? `≥${(m.contract.epss_threshold * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400">
                  {m.contract.duration_days}d
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400 tabular-nums">
                  {m.contract.purchase_price} sch
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400 tabular-nums">
                  {m.max_payout} sch
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-400 tabular-nums">
                  {m.bet_count.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setEditing(m.id); setEditStatus(m.status) }}
                      className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMarket(m.id)}
                      className="text-xs text-red-600 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
