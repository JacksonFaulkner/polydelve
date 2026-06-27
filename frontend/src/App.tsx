import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Navbar, pathToSector } from "./components/Navbar";
import type { Sector } from "./components/Navbar";
import { MarketSpotlight } from "./components/MarketSpotlight";
import { RecentNews } from "./components/RecentNews";
import { PackagesTable } from "./components/PackagesTable";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { NewsPage } from "./components/NewsPage";
import { PredictPage } from "./components/PredictPage";
import { DashboardPage } from "./components/DashboardPage";
import { SettingsPage } from "./components/SettingsPage";
import { HowItWorksPage } from "./components/HowItWorksPage";
import { UsernameModal } from "./components/UsernameModal";
import type { Market, NewsItem, User } from "./types";
import { useApi } from "@/lib/api";

export default function App() {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth();
  const { authFetch } = useApi();
  const [activeSector, setActiveSector] = useState<Sector>(() => pathToSector(window.location.pathname));

  useEffect(() => {
    const onPop = () => setActiveSector(pathToSector(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 639px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    authFetch("/featured-contracts")
      .then((r) => r.json())
      .then((data: Market[]) => {
        if (Array.isArray(data)) setMarkets(data);
      })
      .catch((err) => console.error("Failed to fetch featured contracts:", err));
  }, []);

  useEffect(() => {
    authFetch(`/news?page=1&page_size=10`)
      .then((r) => r.json())
      .then((d) => setNews(d.items ?? []))
      .catch((err) => console.error("Failed to fetch news:", err));
  }, []);

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

  async function handleBet(market: Market) {
    if (!isAuthenticated) {
      loginWithRedirect();
      return;
    }
    const { purchase_price, cvss_threshold, epss_threshold, duration_days } = market.contract;
    try {
      const res = await authFetch(`/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          package_name: market.package.name,
          ecosystem: market.package.ecosystem,
          cvss_threshold,
          epss_threshold,
          purchase_price,
          duration_days,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Bet failed: ${err.detail ?? res.status}`);
        return;
      }
      const data = await res.json();
      alert(`Contract bought! Max payout: ${data.max_payout} sch · ${Number(data.multiplier).toFixed(1)}×`);
      authFetch("/users/me").then((r) => r.json()).then(setMe).catch(() => {});
    } catch {
      alert("Network error. is the backend running?");
    }
  }

  const isHome = !["News", "Dashboard", "Predict", "Leaderboard", "PyPI", "npm", "Settings", "How"].includes(activeSector);
  const isFullHeight = isHome || activeSector === "News" || activeSector === "Predict";

  return (
    <div
      className={isFullHeight ? "flex h-dvh flex-col overflow-hidden text-white" : "min-h-screen text-white"}
      style={{ backgroundColor: "#15191D" }}
    >
      <Navbar user={me ?? undefined} activeSector={activeSector} />

      {needsUsername && <UsernameModal onComplete={(user) => setMe(user)} />}
      <main className={isFullHeight ? "mx-auto w-full max-w-7xl min-h-0 flex-1 overflow-hidden px-4 py-4" : "mx-auto max-w-7xl px-4 py-6"}>
        {activeSector === "Settings" ? (
          <SettingsPage user={me} onUsernameChange={(u) => setMe(u)} />
        ) : activeSector === "News" ? (
          <NewsPage />
        ) : activeSector === "Dashboard" ? (
          <DashboardPage />
        ) : activeSector === "Predict" ? (
          <PredictPage onBuy={() => authFetch("/users/me").then((r) => r.json()).then(setMe).catch(() => {})} />
        ) : activeSector === "How" ? (
          <HowItWorksPage />
        ) : activeSector === "Leaderboard" ? (
          <LeaderboardTable />
        ) : activeSector === "PyPI" || activeSector === "npm" ? (
          <PackagesTable ecosystem={activeSector} />
        ) : (
          <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-4 lg:grid-cols-[1fr_320px] lg:grid-rows-1">
            <div className="min-h-0 overflow-y-auto">
              {isMobile ? (
                markets.length > 0 && <MarketSpotlight markets={markets} onBet={handleBet} />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {[0, 1, 2].map((tier) => {
                    const size = Math.ceil(markets.length / 3);
                    const group = markets.slice(tier * size, (tier + 1) * size);
                    if (group.length === 0) return null;
                    return (
                      <div key={tier} className={tier === 0 ? "col-span-2" : ""}>
                        <MarketSpotlight markets={group} onBet={handleBet} showTitle={tier === 0} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex min-h-0 flex-col">
              <RecentNews items={news} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
