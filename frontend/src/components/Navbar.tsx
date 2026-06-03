import { useState } from "react";
import { Boxes, Newspaper, Package, Search, TrendingUp, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SchmeckleIcon } from "./SchmeckleIcon";
import type { User } from "@/types";

export const SECTORS = ["All", "PyPI", "npm", "News", "Predict", "Leaderboard", "Admin"] as const;
export type Sector = (typeof SECTORS)[number];

const TAB_ICON: Partial<Record<Sector, React.ReactNode>> = {
  PyPI: <Package className="h-3.5 w-3.5" />,
  npm: <Boxes className="h-3.5 w-3.5" />,
  News: <Newspaper className="h-3.5 w-3.5" />,
  Predict: <TrendingUp className="h-3.5 w-3.5" />,
  Leaderboard: <Trophy className="h-3.5 w-3.5" />,
};

const TAB_LABEL: Partial<Record<Sector, string>> = {
  PyPI: "PyPI",
  npm: "npm",
};

interface NavbarProps {
  user?: User;
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
      className={`flex items-center gap-1.5 px-3 py-4 text-sm font-medium transition-colors border-b-2 ${
        active
          ? isPredict
            ? "border-[#FDE832] text-[#FDE832]"
            : "border-[#FDE832] text-white"
          : isPredict
            ? "border-transparent text-[#FDE832]/60 hover:text-[#FDE832]"
            : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {TAB_ICON[s]}
      {TAB_LABEL[s] ?? s}
    </button>
  );
}

export function Navbar({ user, activeSector, onSectorChange, onSearch }: NavbarProps) {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, user: auth0User } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  const publicTabs: Sector[] = ["All", "News", "Leaderboard"];
  const authTabs: Sector[] = ["PyPI", "npm", "Predict"];
  const visibleTabs = isAuthenticated ? [...publicTabs, ...authTabs] : publicTabs;

  return (
    <header
      className="sticky top-0 z-50 border-b border-zinc-800"
      style={{ backgroundColor: "#15191D" }}
    >
      <div className="mx-auto flex max-w-7xl items-stretch px-4">
        {/* Logo */}
        <div className="flex shrink-0 items-center gap-2 pr-6 py-3">
          <img src="/logo.png" alt="Polydelve" className="h-7 object-contain invert" />
          <span className="text-base font-bold tracking-tight text-white">Polydelve</span>
        </div>

        {/* Tabs */}
        <nav className="flex items-stretch">
          {visibleTabs.map((s) => (
            <Tab key={s} s={s} active={activeSector === s} onSectorChange={onSectorChange} />
          ))}
          {isAuthenticated && (
            <>
              <div className="mx-1 my-3 w-px bg-zinc-800" />
              <Tab s="Admin" active={activeSector === "Admin"} onSectorChange={onSectorChange} />
            </>
          )}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {searchOpen ? (
            <input
              autoFocus
              type="text"
              placeholder="Search markets..."
              onChange={(e) => onSearch?.(e.target.value)}
              onBlur={() => setSearchOpen(false)}
              className="w-48 rounded-full border border-zinc-700/60 bg-[#1C2229] py-1.5 px-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500"
            />
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="rounded-full p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
            >
              <Search className="h-4 w-4" />
            </button>
          )}

          {isAuthenticated && user && (
            <div className="flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-[#1C2229] px-3 py-1.5">
              <SchmeckleIcon className="h-5 w-5" />
              <span className="text-sm font-bold text-white">{user.schmeckles.toLocaleString()}</span>
            </div>
          )}

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
              className="rounded-full bg-[#FDE832] px-4 py-1.5 text-sm font-bold text-zinc-900 hover:bg-yellow-300 transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
