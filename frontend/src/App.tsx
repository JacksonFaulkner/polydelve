import { useState, useEffect } from "react"
import { Navbar } from "./components/Navbar"
import type { Sector } from "./components/Navbar"
import { MarketSpotlight } from "./components/MarketSpotlight"
import { MarketCard } from "./components/MarketCard"
import { HotMarketsSidebar } from "./components/HotMarketsSidebar"
import { RecentNews } from "./components/RecentNews"
import marketsData from "../mocks/markets.json"
import spotlightData from "../mocks/market_spotlight.json"
import userData from "../mocks/user.json"
import type { Market, NewsItem, SpotlightMarket, User } from "./types"

const API = import.meta.env.VITE_API_URL ?? "/api"

const markets = marketsData as Market[]
const spotlight = spotlightData as SpotlightMarket
const user = userData as User

const SPOTLIGHT_ID = spotlight.id

export default function App() {
  const [activeSector, setActiveSector] = useState<Sector>("All")
  const [featuredId, setFeaturedId] = useState(markets[0].id)
  const [news, setNews] = useState<NewsItem[]>([])

  useEffect(() => {
    fetch(`${API}/news`)
      .then((r) => r.json())
      .then(setNews)
      .catch((err) => console.error("Failed to fetch news:", err))
  }, [])

  const gridMarkets = markets.filter((m) => m.id !== SPOTLIGHT_ID)

  function handleBet(market: Market | SpotlightMarket) {
    alert(`Placed bet on: ${market.title}`)
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "#15191D" }}>
      <Navbar user={user} activeSector={activeSector} onSectorChange={setActiveSector} />

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">

          {/* Left column */}
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

          {/* Right sidebar */}
          <div className="space-y-4">
            <HotMarketsSidebar markets={gridMarkets} onSelect={(m) => setFeaturedId(m.id)} />
            <RecentNews items={news} />
          </div>

        </div>
      </main>
    </div>
  )
}
