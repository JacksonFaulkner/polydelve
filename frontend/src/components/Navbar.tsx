import { SchmeckleIcon } from "./SchmeckleIcon"
import type { User } from "@/types"

const SECTORS = ["All", "Tech", "Finance", "Crypto", "Healthcare", "Gov", "Infra", "PyPI", "npm"] as const
export type Sector = typeof SECTORS[number]

interface NavbarProps {
  user: User
  activeSector: Sector
  onSectorChange: (s: Sector) => void
  onSearch?: (query: string) => void
}

export function Navbar({ user, activeSector, onSectorChange, onSearch }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800" style={{ backgroundColor: "#15191D" }}>
      {/* Top row: logo | search | balance */}
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
        {/* Logo */}
        <div className="flex shrink-0 items-center gap-2">
          <img src="/logo.png" alt="Polydelve" className="h-10 object-contain invert" />
          <span className="text-lg font-bold tracking-tight text-white">Polydelve</span>
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search markets..."
            onChange={(e) => onSearch?.(e.target.value)}
            className="w-full rounded-full border border-zinc-700/60 bg-[#1C2229] py-2 pl-9 pr-4 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-zinc-500 focus:bg-[#222b33]"
          />
        </div>

        {/* Balance */}
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-zinc-700/60 bg-[#1C2229] px-4 py-1.5">
          <span className="font-bold text-white">{user.schmeckles.toLocaleString()}</span>
          <SchmeckleIcon className="h-8 w-8" />
        </div>
      </div>

      {/* Bottom row: sector tabs */}
      <div className="mx-auto max-w-7xl px-4 pb-1">
        <nav className="flex gap-1">
          {SECTORS.map((s) => (
            <button
              key={s}
              onClick={() => onSectorChange(s)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                activeSector === s
                  ? "text-white border-b-2 border-[#FDE832]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}
