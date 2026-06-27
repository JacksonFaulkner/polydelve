import { AbsoluteFill, Img, staticFile } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "700", "800"],
  subsets: ["latin"],
});

const BG = "#15191D";
const PANEL = "#1B2025";
const YELLOW = "#FDE832";
const WHITE = "#FFFFFF";
const ZINC_400 = "#a1a1aa";
const ZINC_600 = "#52525b";
const ZINC_800 = "#27272a";

export interface BannerProps {
  /** Headline. Wrap a word in *asterisks* to paint it yellow. */
  headline: string;
  tagline: string;
  handle: string;
  /** Show the decorative rising-risk chart on the right. */
  showChart: boolean;
}

export const bannerDefaultProps: BannerProps = {
  headline: "Bet on the next *supply-chain* breach",
  tagline: "A prediction market for open-source security.",
  handle: "@polydelve",
  showChart: true,
};

// Split "a *word* b" into segments, marking the starred one for the accent color.
function renderHeadline(text: string) {
  return text.split(/(\*[^*]+\*)/g).filter(Boolean).map((part, i) => {
    const hit = part.startsWith("*") && part.endsWith("*");
    return (
      <span key={i} style={{ color: hit ? YELLOW : WHITE }}>
        {hit ? part.slice(1, -1) : part}
      </span>
    );
  });
}

// Decorative rising "risk" curve — evokes an EPSS spike going up and to the right.
function RiskChart() {
  const W = 560;
  const H = 320;
  const pts = [0.62, 0.58, 0.66, 0.5, 0.55, 0.42, 0.46, 0.33, 0.3, 0.18, 0.22, 0.08];
  const step = W / (pts.length - 1);
  const coords = pts.map((p, i) => [i * step, p * H] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const [lx, ly] = coords[coords.length - 1];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={YELLOW} stopOpacity={0.28} />
          <stop offset="100%" stopColor={YELLOW} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* gridlines */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} y1={g * H} x2={W} y2={g * H} stroke={ZINC_800} strokeWidth={1} />
      ))}
      <path d={area} fill="url(#fill)" />
      <path d={line} fill="none" stroke={YELLOW} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={9} fill={YELLOW} />
      <circle cx={lx} cy={ly} r={18} fill={YELLOW} fillOpacity={0.18} />
    </svg>
  );
}

export const TwitterBanner: React.FC<BannerProps> = ({ headline, tagline, handle, showChart }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily }}>
      {/* soft radial glow behind the chart */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(620px 420px at 22% 40%, ${PANEL} 0%, ${BG} 70%)`,
        }}
      />

      {/* content */}
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 96px" }}>
        {/* left: chart */}
        {showChart ? (
          <div style={{ flex: "0 0 560px", display: "flex", justifyContent: "flex-start" }}>
            <RiskChart />
          </div>
        ) : null}

        {/* right: copy */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22, alignItems: "flex-end", textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* same asset as the app navbar, inverted to white to match */}
            <Img src={staticFile("logo.png")} style={{ height: 48, width: 48, objectFit: "contain", filter: "invert(1)" }} />
            <span style={{ fontSize: 30, fontWeight: 800, color: WHITE, letterSpacing: -0.5 }}>
              poly<span style={{ color: YELLOW }}>delve</span>
            </span>
          </div>

          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5, maxWidth: 760 }}>
            {renderHeadline(headline)}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
