# Polydelve

> Open-source supply chain risk intelligence — track CVEs, EPSS trends, and exploit signals across your dependencies before they become incidents.

## What it does

- **CVE tracking** — monitor packages across npm, PyPI, and more for known vulnerabilities
- **EPSS trend charts** — see exploitation probability over time with CVE scatter overlay
- **Exploit signals** — OSV malicious advisory detection, PoC and active exploit flags
- **Prediction markets** — bet on whether a CVE gets exploited; let the market price your risk
- **Leaderboard** — top contributors ranked by accuracy

## Stack

- **Backend** — FastAPI, Duckdb, Motherduck, uv, Gemini Embed 2
- **Frontend** — React, Tailwind, Shadcn, Recharts
- **Data** — OSV, NVD, EPSS (FIRST.org)

<p align="center">
  <strong>Polydelve in action</strong><br/>
  <img src="./assets/demo.gif" alt="Polydelve demo" width="100%" />
</p>

## Running locally

```bash
# Install all dependencies
make install

# Start backend + frontend together
make dev
```

## Compliance

<p align="center"><i>Proud to be the only company to fail a SOC 2 audit by Delve.</i></p>

<p align="center">
  <img src="https://www.aomni.com/landing/assets/soc2.png" alt="NOT SOC 2 Compliant" height="120" />
</p>

## License

MIT
