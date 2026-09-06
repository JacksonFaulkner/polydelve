import { useEffect, useMemo, useRef } from "react";

// Placeholder house ads. shown until an ad network is approved / configured, or if the network has no fill.
const HOUSE_ADS = [
  { label: "Sponsored", title: "Ship secure dependencies faster.", body: "See how teams track supply-chain risk in real time.", cta: "Learn more" },
  { label: "Sponsored", title: "Your CVE feed, one click away.", body: "Get alerted the moment a tracked package ships a fix.", cta: "Try it free" },
  { label: "Sponsored", title: "Audit your stack in minutes.", body: "Automated dependency scanning for npm and PyPI.", cta: "Get started" },
];

// AdSense: apply at https://www.google.com/adsense, set client (ca-pub-...) + slot id.
const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT as string | undefined;
const ADSENSE_ENABLED = !!(ADSENSE_CLIENT && ADSENSE_SLOT);

// Carbon Ads: apply at https://www.carbonads.net (curated, slower/harder approval).
const CARBON_SERVE = import.meta.env.VITE_CARBON_SERVE as string | undefined;
const CARBON_PLACEMENT = import.meta.env.VITE_CARBON_PLACEMENT as string | undefined;
const CARBON_ENABLED = !ADSENSE_ENABLED && !!(CARBON_SERVE && CARBON_PLACEMENT);

function HouseAd({ seed }: { seed: string }) {
  const ad = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return HOUSE_ADS[h % HOUSE_ADS.length];
  }, [seed]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#181D21] px-4 py-3 shadow-lg shadow-black/30 flex items-center gap-3">
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-zinc-600">{ad.label}</span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-zinc-200">{ad.title}</span>
        <span className="ml-2 text-xs text-zinc-500 hidden sm:inline">{ad.body}</span>
      </div>
      <button className="shrink-0 rounded border border-zinc-700 px-2.5 py-1 text-[10px] font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors">
        {ad.cta}
      </button>
    </div>
  );
}

function loadAdsenseScript(): Promise<void> {
  const existing = document.getElementById("_adsense_js") as HTMLScriptElement | null;
  if (existing) return Promise.resolve();
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.id = "_adsense_js";
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

function AdSenseAd({ seed }: { seed: string }) {
  const ref = useRef<HTMLModElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadAdsenseScript().then(() => {
      if (cancelled || !ref.current) return;
      try {
        ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ??= []).push({});
      } catch {
        // no-op — falls back to house ad visually if AdSense never fills
      }
    });
    return () => { cancelled = true };
  }, [seed]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#181D21] px-4 py-2 shadow-lg shadow-black/30 overflow-hidden flex items-center justify-center min-h-[52px]">
      <ins
        ref={ref}
        key={seed}
        className="adsbygoogle block w-full"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </div>
  );
}

function CarbonAd({ seed }: { seed: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";

    const script = document.createElement("script");
    script.id = "_carbonads_js";
    script.async = true;
    script.type = "text/javascript";
    script.src = `//cdn.carbonads.com/carbon.js?serve=${CARBON_SERVE}&placement=${CARBON_PLACEMENT}`;
    el.appendChild(script);
  }, [seed]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#181D21] px-4 py-2 shadow-lg shadow-black/30 [&_#carbonads]:flex [&_#carbonads]:items-center [&_#carbonads]:gap-3 [&_#carbonads]:font-sans [&_.carbon-img]:shrink-0 [&_.carbon-img_img]:rounded [&_.carbon-text]:text-xs [&_.carbon-text]:text-zinc-300 [&_.carbon-text]:leading-snug [&_.carbon-poweredby]:text-[9px] [&_.carbon-poweredby]:text-zinc-600 [&_.carbon-poweredby]:uppercase [&_.carbon-poweredby]:tracking-wide [&_.carbon-poweredby]:shrink-0 [&_a]:no-underline">
      <div ref={ref} />
    </div>
  );
}

interface Props {
  seed: string;
}

export function AdBanner({ seed }: Props) {
  if (ADSENSE_ENABLED) return <AdSenseAd seed={seed} />;
  if (CARBON_ENABLED) return <CarbonAd seed={seed} />;
  return <HouseAd seed={seed} />;
}
