import { Tour, TourStep, TourOverlay, TourCard } from "@tour-kit/react"

const sel = (tag: string) => `[data-tour="${tag}"]`

export function SiteTour() {
  return (
    <>
      <Tour id="site-tour" config={{ persistence: { enabled: true, storage: "localStorage", dontShowAgain: true, trackCompleted: true } }}>
        <TourStep
          id="nav-pypi"
          target={sel("nav-pypi")}
          title="Browse tracked packages"
          content="Click PyPI to see every package we track — CVEs, EPSS scores, risk."
          placement="bottom"
          interactive
          showNavigation={false}
          advanceOn={{ event: "click", selector: sel("nav-pypi") }}
        />
        <TourStep
          id="expand-row"
          target={sel("pkg-row-0")}
          title="Dig into a package"
          content="Click a row to expand it and see its CVE history in detail."
          placement="bottom"
          interactive
          showNavigation={false}
          advanceOn={{ event: "click", selector: sel("pkg-row-0") }}
        />
        <TourStep
          id="expanded-explain"
          target={sel("pkg-expanded")}
          title="The full picture"
          content="CVSS severity, CVE timeline, EPSS trend — everything that feeds into pricing a contract on this package."
          placement="top"
        />
        <TourStep
          id="nav-predict"
          target={sel("nav-predict")}
          title="Now make a prediction"
          content="Click Predict to build a slip on this package."
          placement="bottom"
          interactive
          showNavigation={false}
          advanceOn={{ event: "click", selector: sel("nav-predict") }}
        />
        <TourStep
          id="add-leg"
          target={sel("predict-search")}
          title="Search & add"
          content="Search the package you just looked at and click it to add it to your slip."
          placement="bottom"
          interactive
          showNavigation={false}
          advanceOn={{ event: "click", selector: sel("predict-add-result") }}
        />
        <TourStep
          id="expand-leg"
          target={sel("leg-row")}
          title="Open it up"
          content="Click your leg to set the terms for this contract."
          placement="left"
          interactive
          showNavigation={false}
          advanceOn={{ event: "click", selector: sel("leg-row-toggle") }}
        />
        <TourStep
          id="cvss-threshold"
          target={sel("cvss-slider")}
          title="CVSS threshold"
          content="Drag this — you're betting a CVE at or above this severity gets disclosed before your contract expires."
          placement="top"
          interactive
          showNavigation={false}
          advanceOn={{ event: "input", selector: sel("cvss-slider") }}
        />
        <TourStep
          id="stake"
          target={sel("stake-chips")}
          title="Set your stake"
          content="Pick how many bits to put down. Bigger stake, bigger payout if you're right."
          placement="top"
          interactive
          showNavigation={false}
          advanceOn={{ event: "click", selector: sel("stake-chip") }}
        />
        <TourStep
          id="duration"
          target={sel("duration-options")}
          title="Pick a duration"
          content="How long the contract runs. Shorter windows are riskier, longer ones give the event more time to happen."
          placement="top"
          interactive
          showNavigation={false}
          advanceOn={{ event: "click", selector: sel("duration-chip") }}
        />
        <TourStep
          id="buy"
          target={sel("buy-slip-btn")}
          title="You're ready"
          content="This buys the slip. If the event happens before it expires, you get paid out. That's the whole game."
          placement="top"
        />
      </Tour>
      <TourOverlay />
      <TourCard className="site-tour" />
    </>
  )
}
