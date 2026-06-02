import { useState, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"

interface TooltipProps {
  children: ReactNode
  content: ReactNode
}

export function Tooltip({ children, content }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  function show() {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ x: r.left + r.width / 2, y: r.top - 8 })
  }

  function hide() {
    setPos(null)
  }

  return (
    <>
      <span ref={ref} onMouseEnter={show} onMouseLeave={hide} className="inline-flex items-center">
        {children}
      </span>
      {pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-64 -translate-x-1/2 -translate-y-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl
              animate-in fade-in zoom-in-95 duration-150"
            style={{ left: pos.x, top: pos.y }}
          >
            {content}
            <span className="absolute left-1/2 top-full -translate-x-1/2 h-0 w-0 border-4 border-transparent border-t-zinc-800" />
          </div>,
          document.body,
        )}
    </>
  )
}
