import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Navbar, pathToSector } from "./components/Navbar";
import type { Sector } from "./components/Navbar";
import { MarketSpotlight } from "./components/MarketSpotlight";
import { MarketCard } from "./components/MarketCard";
import { HotMarketsSidebar } from "./components/HotMarketsSidebar";
import { RecentNews } from "./components/RecentNews";
import { PackagesTable } from "./components/PackagesTable";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { AdminPage } from "./components/AdminPage";
import { NewsPage } from "./components/NewsPage";
import { PredictPage } from "./components/PredictPage";
import { DashboardPage } from "./components/DashboardPage";
import type { Market, NewsItem, SpotlightMarket, User } from "./types";
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
  const [spotlight, setSpotlight] = useState<SpotlightMarket | null>(null);

  useEffect(() => {
    authFetch("/markets?status=open")
      .then((r) => r.json())
      .then((data: Market[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setSpotlight(data[0] as unknown as SpotlightMarket);
          setMarkets(data);
        }
      })
      .catch((err) => console.error("Failed to fetch markets:", err));
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "#15191D" }}>
        <div className="h-6 w-6 rounded-full border-2 border-[#FDE832] border-t-transparent animate-spin" />
      </div>
    );
  }

const gridMarkets = markets.filter((m) => m.id !== spotlight?.id);

  async function handleBet(market: Market | SpotlightMarket) {
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
          user_id: me?.id,
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
      alert("Network error — is the backend running?");
    }
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "#15191D" }}>
      <Navbar user={me ?? undefined} activeSector={activeSector} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        {activeSector === "Admin" ? (
          <AdminPage />
        ) : activeSector === "News" ? (
          <NewsPage />
        ) : activeSector === "Dashboard" ? (
          <DashboardPage />
        ) : activeSector === "Predict" ? (
          <PredictPage onBuy={() => authFetch("/users/me").then((r) => r.json()).then(setMe).catch(() => {})} />
        ) : activeSector === "Leaderboard" ? (
          <LeaderboardTable />
        ) : activeSector === "PyPI" || activeSector === "npm" ? (
          <PackagesTable ecosystem={activeSector} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              {spotlight && <MarketSpotlight market={spotlight} onBet={handleBet} />}
              <div>
                <h2 className="mb-4 text-sm font-semibold text-zinc-400">All markets</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {gridMarkets.map((m) => (
                    <MarketCard key={m.id} market={m} onBet={handleBet} />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <HotMarketsSidebar markets={gridMarkets} onSelect={() => {}} />
              <RecentNews items={news} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
