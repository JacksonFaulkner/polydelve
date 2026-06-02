import { useAuth0 } from "@auth0/auth0-react"
import { SchmeckleIcon } from "./SchmeckleIcon"

export function LandingPage() {
  const { loginWithRedirect } = useAuth0()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: "#15191D" }}>
      <div className="flex items-center gap-3 mb-8">
        <img src="/logo.png" alt="Polydelve" className="h-14 object-contain invert" />
        <span className="text-3xl font-bold tracking-tight text-white">Polydelve</span>
      </div>

      <div className="max-w-lg text-center space-y-4 mb-10">
        <h1 className="text-2xl font-bold text-white">
          Predict software security events.{" "}
          <span className="text-[#FDE832]">Earn schmeckles.</span>
        </h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Trade prediction contracts on CVEs, KEV listings, and EPSS scores for the top 500 open source packages.
          Track exploits. Spot risk before it hits.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-10">
        {[
          "New CVE contracts",
          "EPSS threshold bets",
          "KEV listing signals",
        ].map((f) => (
          <span
            key={f}
            className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400"
          >
            {f}
          </span>
        ))}
      </div>

      <button
        onClick={() => loginWithRedirect()}
        className="rounded-full bg-[#FDE832] px-8 py-3 text-sm font-bold text-zinc-900 hover:bg-yellow-300 transition-colors"
      >
        Sign in to play
      </button>

      <div className="mt-8 flex items-center gap-1.5 text-xs text-zinc-600">
        <SchmeckleIcon className="h-4 w-4" />
        <span>1,000 schmeckles on signup</span>
      </div>

    </div>
  )
}
