export function EcoBadge({ ecosystem }: { ecosystem: string }) {
  return (
    <span className="inline-block shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
      {ecosystem}
    </span>
  )
}

export function MalBadge() {
  return (
    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
      MAL
    </span>
  )
}

const SEV_TEXT: Record<string, string> = {
  critical: "text-sev-critical",
  high: "text-sev-high",
  medium: "text-sev-medium",
  low: "text-sev-low",
}

export function SeverityLabel({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium capitalize ${SEV_TEXT[severity] ?? "text-ink-2"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {severity}
    </span>
  )
}
