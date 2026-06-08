import { useState } from "react";
import { Boxes, LayoutDashboard, Newspaper, Package, Search, TrendingUp, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SchmeckleIcon } from "./SchmeckleIcon";
import type { User } from "@/types";

export const SECTORS = ["All", "PyPI", "npm", "News", "Predict", "Leaderboard", "Dashboard", "Admin"] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_PATH: Record<Sector, string> = {
  All: "/",
  PyPI: "/pypi",
  npm: "/npm",
  News: "/news",
  Predict: "/predict",
  Leaderboard: "/leaderboard",
  Dashboard: "/dashboard",
  Admin: "/admin",
};

export function pathToSector(pathname: string): Sector {
  const entry = (Object.entries(SECTOR_PATH) as [Sector, string][]).find(
    ([, p]) => p === pathname || (p !== "/" && pathname.startsWith(p))
  );
  return entry ? entry[0] : "All";
}

const TAB_ICON: Partial<Record<Sector, React.ReactNode>> = {
  PyPI: <Package className="h-3.5 w-3.5" />,
  npm: <Boxes className="h-3.5 w-3.5" />,
  News: <Newspaper className="h-3.5 w-3.5" />,
  Predict: <TrendingUp className="h-3.5 w-3.5" />,
  Leaderboard: <Trophy className="h-3.5 w-3.5" />,
  Dashboard: <LayoutDashboard className="h-3.5 w-3.5" />,
};

const TAB_LABEL: Partial<Record<Sector, string>> = {
  PyPI: "PyPI",
  npm: "npm",
};

interface NavbarProps {
  user?: User;
  activeSector: Sector;
  onSearch?: (query: string) => void;
}

function Tab({ s, active }: { s: Sector; active: boolean }) {
  const isPredict = s === "Predict";
  return (
    <a
      href={SECTOR_PATH[s]}
      onClick={(e) => {
        e.preventDefault();
        window.history.pushState({}, "", SECTOR_PATH[s]);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
      className={`flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors border-b-2 ${
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
    </a>
  );
}

export function Navbar({ user, activeSector, onSearch }: NavbarProps) {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, user: auth0User } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  const publicTabs: Sector[] = ["All", "News", "Leaderboard"];
  const authTabs: Sector[] = ["PyPI", "npm", "Predict", "Dashboard"];
  const visibleTabs = isAuthenticated ? [...publicTabs, ...authTabs] : publicTabs;

  return (
    <header
      className="sticky top-0 z-50 border-b border-zinc-800"
      style={{ backgroundColor: "#15191D" }}
    >
      {/* Top bar: logo + right controls */}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-2">
          <img src="/logo.png" alt="Polydelve" className="h-7 object-contain invert" />
          <span className="text-base font-bold tracking-tight text-white">Polydelve</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          {searchOpen ? (
            <input
              autoFocus
              type="text"
              placeholder="Search markets..."
              onChange={(e) => onSearch?.(e.target.value)}
              onBlur={() => setSearchOpen(false)}
              className="w-36 sm:w-48 rounded-full border border-zinc-700/60 bg-[#1C2229] py-1.5 px-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500"
            />
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
            >
              <Search className="h-4 w-4" />
            </button>
          )}

          {/* Schmeckles */}
          {isAuthenticated && user && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-[#1C2229] px-3 py-1.5">
              <SchmeckleIcon className="h-5 w-5" />
              <span className="text-sm font-bold text-white">{user.schmeckles.toLocaleString()}</span>
            </div>
          )}

          {/* Auth */}
          {isLoading ? null : isAuthenticated ? (
            <div className="flex items-center gap-2">
              {auth0User?.picture && (
                <img src={auth0User.picture} alt="" className="h-7 w-7 rounded-full object-cover" />
              )}
              <button
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                className="hidden sm:block text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => loginWithRedirect()}
              className="rounded-full bg-[#FDE832] px-3 sm:px-4 py-1.5 text-sm font-bold text-zinc-900 hover:bg-yellow-300 transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>

      {/* Tab strip — horizontally scrollable on mobile */}
      <div className="overflow-x-auto scrollbar-none border-t border-zinc-800/60">
        <nav className="mx-auto flex max-w-7xl items-stretch px-4 min-w-max md:min-w-0">
          {visibleTabs.map((s) => (
            <Tab key={s} s={s} active={activeSector === s} />
          ))}
          {isAuthenticated && (
            <>
              <div className="mx-1 my-2.5 w-px bg-zinc-800 shrink-0" />
              <Tab s="Admin" active={activeSector === "Admin"} />
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
