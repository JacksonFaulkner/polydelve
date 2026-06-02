import { Boxes, Newspaper, Package, TrendingUp, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SchmeckleIcon } from "./SchmeckleIcon";
import type { User } from "@/types";

export const SECTORS = ["All", "PyPI", "npm", "News", "Predict", "Leaderboard", "Admin"] as const;
export type Sector = (typeof SECTORS)[number];

const INFO_TABS: Sector[] = ["All", "PyPI", "npm", "News"];
const ACTION_TABS: Sector[] = ["Predict", "Leaderboard"];

const TAB_ICON: Partial<Record<Sector, React.ReactNode>> = {
  PyPI: <Package className="h-3.5 w-3.5" />,
  npm: <Boxes className="h-3.5 w-3.5" />,
  News: <Newspaper className="h-3.5 w-3.5" />,
  Predict: <TrendingUp className="h-3.5 w-3.5" />,
  Leaderboard: <Trophy className="h-3.5 w-3.5" />,
};

const TAB_LABEL: Partial<Record<Sector, string>> = {
  PyPI: "PyPI Leaders",
  npm: "npm Leaders",
};

interface NavbarProps {
  user: User;
  activeSector: Sector;
  onSectorChange: (s: Sector) => void;
  onSearch?: (query: string) => void;
}

function Tab({
  s,
  active,
  onSectorChange,
}: {
  s: Sector;
  active: boolean;
  onSectorChange: (s: Sector) => void;
}) {
  const isPredict = s === "Predict";
  return (
    <button
      onClick={() => onSectorChange(s)}
      className={`flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors ${
        active
          ? isPredict
            ? "bg-[#FDE832] text-zinc-900"
            : "text-white border-b-2 border-[#FDE832]"
          : isPredict
            ? "border border-[#FDE832]/40 text-[#FDE832] hover:bg-[#FDE832]/10"
            : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {TAB_ICON[s]}
      {TAB_LABEL[s] ?? s}
    </button>
  );
}

export function Navbar({
  user,
  activeSector,
  onSectorChange,
  onSearch,
}: NavbarProps) {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, user: auth0User } = useAuth()

  return (
    <header
      className="sticky top-0 z-50 border-b border-zinc-800"
      style={{ backgroundColor: "#15191D" }}
    >
      {/* Top row */}
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <img
            src="/logo.png"
            alt="Polydelve"
            className="h-10 object-contain invert"
          />
          <span className="text-lg font-bold tracking-tight text-white">
            Polydelve
          </span>
        </div>

        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search markets..."
            onChange={(e) => onSearch?.(e.target.value)}
            className="w-full rounded-full border border-zinc-700/60 bg-[#1C2229] py-2 pl-9 pr-4 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition-colors focus:border-zinc-500 focus:bg-[#222b33]"
          />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-zinc-700/60 bg-[#1C2229] px-4 py-1.5">
            <span className="font-bold text-white">
              {user.schmeckles.toLocaleString()}
            </span>
            <SchmeckleIcon className="h-8 w-8" />
          </div>

          {isLoading ? null : isAuthenticated ? (
            <div className="flex items-center gap-2">
              {auth0User?.picture && (
                <img src={auth0User.picture} alt="" className="h-7 w-7 rounded-full" />
              )}
              <button
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => loginWithRedirect()}
              className="rounded-full border border-zinc-600 bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-200 hover:border-zinc-400 hover:text-white transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>

      {/* Bottom row: tabs */}
      <div className="mx-auto max-w-7xl px-4 pb-1">
        <nav className="flex items-center gap-1">
          {INFO_TABS.map((s) => (
            <Tab
              key={s}
              s={s}
              active={activeSector === s}
              onSectorChange={onSectorChange}
            />
          ))}

          {/* Divider */}
          <div className="mx-2 h-4 w-px bg-zinc-700" />

          {ACTION_TABS.map((s) => (
            <Tab
              key={s}
              s={s}
              active={activeSector === s}
              onSectorChange={onSectorChange}
            />
          ))}

          <div className="ml-auto">
            <button
              onClick={() => onSectorChange("Admin")}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                activeSector === "Admin"
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              Admin
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
