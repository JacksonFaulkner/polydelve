import { useState } from "react"
import { useTourActions } from "@tour-kit/core"

const DISMISSED_KEY = "polydelve_tour_prompt_dismissed"

export function TourPrompt() {
  const { isActive, start } = useTourActions("site-tour")
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === "1" } catch { return false }
  })

  if (dismissed || isActive) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, "1") } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-72 rounded-xl border border-zinc-700 bg-[#1C2229] p-4 shadow-2xl">
      <p className="text-sm font-semibold text-white mb-1">New here?</p>
      <p className="text-xs text-zinc-400 leading-relaxed mb-3">
        Take a 60-second tour — see how packages are tracked and how to make a prediction.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { dismiss(); start() }}
          className="flex-1 rounded-lg bg-[#FDE832] py-1.5 text-xs font-bold text-zinc-900 hover:bg-yellow-300 transition-colors"
        >
          Start tour
        </button>
        <button
          onClick={dismiss}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Don't show again
        </button>
      </div>
    </div>
  )
}
