import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, ListFilter, X } from "lucide-react"

/**
 * Toolbar filter chips for DataTable. Each chip is a small dropdown; an active
 * chip turns yellow and shows its value with an × to clear. State lives in the
 * URL via nuqs on the page, these are pure controlled components.
 */

export type FilterOption<V extends string | number> = { value: V; label: string }

const chipBase = "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap"
const chipIdle = "border border-line-2 text-ink-2 hover:border-line-3 hover:text-ink-1"
const chipActive = "bg-surface-3 text-ink-1 border border-line-3"
// compact = lives inside a column header: idle is just a funnel icon, active shows the value
const compactBase = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal transition-colors whitespace-nowrap"
const compactIdle = "text-ink-4 hover:text-ink-2"

function chipClasses(compact: boolean | undefined, active: boolean) {
  if (compact) return `${compactBase} ${active ? chipActive : compactIdle}`
  return `${chipBase} ${active ? chipActive : chipIdle}`
}

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey) }
  }, [open])
  return { open, setOpen, ref }
}

function Popover({ children }: { children: ReactNode }) {
  return (
    <div className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] rounded border border-line-2 bg-surface-1 py-1 shadow-xl">
      {children}
    </div>
  )
}

function Item({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs hover:bg-surface-2/60 ${active ? "text-brand" : "text-ink-2"}`}
    >
      <span>{children}</span>
      {active && <Check className="h-3 w-3" />}
    </button>
  )
}

/** Single-choice filter. `null` = not set. */
export function FilterSelect<V extends string | number>({
  label, value, options, onChange, compact,
}: {
  label: string
  value: V | null
  options: FilterOption<V>[]
  onChange: (v: V | null) => void
  compact?: boolean
}) {
  const { open, setOpen, ref } = usePopover()
  const current = options.find((o) => o.value === value)
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className={chipClasses(compact, !!current)} title={compact ? `Filter by ${label.toLowerCase()}` : undefined}>
        {compact ? (current ? current.label : <ListFilter className="h-3 w-3" />) : <>{label}{current ? `: ${current.label}` : ""}</>}
        {current ? (
          <X className="h-3 w-3 ml-0.5" onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false) }} />
        ) : !compact ? (
          <ChevronDown className="h-3 w-3 opacity-70" />
        ) : null}
      </button>
      {open && (
        <Popover>
          {options.map((o) => (
            <Item key={String(o.value)} active={o.value === value} onClick={() => { onChange(o.value === value ? null : o.value); setOpen(false) }}>
              {o.label}
            </Item>
          ))}
        </Popover>
      )}
    </div>
  )
}

/** Multi-choice filter. Empty array = not set. */
export function FilterMulti<V extends string>({
  label, value, options, onChange, compact,
}: {
  label: string
  value: V[]
  options: FilterOption<V>[]
  onChange: (v: V[]) => void
  compact?: boolean
}) {
  const { open, setOpen, ref } = usePopover()
  const active = value.length > 0
  const summary = active
    ? value.length === 1
      ? options.find((o) => o.value === value[0])?.label
      : `${value.length}`
    : ""
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen((o) => !o)} className={chipClasses(compact, active)} title={compact ? `Filter by ${label.toLowerCase()}` : undefined}>
        {compact ? (active ? summary : <ListFilter className="h-3 w-3" />) : <>{label}{summary ? `: ${summary}` : ""}</>}
        {active ? (
          <X className="h-3 w-3 ml-0.5" onClick={(e) => { e.stopPropagation(); onChange([]); setOpen(false) }} />
        ) : !compact ? (
          <ChevronDown className="h-3 w-3 opacity-70" />
        ) : null}
      </button>
      {open && (
        <Popover>
          {options.map((o) => {
            const on = value.includes(o.value)
            return (
              <Item key={o.value} active={on} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
                {o.label}
              </Item>
            )
          })}
        </Popover>
      )}
    </div>
  )
}

/** Boolean filter. `null` = not set. */
export function FilterToggle({ label, value, onChange, compact }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void; compact?: boolean }) {
  const on = value === true
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(on ? null : true) }}
      className={chipClasses(compact, on)}
      title={compact ? label : undefined}
    >
      {compact ? (on ? "only" : <ListFilter className="h-3 w-3" />) : label}
      {on && <X className="h-3 w-3 ml-0.5" />}
    </button>
  )
}

/** "Clear all" link, shown only when something is active. */
export function FilterClear({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null
  return (
    <button onClick={onClear} className="text-xs text-ink-3 hover:text-ink-2 whitespace-nowrap">
      Clear {count}
    </button>
  )
}
