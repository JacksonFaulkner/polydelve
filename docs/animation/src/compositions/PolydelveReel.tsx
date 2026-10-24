import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

// White canvas, ink text, yellow used as a highlight behind accent words (yellow text disappears on white).
const WHITE = "#FFFFFF";
const INK = "#15191D";
const YELLOW = "#FDE832";
const MUTED = "#52525b";
const RULE = "#e4e4e7";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Crop = { top: number; bottom: number; left: number; right: number };

// Spring-in for text blocks; damping 200 means no overshoot.
function useRise(delay: number, dist: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 200 } });
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
}

function Accent({ children }: { children: string }) {
  return (
    <span
      style={{
        background: YELLOW,
        padding: "0 0.14em",
        borderRadius: 14,
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
      }}
    >
      {children}
    </span>
  );
}

// Source clips are 3024×1710 screen recordings. Crop the chrome, then fill the card.
function CroppedVideo({ file, startSec, crop, width, height }: { file: string; startSec: number; crop: Crop; width: number; height: number }) {
  const overW = width / (1 - crop.left - crop.right);
  const overH = height / (1 - crop.top - crop.bottom);
  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        borderRadius: 28,
        border: `2px solid ${RULE}`,
        boxShadow: "0 48px 120px rgba(21,25,29,0.18)",
      }}
    >
      <div style={{ position: "absolute", top: -crop.top * overH, left: -crop.left * overW, width: overW, height: overH }}>
        <Video src={staticFile(file)} trimBefore={Math.round(startSec * 30)} muted style={{ width: overW, height: overH }} objectFit="fill" />
      </div>
    </div>
  );
}

// ─── Scenes ───────────────────────────────────────────────────────────────────

function TitleScene() {
  const logo = useRise(0, 20);
  const head = useRise(10, 40);
  const sub = useRise(22, 30);
  const pills = useRise(34, 20);
  const button = useRise(46, 20);

  return (
    <AbsoluteFill style={{ backgroundColor: WHITE, fontFamily, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 40, ...logo }}>
        <Img src={staticFile("logo.png")} style={{ height: 84, objectFit: "contain" }} />
        <span style={{ fontSize: 80, fontWeight: 800, letterSpacing: "-3px", color: INK }}>Polydelve</span>
      </div>

      <h1 style={{ fontSize: 116, fontWeight: 800, lineHeight: 1.14, letterSpacing: "-4px", color: INK, textAlign: "center", maxWidth: 1700, margin: 0, ...head }}>
        Predict software security events. <Accent>Earn schmeckles.</Accent>
      </h1>

      <p style={{ fontSize: 36, color: MUTED, lineHeight: 1.45, textAlign: "center", maxWidth: 1400, margin: "32px 0 40px", ...sub }}>
        Trade prediction contracts on CVEs and EPSS scores for the top 500 open source packages. Track exploits. Spot risk before it hits.
      </p>

      <div style={{ display: "flex", gap: 16, marginBottom: 40, ...pills }}>
        {["New CVE contracts", "EPSS threshold bets"].map((label) => (
          <span key={label} style={{ borderRadius: 9999, border: `2px solid ${RULE}`, padding: "12px 28px", fontSize: 30, color: MUTED }}>
            {label}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, ...button }}>
        <div style={{ borderRadius: 9999, background: INK, padding: "22px 64px", fontSize: 36, fontWeight: 700, color: WHITE }}>Sign in to play</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Img src={staticFile("bit.png")} style={{ height: 30, width: 30, objectFit: "contain" }} />
          <span style={{ fontSize: 28, color: MUTED }}>1,000 schmeckles on signup</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

type FeatureProps = {
  eyebrow: string;
  headline: string;
  accent: string;
  sub: string;
  file: string;
  startSec: number;
  crop: Crop;
  textRight?: boolean;
};

function FeatureScene({ eyebrow, headline, accent, sub, file, startSec, crop, textRight = false }: FeatureProps) {
  const text = useRise(12, 36);
  const card = useRise(4, 0);
  const cardX = interpolate(card.opacity, [0, 1], [textRight ? -60 : 60, 0]);

  const textBlock = (
    <div style={{ width: 680, flex: "0 0 680px", display: "flex", flexDirection: "column", justifyContent: "center", ...text }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
        <div style={{ width: 52, height: 4, background: YELLOW, borderRadius: 2 }} />
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "4px", color: INK, textTransform: "uppercase" }}>{eyebrow}</span>
      </div>
      <h2 style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.14, letterSpacing: "-3px", color: INK, margin: "0 0 32px" }}>
        {headline}
        <br />
        <Accent>{accent}</Accent>
      </h2>
      <p style={{ fontSize: 36, color: MUTED, lineHeight: 1.45, margin: 0 }}>{sub}</p>
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: WHITE, fontFamily, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 56, padding: "0 80px" }}>
      {textRight ? null : textBlock}
      <div style={{ transform: `translateX(${cardX}px)`, opacity: card.opacity }}>
        <CroppedVideo file={file} startSec={startSec} crop={crop} width={1020} height={574} />
      </div>
      {textRight ? textBlock : null}
    </AbsoluteFill>
  );
}

function EndScene() {
  const logo = useRise(0, 20);
  const tag = useRise(14, 24);
  const button = useRise(28, 20);

  return (
    <AbsoluteFill style={{ backgroundColor: WHITE, fontFamily, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 40, ...logo }}>
        <Img src={staticFile("logo.png")} style={{ height: 124, objectFit: "contain" }} />
        <span style={{ fontSize: 104, fontWeight: 800, letterSpacing: "-3px", color: INK }}>Polydelve</span>
      </div>
      <p style={{ fontSize: 68, color: MUTED, margin: "0 0 56px", ...tag }}>
        Predict. Trade. <Accent>Win schmeckles.</Accent>
      </p>
      <div style={{ borderRadius: 9999, background: INK, padding: "30px 80px", fontSize: 44, fontWeight: 700, color: WHITE, ...button }}>
        Sign in to play
      </div>
    </AbsoluteFill>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

// Scene durations sum to 600; four 15-frame fades overlap, so 600 - 60 = 540.
export const POLYDELVE_REEL_FRAMES = 540;

export function PolydelveReel() {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Title" durationInFrames={120} premountFor={30}>
        <TitleScene />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Package intelligence" durationInFrames={120} premountFor={30}>
        <FeatureScene
          eyebrow="Package intelligence"
          headline="500 OSS packages."
          accent="Every CVE tracked."
          sub="We monitor the top 500 open source packages continuously, scoring exploitability with EPSS data updated daily."
          file="walkthrough.mov"
          startSec={5.4}
          crop={{ top: 0, bottom: 0.1, left: 0, right: 0 }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Exploit intelligence" durationInFrames={120} premountFor={30}>
        <FeatureScene
          eyebrow="Exploit intelligence"
          headline="EPSS scores."
          accent="Plotted live."
          sub="Every tracked package gets a daily exploit-probability score. Watch the curve climb as new CVEs land and risk shifts."
          file="security_feed.mov"
          startSec={9.0}
          crop={{ top: 0.08, bottom: 0.04, left: 0.02, right: 0.02 }}
          textRight
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="Build a position" durationInFrames={150} premountFor={30}>
        <FeatureScene
          eyebrow="Build a position"
          headline="Pick a package."
          accent="Set the terms."
          sub="Define your EPSS threshold, pick a timeframe, set your stake, then watch the live payoff curve. Contracts settle on real exploit data."
          file="walkthrough.mov"
          startSec={11.0}
          crop={{ top: 0.1, bottom: 0.05, left: 0.05, right: 0.05 }}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
      <TransitionSeries.Sequence name="End card" durationInFrames={90} premountFor={30}>
        <EndScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
}
