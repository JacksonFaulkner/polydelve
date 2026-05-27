# Frontend Overview

React 19 + Vite + Tailwind v4 SPA.

## Components

| Component | Description |
|-----------|-------------|
| `Navbar` | Sticky top bar — logo, search, sector tabs, balance |
| `MarketSpotlight` | Hero card for featured market with probability chart |
| `MarketCard` | Compact market card in the grid |
| `HotMarketsSidebar` | Right sidebar — top markets by activity |
| `RecentNews` | Right sidebar — live news feed from BE |
| `FeaturedMarket` | Alternate featured layout |
| `GradeBadge` | A/B/C/D security grade indicator |
| `SchmeckleIcon` | Currency icon SVG |
| `SchmeckleChart` | Recharts probability chart |

## Data Flow

```
App.tsx
 ├── mocks/markets.json       → MarketSpotlight, MarketCard, HotMarketsSidebar
 └── GET /api/news (live)    → RecentNews
```

Markets still use mock JSON. Wire to `GET /markets` when BE data is ready.

## Env Vars

| Var | Default | Description |
|-----|---------|-------------|
| `VITE_API_URL` | `/api` | Backend base URL (uses Vite proxy in dev) |
