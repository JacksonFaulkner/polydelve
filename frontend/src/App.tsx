import { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import type { Sector } from "./components/Navbar";
import { MarketSpotlight } from "./components/MarketSpotlight";
import { MarketCard } from "./components/MarketCard";
import { HotMarketsSidebar } from "./components/HotMarketsSidebar";
import { RecentNews } from "./components/RecentNews";
import { PackagesTable } from "./components/PackagesTable";
import { NewsPage } from "./components/NewsPage";
import { PredictPage } from "./components/PredictPage";
import marketsData from "../mocks/markets.json";
import spotlightData from "../mocks/market_spotlight.json";
import userData from "../mocks/user.json";
import type { Market, NewsItem, SpotlightMarket, User } from "./types";

const API = import.meta.env.VITE_API_URL ?? "/api";

const baseMarkets = marketsData as unknown as Market[];
const baseSpotlight = spotlightData as unknown as SpotlightMarket;
const user = userData as User;

const SPOTLIGHT_ID = baseSpotlight.id;

export default function App() {
  const [activeSector, setActiveSector] = useState<Sector>("All");
  const [news, setNews] = useState<NewsItem[]>([]);
  const markets = baseMarkets;
  const spotlight = baseSpotlight;

  useEffect(() => {
    fetch(`${API}/news?page=1&page_size=10`)
      .then((r) => r.json())
      .then((d) => setNews(d.items ?? []))
      .catch((err) => console.error("Failed to fetch news:", err));
  }, []);


const gridMarkets = markets.filter((m) => m.id !== SPOTLIGHT_ID);

  async function handleBet(market: Market | SpotlightMarket) {
    const { purchase_price, cvss_threshold, epss_threshold, duration_days } = market.contract;
    try {
      const res = await fetch(`${API}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
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
    } catch {
      alert("Network error — is the backend running?");
    }
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "#15191D" }}>
      <Navbar user={user} activeSector={activeSector} onSectorChange={setActiveSector} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        {activeSector === "News" ? (
          <NewsPage />
        ) : activeSector === "Predict" ? (
          <PredictPage />
        ) : activeSector === "PyPI" || activeSector === "npm" ? (
          <PackagesTable ecosystem={activeSector} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              <MarketSpotlight market={spotlight} onBet={handleBet} />
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
