import { useRef, useState } from "react";
import { Boxes, BookOpen, LayoutDashboard, Newspaper, Package, Settings, TrendingUp, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SchmeckleIcon } from "./SchmeckleIcon";
import type { User } from "@/types";

export const SECTORS = ["All", "PyPI", "npm", "News", "Predict", "Leaderboard", "Dashboard", "Settings", "How"] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_PATH: Record<Sector, string> = {
  All: "/",
  PyPI: "/pypi",
  npm: "/npm",
  News: "/news",
  Predict: "/predict",
  Leaderboard: "/leaderboard",
  Dashboard: "/dashboard",
  Settings: "/settings",
  How: "/how-it-works",
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
  How: <BookOpen className="h-3.5 w-3.5" />,
};

const TAB_LABEL: Partial<Record<Sector, string>> = {
  PyPI: "PyPI",
  npm: "npm",
};

interface NavbarProps {
  user?: User;
  activeSector: Sector;
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
            : "border-transparent text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {TAB_ICON[s]}
      {TAB_LABEL[s] ?? s}
    </a>
  );
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function Navbar({ user, activeSector }: NavbarProps) {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, user: auth0User } = useAuth();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const publicTabs: Sector[] = ["News", "Leaderboard", "How"];
  const authTabs: Sector[] = ["PyPI", "npm", "Predict"];
  const visibleTabs = isAuthenticated ? [...publicTabs, ...authTabs] : publicTabs;

  const avatarSrc = user?.avatar_url ?? (auth0User as { picture?: string })?.picture;

  return (
    <header
      className="sticky top-0 z-50 border-b border-zinc-800"
      style={{ backgroundColor: "#15191D" }}
    >
      {/* Top bar: logo + right controls */}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate("/"); }}
          className="flex shrink-0 items-center gap-2"
        >
          <img src="/logo.png" alt="Polydelve" className="h-7 object-contain invert" />
          <span className="text-base font-bold tracking-tight text-white">Polydelve</span>
        </a>

        <div className="ml-auto flex items-center gap-2">
          {/* Schmeckles */}
          {isAuthenticated && user && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-[#1C2229] px-3 py-1.5">
              <SchmeckleIcon className="h-5 w-5" />
              <span className="text-sm font-bold text-white">{user.schmeckles.toLocaleString()}</span>
            </div>
          )}

          {/* Auth */}
          {isLoading ? null : isAuthenticated ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="h-7 w-7 rounded-full object-cover ring-2 ring-transparent hover:ring-[#FDE832] transition-all" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors" />
                )}
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-zinc-700 bg-[#1C2128] py-1 shadow-xl"
                  onMouseLeave={() => setDropdownOpen(false)}
                >
                  <button
                    onClick={() => { setDropdownOpen(false); navigate(SECTOR_PATH["Dashboard"]); }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700/50 hover:text-white transition-colors"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); navigate(SECTOR_PATH["Settings"]); }}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700/50 hover:text-white transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                  <div className="my-1 border-t border-zinc-700" />
                  <button
                    onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-700/50 hover:text-red-300 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              )}
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

      {/* Tab strip */}
      <div className="overflow-x-auto scrollbar-none border-t border-zinc-800/60">
        <nav className="mx-auto flex max-w-7xl items-stretch justify-center px-4 min-w-max md:min-w-0">
          {visibleTabs.map((s) => (
            <Tab key={s} s={s} active={activeSector === s} />
          ))}
        </nav>
      </div>
    </header>
  );
}
