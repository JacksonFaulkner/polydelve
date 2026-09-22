import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Navbar, pathToSector } from "./components/Navbar";
import type { Sector } from "./components/Navbar";
import { PackagesTable } from "./components/PackagesTable";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { NewsPage } from "./components/NewsPage";
import { PredictPage } from "./components/PredictPage";
import { EventsPage } from "./components/EventsPage";
import { DashboardPage } from "./components/DashboardPage";
import { SettingsPage } from "./components/SettingsPage";
import { UsernameModal } from "./components/UsernameModal";
import { SignupPrompt } from "./components/SignupPrompt";
import { TourProvider } from "@tour-kit/core";
import { SiteTour } from "./components/SiteTour";
import type { User } from "./types";
import { useApi } from "@/lib/api";

export default function App() {
  return (
    <TourProvider>
      <AppInner />
    </TourProvider>
  );
}

function AppInner() {
  const { isAuthenticated, isLoading } = useAuth();
  const [showSignup, setShowSignup] = useState(false);
  const { authFetch } = useApi();
  const [activeSector, setActiveSector] = useState<Sector>(() => pathToSector(window.location.pathname));

  useEffect(() => {
    // No homepage: land straight on Predict.
    if (window.location.pathname === "/") window.history.replaceState({}, "", "/predict");
    const onPop = () => setActiveSector(pathToSector(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [me, setMe] = useState<User | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    authFetch("/users/me")
      .then((r) => r.json())
      .then(setMe)
      .catch((err) => console.error("Failed to fetch user:", err));
  }, [isAuthenticated]);

  const isValidUsername = (u: string | null | undefined) => !!u && /^[a-zA-Z0-9_]{3,20}$/.test(u);
  const needsUsername = isAuthenticated && me !== null && !isValidUsername(me.username);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "#15191D" }}>
        <div className="h-6 w-6 rounded-full border-2 border-[#FDE832] border-t-transparent animate-spin" />
      </div>
    );
  }

  const isFullHeight = activeSector === "News" || activeSector === "Predict";

  return (
    <div
      className={isFullHeight ? "flex h-dvh flex-col overflow-hidden text-white" : "min-h-screen text-white"}
      style={{ backgroundColor: "#15191D" }}
    >
      <Navbar user={me ?? undefined} activeSector={activeSector} />

      {needsUsername && <UsernameModal onComplete={(user) => setMe(user)} />}
      <SignupPrompt open={showSignup} onClose={() => setShowSignup(false)} />
      <SiteTour />
      <main
        className={isFullHeight ? "mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col overflow-hidden px-4 py-4" : "mx-auto max-w-7xl px-4 py-6"}
      >
        <div className={isFullHeight ? "min-h-0 flex-1 overflow-hidden" : ""}>
        {activeSector === "Settings" ? (
          <SettingsPage user={me} onUsernameChange={(u) => setMe(u)} />
        ) : activeSector === "News" ? (
          <NewsPage />
        ) : activeSector === "Dashboard" ? (
          <DashboardPage />
        ) : activeSector === "Predict" ? (
          <PredictPage onBuy={() => authFetch("/users/me").then((r) => r.json()).then(setMe).catch(() => {})} />
        ) : activeSector === "Events" ? (
          <EventsPage />
        ) : activeSector === "Leaderboard" ? (
          <LeaderboardTable />
        ) : (
          <PackagesTable ecosystem={activeSector} />
        )}
        </div>
      </main>
    </div>
  );
}
