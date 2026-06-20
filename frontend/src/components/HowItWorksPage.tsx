import { TrendingUp, Package, Zap, Shield, AlertTriangle, Trophy, Coins } from "lucide-react"

const STEPS = [
  {
    number: "01",
    title: "Pick a package",
    icon: <Package className="w-5 h-5" />,
    body: "Search for any PyPI or npm package that has known CVEs. The riskier the package, the higher your potential payout.",
  },
  {
    number: "02",
    title: "Set your conditions",
    icon: <Zap className="w-5 h-5" />,
    body: "Choose what security event you're betting will happen. an EPSS spike, a new high-severity CVE, or a malware advisory. Dial in the CVSS threshold and EPSS scenario.",
  },
  {
    number: "03",
    title: "Stake schmeckles",
    icon: <Coins className="w-5 h-5" />,
    body: "Pick how much to stake and your contract duration (7, 14, or 30 days). The simulated returns panel shows your potential payout for each event type before you commit.",
  },
  {
    number: "04",
    title: "Wait for events",
    icon: <Shield className="w-5 h-5" />,
    body: "Polydelve monitors the package continuously. If your predicted event fires before expiry, your contract pays out automatically.",
  },
  {
    number: "05",
    title: "Climb the leaderboard",
    icon: <Trophy className="w-5 h-5" />,
    body: "Schmeckles earned from winning contracts boost your rank. The leaderboard resets weekly. consistent good calls beat lucky one-offs.",
  },
]

const EVENT_TYPES = [
  {
    color: "text-emerald-400",
    dot: "bg-emerald-400",
    border: "border-emerald-400/20",
    label: "EPSS Spike",
    desc: "The Exploit Prediction Scoring System score for a CVE crosses your chosen threshold. EPSS rising fast signals the vuln is being actively weaponised.",
  },
  {
    color: "text-[#FDE832]",
    dot: "bg-[#FDE832]",
    border: "border-[#FDE832]/20",
    label: "CVSS Event",
    desc: "A new CVE is published (or an existing one is updated) with a CVSS score at or above your threshold. Higher threshold = harder to hit = bigger multiplier.",
  },
  {
    color: "text-rose-400",
    dot: "bg-rose-400",
    border: "border-rose-400/20",
    label: "MAL Advisory",
    desc: "A malware advisory is published for the package. someone snuck malicious code into a release. Rare, but pays the highest multiplier when it hits.",
  },
]

const GLOSSARY = [
  { term: "Schmeckles (sch)", def: "The in-app currency. You start with 1,000. Earn more by winning contracts." },
  { term: "EPSS", def: "Exploit Prediction Scoring System. a 0–100% daily probability that a CVE will be exploited in the next 30 days." },
  { term: "CVSS", def: "Common Vulnerability Scoring System. 0–10 severity score for a vulnerability. ≥7 is High, ≥9 is Critical." },
  { term: "MAL advisory", def: "A published notice that a specific package version contained intentionally malicious code." },
  { term: "EPSS Scenario slider", def: "Sets the EPSS level you're betting the package will reach. Can only go up from today's baseline. you can't bet on a package getting safer." },
  { term: "Sell value", def: "What you'd get if you sold your contract right now instead of holding to expiry. Decays toward max loss over time if no event fires." },
  { term: "Max loss", def: "The most you can lose on a contract. your stake minus any sell value at expiry. Always shown on the chart as a dashed red line." },
]

export function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl lg:max-w-5xl space-y-12 pb-16">

      {/* Hero */}
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-12">
        <div className="space-y-2">
          <h1 className="text-xs font-bold uppercase tracking-widest text-[#FDE832]">How it works</h1>
          <p className="text-2xl lg:text-3xl font-bold text-zinc-100">Predict security events.<br className="hidden lg:block" /> Earn schmeckles.</p>
          <p className="text-sm text-zinc-400 max-w-xl">
            Polydelve is a prediction market for open-source security. You stake in-app currency on whether a package will be hit by a security event before your contract expires.
          </p>
        </div>
        {/* Desktop stat strip */}
        <div className="hidden lg:flex flex-shrink-0 items-center gap-8 rounded-xl border border-zinc-800 bg-[#181D21] px-7 py-5">
          {[
            { label: "Starting balance", value: "1,000 sch" },
            { label: "Contract lengths", value: "7 / 14 / 30d" },
            { label: "Event types", value: "3" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-lg font-bold text-zinc-100">{s.value}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Getting started</h2>
        {/* mobile: stacked list; desktop: 2-col grid */}
        <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">
          {STEPS.map((step, i) => (
            <div key={step.number} className={`flex gap-4 rounded-xl border border-zinc-800 bg-[#181D21] px-5 py-4${i === STEPS.length - 1 ? " lg:col-span-2" : ""}`}>
              <div className="flex-shrink-0 flex items-start gap-3">
                <span className="text-[10px] font-bold tabular-nums text-zinc-600 mt-0.5 w-5">{step.number}</span>
                <span className="text-zinc-400 mt-0.5">{step.icon}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100 mb-0.5">{step.title}</p>
                <p className="text-sm text-zinc-400">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Event types + Payout side-by-side on desktop */}
      <div className="lg:grid lg:grid-cols-[1fr_1fr] lg:gap-6 space-y-12 lg:space-y-0">
        {/* Event types */}
        <section className="space-y-3 lg:flex lg:flex-col">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Event types</h2>
          {/* mobile / sm: individual cards in a row; desktop: flush grouped list */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:hidden">
            {EVENT_TYPES.map((e) => (
              <div key={e.label} className={`rounded-xl border ${e.border} bg-[#181D21] px-4 py-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${e.dot}`} />
                  <span className={`text-xs font-bold ${e.color}`}>{e.label}</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{e.desc}</p>
              </div>
            ))}
          </div>
          <div className="hidden lg:flex lg:flex-col lg:flex-1 rounded-xl border border-zinc-800 bg-[#181D21] overflow-hidden">
            {EVENT_TYPES.map((e, i) => (
              <div key={e.label} className={`flex gap-3 px-4 py-4 flex-1${i < EVENT_TYPES.length - 1 ? " border-b border-zinc-800/60" : ""}`}>
                <span className={`w-1 self-stretch rounded-full flex-shrink-0 ${e.dot} opacity-80`} />
                <div>
                  <span className={`text-xs font-bold ${e.color}`}>{e.label}</span>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-1">{e.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Payout explanation */}
        <section className="space-y-3 lg:flex lg:flex-col">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">How payouts work</h2>
          <div className="rounded-xl border border-zinc-800 bg-[#181D21] px-5 py-5 space-y-4 text-sm text-zinc-400 leading-relaxed lg:flex-1">
            <p>
              When you buy a contract, the payout multiplier is locked in based on the probability of each event firing. riskier bets pay more. The <span className="text-zinc-200 font-medium">Simulated Returns</span> panel shows your projected payout for each event type at your chosen stake.
            </p>
            <p>
              If <span className="text-emerald-400 font-medium">EPSS spike</span>, <span className="text-[#FDE832] font-medium">CVSS event</span>, or <span className="text-rose-400 font-medium">MAL advisory</span> fires before your contract expires, the corresponding payout is credited to your balance immediately.
            </p>
            <p>
              If nothing happens, you can sell early for the current <span className="text-zinc-200 font-medium">sell value</span> (which decays toward zero as expiry approaches), or hold and accept the max loss.
            </p>
          </div>
        </section>
      </div>

      {/* Chart guide */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Reading the chart</h2>
        <div className="rounded-xl border border-zinc-800 bg-[#181D21] px-5 py-5 lg:grid lg:grid-cols-2 lg:gap-x-10 space-y-3 lg:space-y-0">
          {[
            { color: "bg-emerald-400", label: "EPSS spike curve", desc: "Payout if the EPSS event fires on that date." },
            { color: "bg-[#FDE832]",   label: "CVSS event curve", desc: "Payout if a CVSS event fires on that date." },
            { color: "bg-rose-400",    label: "MAL advisory curve", desc: "Payout if a malware advisory fires on that date." },
            { color: "bg-red-400",     label: "Sell value line (dashed)", desc: "What you'd get selling the contract that day. decays to zero at expiry." },
          ].map((row) => (
            <div key={row.label} className="flex items-start gap-3">
              <span className={`w-2.5 h-2.5 rounded-sm ${row.color} flex-shrink-0 mt-1`} />
              <div>
                <span className="text-xs font-semibold text-zinc-300">{row.label} </span>
                <span className="text-xs text-zinc-500">{row.desc}</span>
              </div>
            </div>
          ))}
          <p className="text-xs text-zinc-500 pt-1 lg:col-span-2">
            Hover over the chart to see exact values for any date. The <span className="text-red-400">MAX LOSS</span> dashed line shows your downside if you hold to expiry with no event.
          </p>
        </div>
      </section>

      {/* Glossary */}
      <section className="space-y-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Glossary</h2>
        {/* mobile: single-col divide list; desktop: 2-col grid of cards */}
        <div className="rounded-xl border border-zinc-800 bg-[#181D21] divide-y divide-zinc-800/60 lg:divide-y-0 lg:grid lg:grid-cols-2 lg:gap-px lg:overflow-hidden">
          {GLOSSARY.map(({ term, def }) => (
            <div key={term} className="flex gap-4 px-5 py-3 lg:bg-[#181D21] lg:border-b lg:border-zinc-800/60">
              <span className="text-xs font-semibold text-zinc-200 w-44 flex-shrink-0">{term}</span>
              <span className="text-xs text-zinc-400">{def}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <div className="rounded-lg bg-zinc-900/60 border border-zinc-700/40 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-[#FDE832] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-zinc-400">
          Schmeckles are play money. there is no real financial value. Predictions are for educational and entertainment purposes only.
        </p>
      </div>

      {/* CTA */}
      <div className="rounded-xl border border-[#FDE832]/20 bg-[#FDE832]/5 px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Ready to make your first prediction?</p>
          <p className="text-xs text-zinc-500 mt-0.5">You start with 1,000 schmeckles. no deposit needed.</p>
        </div>
        <button
          onClick={() => { history.pushState({}, "", "/predict"); window.dispatchEvent(new PopStateEvent("popstate")) }}
          className="flex-shrink-0 flex items-center gap-2 rounded-lg bg-[#FDE832] px-4 py-2 text-xs font-bold text-zinc-900 hover:opacity-90 transition-opacity"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Go to Predict
        </button>
      </div>

    </div>
  )
}
