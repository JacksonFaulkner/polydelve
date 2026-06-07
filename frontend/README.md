# polydelve-frontend

React + Vite frontend for Polydelve. TypeScript, Tailwind, Shadcn, Recharts, Auth0.

## Dev

```bash
npm install
npm run dev     # http://localhost:5173
```

Or from the repo root:

```bash
make fe
```

## Build

```bash
npm run build   # output → dist/
```

Deployed to S3 + CloudFront via `make deploy-fe`.

## Design

UI adapted for software-security forecasting. Initially inspired by prediction-market interfaces.
Attribution: [PolymarketDevs](https://x.com/PolymarketDevs) for early interface patterns.
