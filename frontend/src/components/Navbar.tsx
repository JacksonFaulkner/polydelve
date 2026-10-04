import { useRef, useState } from "react";
import { Boxes, LayoutDashboard, ListTree, Menu, Newspaper, Package, Settings, TrendingUp, Trophy, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BitIcon } from "./BitIcon";
import type { User } from "@/types";

export const SECTORS = ["PyPI", "npm", "News", "Predict", "Events", "Leaderboard", "Dashboard", "Settings"] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_PATH: Record<Sector, string> = {
  PyPI: "/pypi",
  npm: "/npm",
  News: "/news",
  Predict: "/predict",
  Events: "/events",
  Leaderboard: "/leaderboard",
  Dashboard: "/dashboard",
  Settings: "/settings",
};

export function pathToSector(pathname: string): Sector {
  const entry = (Object.entries(SECTOR_PATH) as [Sector, string][]).find(
    ([, p]) => p === pathname || pathname.startsWith(p)
  );
  return entry ? entry[0] : "Predict";
}

const TAB_ICON: Partial<Record<Sector, React.ReactNode>> = {
  PyPI: <Package className="h-3.5 w-3.5" />,
  npm: <Boxes className="h-3.5 w-3.5" />,
  News: <Newspaper className="h-3.5 w-3.5" />,
  Predict: <TrendingUp className="h-3.5 w-3.5" />,
  Events: <ListTree className="h-3.5 w-3.5" />,
  Leaderboard: <Trophy className="h-3.5 w-3.5" />,
  Dashboard: <LayoutDashboard className="h-3.5 w-3.5" />,
  Settings: <Settings className="h-3.5 w-3.5" />,
};

const TAB_LABEL: Partial<Record<Sector, string>> = {
  PyPI: "PyPI",
  npm: "npm",
};

interface NavbarProps {
  user?: User;
  activeSector: Sector;
}

const TOUR_NAV_ID: Partial<Record<Sector, string>> = {
  PyPI: "nav-pypi",
  Predict: "nav-predict",
};

function Tab({ s, active, onClick }: { s: Sector; active: boolean; onClick?: () => void }) {
  return (
    <a
      href={SECTOR_PATH[s]}
      data-tour={TOUR_NAV_ID[s]}
      onClick={(e) => {
        e.preventDefault();
        window.history.pushState({}, "", SECTOR_PATH[s]);
        window.dispatchEvent(new PopStateEvent("popstate"));
        onClick?.();
      }}
      className={`flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors border-b-2 ${
        active ? "border-ink-1 text-ink-1" : "border-transparent text-ink-3 hover:text-ink-1"
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
  const visibleTabs: Sector[] = ["Predict", "PyPI", "npm", "News", "Events", "Leaderboard"];

  const avatarSrc = user?.avatar_url ?? (auth0User as { picture?: string })?.picture;

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-line-1 bg-surface-0"
      >
        {/* Top bar */}
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <a
            href="/predict"
            onClick={(e) => { e.preventDefault(); navigate("/predict"); }}
            className="flex shrink-0 items-center gap-2"
          >
            <img src="/logo.svg" alt="Polydelve" width={28} height={28} className="h-7 object-contain invert" />
          </a>

          {/* Desktop tab strip — inline w/ logo + sign in */}
          <nav className="hidden sm:flex items-stretch overflow-x-auto scrollbar-none ml-2">
            {visibleTabs.map((s) => (
              <Tab key={s} s={s} active={activeSector === s} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Bits — hidden on mobile */}
            {isAuthenticated && user && (
              <div className="hidden sm:flex items-center gap-1.5 rounded border border-line-2/60 bg-surface-2 px-3 py-1.5">
                <BitIcon className="h-5 w-5" />
                <span className="text-sm font-bold text-ink-1">{user.bits.toLocaleString()}</span>
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              className="sm:hidden flex items-center justify-center h-8 w-8 rounded text-ink-2 hover:text-ink-1 transition-colors"
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
                    <img src={avatarSrc} alt="" className="h-7 w-7 rounded-full object-cover ring-2 ring-transparent hover:ring-brand transition-all" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-surface-3 hover:bg-surface-3 transition-colors" />
                  )}
                </button>

                {dropdownOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-44 rounded border border-line-2 bg-surface-1 py-1 shadow-xl"
                    onMouseLeave={() => setDropdownOpen(false)}
                  >
                    <button
                      onClick={() => { setDropdownOpen(false); navigate(SECTOR_PATH["Dashboard"]); }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink-2 hover:bg-surface-3/50 hover:text-ink-1 transition-colors"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </button>
                    <button
                      onClick={() => { setDropdownOpen(false); navigate(SECTOR_PATH["Settings"]); }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink-2 hover:bg-surface-3/50 hover:text-ink-1 transition-colors"
                    >
                      <Settings className="h-4 w-4" />
                      Settings
                    </button>
                    <div className="my-1 border-t border-line-2" />
                    <button
                      onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-surface-3/50 hover:text-red-300 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => loginWithRedirect()}
                className="btn-primary px-3 sm:px-4 py-1.5 text-sm"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute inset-y-0 right-0 w-72 flex flex-col border-l border-line-1 bg-surface-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-line-1">
              {isAuthenticated && user ? (
                <div className="flex items-center gap-2">
                  {avatarSrc && <img src={avatarSrc} alt="" className="h-7 w-7 rounded-full object-cover" />}
                  <div>
                    <p className="text-xs font-semibold text-ink-1">{user.username ?? "Player"}</p>
                    <div className="flex items-center gap-1 text-xs text-ink-2">
                      <BitIcon className="h-3.5 w-3.5" />
                      <span>{user.bits.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-sm font-bold text-ink-1">Menu</span>
              )}
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-ink-3 hover:text-ink-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-2">
              {visibleTabs.map((s) => {
                const isActive = activeSector === s;
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
                        ? "text-ink-1 bg-surface-2"
                        : "text-ink-3 hover:text-ink-1 hover:bg-surface-2/50"
                    }`}
                  >
                    <span className={isActive ? "text-ink-1" : "text-ink-4"}>
                      {TAB_ICON[s]}
                    </span>
                    {TAB_LABEL[s] ?? s}
                    {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ink-1" />}
                  </a>
                );
              })}

              {isAuthenticated && (
                <>
                  <div className="my-2 mx-4 border-t border-line-1" />
                  <a
                    href={SECTOR_PATH["Dashboard"]}
                    onClick={(e) => { e.preventDefault(); navigate(SECTOR_PATH["Dashboard"]); setDrawerOpen(false); }}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      activeSector === "Dashboard" ? "text-ink-1 bg-surface-2/60" : "text-ink-2 hover:text-ink-1 hover:bg-surface-2/40"
                    }`}
                  >
                    <span className="text-ink-4"><LayoutDashboard className="h-3.5 w-3.5" /></span>
                    Dashboard
                    {activeSector === "Dashboard" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ink-1" />}
                  </a>
                  <a
                    href={SECTOR_PATH["Settings"]}
                    onClick={(e) => { e.preventDefault(); navigate(SECTOR_PATH["Settings"]); setDrawerOpen(false); }}
                    className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                      activeSector === "Settings" ? "text-ink-1 bg-surface-2/60" : "text-ink-2 hover:text-ink-1 hover:bg-surface-2/40"
                    }`}
                  >
                    <span className="text-ink-4"><Settings className="h-3.5 w-3.5" /></span>
                    Settings
                    {activeSector === "Settings" && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ink-1" />}
                  </a>
                </>
              )}
            </nav>

            {/* Drawer footer */}
            <div className="border-t border-line-1 px-4 py-3">
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
                  className="w-full btn-primary py-2 text-sm"
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
