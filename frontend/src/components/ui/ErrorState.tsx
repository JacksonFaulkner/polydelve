/** Inline "couldn't load" message with a retry button, used wherever a fetch
 * failure would otherwise look like an empty result. */
export function ErrorState({
  message = "Couldn't load this right now.",
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-ink-3">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="chip px-3 py-1"
        >
          Try again
        </button>
      )}
    </div>
  )
}
