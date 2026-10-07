import { lazy, Suspense, useCallback, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Navbar, pathToSector } from "./components/Navbar";
import type { Sector } from "./components/Navbar";
import { UsernameModal } from "./components/UsernameModal";
import { TourProvider } from "@tour-kit/react";
import { SiteTour } from "./components/SiteTour";
import type { User } from "./types";
import { useApi } from "@/lib/api";

// Code-split each page so recharts/framer-motion only load where they're used.
const PackagesTable = lazy(() => import("./components/PackagesTable").then((m) => ({ default: m.PackagesTable })));
const LeaderboardTable = lazy(() => import("./components/LeaderboardTable").then((m) => ({ default: m.LeaderboardTable })));
const NewsPage = lazy(() => import("./components/NewsPage").then((m) => ({ default: m.NewsPage })));
const PredictPage = lazy(() => import("./components/PredictPage").then((m) => ({ default: m.PredictPage })));
const EventsPage = lazy(() => import("./components/EventsPage").then((m) => ({ default: m.EventsPage })));
const DashboardPage = lazy(() => import("./components/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const SettingsPage = lazy(() => import("./components/SettingsPage").then((m) => ({ default: m.SettingsPage })));

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 rounded-full border-2 border-brand border-t-transparent animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <TourProvider>
      <AppInner />
    </TourProvider>
  );
}

function AppInner() {
  const { isAuthenticated, isLoading, ...dbg } = useAuth() as ReturnType<typeof useAuth> & { error?: Error };
  console.log("[auth-debug]", { isAuthenticated, isLoading, error: (dbg as { error?: Error }).error, url: window.location.href });
  const { getJson } = useApi();
  const [activeSector, setActiveSector] = useState<Sector>(() => pathToSector(window.location.pathname));

  useEffect(() => {
    // No homepage: land straight on Predict.
    // Keep search/hash: Auth0's ?code=&state= callback lands on "/" and the SDK
    // reads it after this effect runs.
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", "/predict" + window.location.search + window.location.hash);
    }
    const onPop = () => setActiveSector(pathToSector(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [me, setMe] = useState<User | null>(null);
  const refreshMe = useCallback(() => {
    // On failure keep the last known user rather than storing an error body.
    getJson<User>("/users/me").then(setMe).catch(() => {});
  }, [getJson]);
  useEffect(() => {
    if (isAuthenticated) refreshMe();
  }, [isAuthenticated, refreshMe]);

  const isValidUsername = (u: string | null | undefined) => !!u && /^[a-zA-Z0-9_]{3,20}$/.test(u);
  const needsUsername = isAuthenticated && me !== null && !isValidUsername(me.username);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const isFullHeight = activeSector === "News" || activeSector === "Predict";

  return (
    <div
      className={isFullHeight ? "flex h-dvh flex-col overflow-hidden text-ink-1" : "min-h-screen text-ink-1"}
    >
      <Navbar user={me ?? undefined} activeSector={activeSector} />

      {needsUsername && <UsernameModal onComplete={(user) => setMe(user)} />}
      <SiteTour />
      <main
        className={isFullHeight ? "mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col overflow-hidden px-4 py-4" : "mx-auto max-w-7xl px-4 py-6"}
      >
        <div className={isFullHeight ? "min-h-0 flex-1 overflow-hidden" : ""}>
        <Suspense fallback={<Spinner />}>
        {activeSector === "Settings" ? (
          <SettingsPage user={me} onUsernameChange={(u) => setMe(u)} />
        ) : activeSector === "News" ? (
          <NewsPage />
        ) : activeSector === "Dashboard" ? (
          <DashboardPage />
        ) : activeSector === "Predict" ? (
          <PredictPage onBuy={refreshMe} />
        ) : activeSector === "Events" ? (
          <EventsPage />
        ) : activeSector === "Leaderboard" ? (
          <LeaderboardTable />
        ) : (
          <PackagesTable ecosystem={activeSector} />
        )}
        </Suspense>
        </div>
      </main>
    </div>
  );
}
