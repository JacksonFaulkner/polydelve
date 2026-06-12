import { useState } from "react"
import { useApi } from "@/lib/api"
import type { User } from "@/types"

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

interface Props {
  onComplete: (user: User) => void
}

export function UsernameModal({ onComplete }: Props) {
  const { authFetch } = useApi()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const validationError = value.length > 0 && !USERNAME_RE.test(value)
    ? "3–20 characters: letters, numbers, underscores only."
    : null

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!USERNAME_RE.test(value)) return
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      })
      if (res.status === 409) {
        setError("Username already taken.")
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.detail ?? "Something went wrong.")
        return
      }
      const user: User = await res.json()
      onComplete(user)
    } catch {
      setError("Network error.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-[#1C2128] p-8 shadow-2xl">
        <h2 className="mb-1 text-xl font-semibold text-white">Choose a username</h2>
        <p className="mb-6 text-sm text-zinc-400">
          Pick your display name for the leaderboard. You can change it later in settings.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(null) }}
              placeholder="e.g. cyber_wizard"
              maxLength={20}
              autoFocus
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-[#FDE832] focus:ring-1 focus:ring-[#FDE832]"
            />
            {(validationError || error) && (
              <p className="mt-1.5 text-xs text-red-400">{validationError ?? error}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !value || !!validationError}
            className="w-full rounded-lg bg-[#FDE832] py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Saving…" : "Set username"}
          </button>
        </form>
      </div>
    </div>
  )
}