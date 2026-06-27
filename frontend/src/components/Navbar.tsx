import { useRef, useState } from "react";
import { Boxes, BookOpen, LayoutDashboard, Menu, Newspaper, Package, Settings, TrendingUp, Trophy, X } from "lucide-react";
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
  Settings: <Settings className="h-3.5 w-3.5" />,
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

function Tab({ s, active, onClick }: { s: Sector; active: boolean; onClick?: () => void }) {
  const isPredict = s === "Predict";
  return (
    <a
      href={SECTOR_PATH[s]}
      onClick={(e) => {
        e.preventDefault();
        window.history.pushState({}, "", SECTOR_PATH[s]);
        window.dispatchEvent(new PopStateEvent("popstate"));
        onClick?.();
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // All content pages are browsable logged-out; betting is gated at the action.
  const visibleTabs: Sector[] = ["PyPI", "npm", "News", "Predict", "Leaderboard", "How"];

  const avatarSrc = user?.avatar_url ?? (auth0User as { picture?: string })?.picture;

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-zinc-800"
        style={{ backgroundColor: "#15191D" }}
      >
        {/* Top bar */}
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); navigate("/"); }}
            className="flex shrink-0 items-center gap-2"
          >
            <img src="/logo.png" alt="Polydelve" width={28} height={28} className="h-7 object-contain invert" />
            <span className="text-base font-bold tracking-tight text-white">Polydelve</span>
          </a>

          <div className="ml-auto flex items-center gap-2">
            {/* Schmeckles — hidden on mobile */}
            {isAuthenticated && user && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-[#1C2229] px-3 py-1.5">
                <SchmeckleIcon className="h-5 w-5" />
                <span className="text-sm font-bold text-white">{user.schmeckles.toLocaleString()}</span>
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              className="sm:hidden flex items-center justify-center h-8 w-8 rounded-lg text-zinc-400 hover:text-white transition-colors"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop auth */}
            {isLoading ? null : isAuthenticated ? (
              <div className="hidden sm:block relative" ref={dropdownRef}>
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

        {/* Desktop tab strip */}
        <div className="hidden sm:block relative overflow-x-auto scrollbar-none border-t border-zinc-800/60">
          <nav className="mx-auto flex max-w-7xl items-stretch px-4 md:min-w-0 md:justify-center">
            {visibleTabs.map((s) => (
              <Tab key={s} s={s} active={activeSector === s} />
            ))}
          </nav>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute inset-y-0 right-0 w-72 flex flex-col border-l border-zinc-800"
            style={{ backgroundColor: "#15191D" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              {isAuthenticated && user ? (
                <div className="flex items-center gap-2">
                  {avatarSrc && <img src={avatarSrc} alt="" className="h-7 w-7 rounded-full object-cover" />}
                  <div>
                    <p className="text-xs font-semibold text-white">{user.username ?? "Player"}</p>
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <SchmeckleIcon className="h-3.5 w-3.5" />
                      <span>{user.schmeckles.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-sm font-bold text-white">Menu</span>
              )}
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-2">
              {visibleTabs.map((s) => {
                const isActive = activeSector === s;
                const isPredict = s === "Predict";
                return (
                  <a
                    key={s}
                    href={SECTOR_PATH[s]}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(SECTOR_PATH[s]);
                      setDrawerOpen(false);
                    }}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? isPredict ? "text-[#FDE832] bg-[#FDE832]/5" : "text-white bg-zinc-800/60"
                        : isPredict ? "text-[#FDE832]/60 hover:text-[#FDE832]" : "text-zinc-400 hover:text-white hover:bg-zinc-800/40"
                    }`}
                  >
                    <span className={isActive ? (isPredict ? "text-[#FDE832]" : "text-white") : "text-zinc-600"}>
                      {TAB_ICON[s]}
                    </span>
                    {TAB_LABEL[s] ?? s}
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FDE832]" />}
                  </a>
                );
              })}

              {isAuthenticated && (
                <>
                  <div className="my-2 mx-4 border-t border-zinc-800" />
                  <a
                    href={SECTOR_PATH["Dashboard"]}
                    onClick={(e) => { e.preventDefault(); navigate(SECTOR_PATH["Dashboard"]); setDrawerOpen(false); }}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      activeSector === "Dashboard" ? "text-white bg-zinc-800/60" : "text-zinc-400 hover:text-white hover:bg-zinc-800/40"
                    }`}
                  >
                    <span className="text-zinc-600"><LayoutDashboard className="h-3.5 w-3.5" /></span>
                    Dashboard
                    {activeSector === "Dashboard" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FDE832]" />}
                  </a>
                  <a
                    href={SECTOR_PATH["Settings"]}
                    onClick={(e) => { e.preventDefault(); navigate(SECTOR_PATH["Settings"]); setDrawerOpen(false); }}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      activeSector === "Settings" ? "text-white bg-zinc-800/60" : "text-zinc-400 hover:text-white hover:bg-zinc-800/40"
                    }`}
                  >
                    <span className="text-zinc-600"><Settings className="h-3.5 w-3.5" /></span>
                    Settings
                    {activeSector === "Settings" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#FDE832]" />}
                  </a>
                </>
              )}
            </nav>

            {/* Drawer footer */}
            <div className="border-t border-zinc-800 px-4 py-3">
              {isLoading ? null : isAuthenticated ? (
                <button
                  onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                  className="w-full text-left text-sm text-red-400 hover:text-red-300 transition-colors py-1"
                >
                  Sign out
                </button>
              ) : (
                <button
                  onClick={() => { loginWithRedirect(); setDrawerOpen(false); }}
                  className="w-full rounded-full bg-[#FDE832] py-2 text-sm font-bold text-zinc-900 hover:bg-yellow-300 transition-colors"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
