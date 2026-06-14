import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
  Sequence,
  OffthreadVideo,
} from "remotion";

const BG = "#15191D";
const YELLOW = "#FDE832";
const WHITE = "#FFFFFF";
const ZINC_400 = "#a1a1aa";
const ZINC_600 = "#52525b";
const ZINC_700 = "#3f3f46";
const ZINC_800 = "#27272a";

// Source video is 60fps — convert seconds to source frames
const SRC_FPS = 60;
const sf = (sec: number) => Math.round(sec * SRC_FPS);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useFade(startF: number, endF: number) {
  const frame = useCurrentFrame();
  return interpolate(frame, [startF, endF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

function useSlideUp(startF: number, endF: number, dist = 28) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [startF, endF], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return dist * (1 - p);
}

function useSpring(delayF: number, damping = 14, stiffness = 110) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: Math.max(0, frame - delayF), fps, config: { damping, stiffness } });
}

// ─── Floating video card ──────────────────────────────────────────────────────

interface VideoCardProps {
  srcStartSec: number;
  /** source file in public/ */
  srcFile?: string;
  /** crop: top-left-bottom-right as 0-1 fractions of the source video */
  crop?: { top?: number; left?: number; right?: number; bottom?: number };
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  entryFrame?: number;
  entryFrom?: "right" | "left" | "bottom";
}

function VideoCard({
  srcStartSec,
  srcFile = "walkthrough.mov",
  crop = {},
  width = 480,
  height = 300,
  style = {},
  entryFrame = 0,
  entryFrom = "right",
}: VideoCardProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame: Math.max(0, frame - entryFrame), fps, config: { damping: 18, stiffness: 100 } });
  const opacity = interpolate(frame, [entryFrame, entryFrame + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const slideDir = entryFrom === "right" ? 1 : entryFrom === "left" ? -1 : 0;
  const slideY = entryFrom === "bottom" ? 1 : 0;
  const tx = interpolate(frame, [entryFrame, entryFrame + 18], [40 * slideDir, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ty = interpolate(frame, [entryFrame, entryFrame + 18], [40 * slideY, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const { top = 0, left = 0, right = 0, bottom = 0 } = crop;
  // We render oversized and clip via overflow:hidden + negative margins
  const overW = width / (1 - left - right);
  const overH = height / (1 - top - bottom);

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 14,
        overflow: "hidden",
        border: `1.5px solid ${ZINC_700}`,
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
        opacity,
        transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
        position: "relative",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: `-${top * overH}px`,
          left: `-${left * overW}px`,
          width: overW,
          height: overH,
        }}
      >
        <OffthreadVideo
          src={staticFile(srcFile)}
          startFrom={sf(srcStartSec)}
          style={{ width: overW, height: overH, objectFit: "fill" }}
        />
      </div>
    </div>
  );
}

// ─── Scene: Title card ────────────────────────────────────────────────────────

function TitleCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const logoOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });

  const h1Opacity = interpolate(frame, [12, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const h1Y = interpolate(frame, [12, 28], [24, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const descOpacity = interpolate(frame, [24, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const descY = interpolate(frame, [24, 40], [16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const pill1O = interpolate(frame, [36, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pill2O = interpolate(frame, [42, 54], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const btnScale = spring({ frame: Math.max(0, frame - 52), fps, config: { damping: 12, stiffness: 100 } });
  const btnO = interpolate(frame, [52, 62], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const schmO = interpolate(frame, [64, 76], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter, Helvetica Neue, Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 36, opacity: logoOpacity, transform: `scale(${logoScale})` }}>
        <Img src={staticFile("logo.png")} style={{ height: 60, objectFit: "contain", filter: "invert(1)" }} />
        <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-1px", color: WHITE }}>Polydelve</span>
      </div>

      <div style={{ maxWidth: 560, textAlign: "center", marginBottom: 18, opacity: h1Opacity, transform: `translateY(${h1Y}px)` }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: WHITE, margin: 0, lineHeight: 1.3 }}>
          Predict software security events.{" "}
          <span style={{ color: YELLOW }}>Earn schmeckles.</span>
        </h1>
      </div>

      <div style={{ maxWidth: 460, textAlign: "center", marginBottom: 28, opacity: descOpacity, transform: `translateY(${descY}px)` }}>
        <p style={{ fontSize: 15, color: ZINC_400, lineHeight: 1.65, margin: 0 }}>
          Trade prediction contracts on CVEs and EPSS scores for the top 500 open source packages. Track exploits. Spot risk before it hits.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
        {[{ l: "New CVE contracts", o: pill1O }, { l: "EPSS threshold bets", o: pill2O }].map(({ l, o }) => (
          <span key={l} style={{ borderRadius: 9999, border: `1px solid ${ZINC_700}`, background: ZINC_800 + "99", padding: "5px 14px", fontSize: 12, color: ZINC_400, opacity: o }}>
            {l}
          </span>
        ))}
      </div>

      <div style={{ opacity: btnO, transform: `scale(${btnScale})`, marginBottom: 28 }}>
        <div style={{ borderRadius: 9999, background: YELLOW, padding: "13px 38px", fontSize: 14, fontWeight: 700, color: "#18181b" }}>
          Sign in to play
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: schmO }}>
        <Img src={staticFile("schmeckle.png")} style={{ height: 16, width: 16, objectFit: "contain" }} />
        <span style={{ fontSize: 12, color: ZINC_600 }}>1,000 schmeckles on signup</span>
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene: stat + video card layout ─────────────────────────────────────────

interface StatSceneProps {
  eyebrow: string;
  headline: string;
  headlineAccent?: string;   // portion of headline in yellow (appended)
  sub: string;
  videoSrcSec: number;
  videoSrcFile?: string;
  videoCrop?: VideoCardProps["crop"];
  videoEntryFrom?: VideoCardProps["entryFrom"];
  textSide?: "left" | "right";
}

function StatScene({ eyebrow, headline, headlineAccent, sub, videoSrcSec, videoSrcFile, videoCrop, videoEntryFrom = "right", textSide = "left" }: StatSceneProps) {
  const frame = useCurrentFrame();

  const eyeO = interpolate(frame, [6, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const eyeX = interpolate(frame, [6, 18], [-16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const h1O = interpolate(frame, [14, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const h1Y = interpolate(frame, [14, 30], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const subO = interpolate(frame, [24, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subY = interpolate(frame, [24, 40], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const lineScale = interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const textCol: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 0,
    flex: "0 0 420px",
    order: textSide === "left" ? 0 : 1,
  };

  const cardCol: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    order: textSide === "left" ? 1 : 0,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: BG, display: "flex", flexDirection: "row", alignItems: "center", padding: "0 80px", gap: 60, fontFamily: "Inter, Helvetica Neue, Arial, sans-serif" }}>
      {/* Text column */}
      <div style={textCol}>
        {/* Eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, opacity: eyeO, transform: `translateX(${eyeX}px)` }}>
          <div style={{ width: 28, height: 2, background: YELLOW, borderRadius: 1, transformOrigin: "left", transform: `scaleX(${lineScale})` }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "2px", color: YELLOW, textTransform: "uppercase" }}>{eyebrow}</span>
        </div>

        {/* Headline */}
        <div style={{ opacity: h1O, transform: `translateY(${h1Y}px)`, marginBottom: 18 }}>
          <h2 style={{ fontSize: 42, fontWeight: 800, color: WHITE, margin: 0, lineHeight: 1.15, letterSpacing: "-1px" }}>
            {headline}
            {headlineAccent && <><br /><span style={{ color: YELLOW }}>{headlineAccent}</span></>}
          </h2>
        </div>

        {/* Sub */}
        <p style={{ fontSize: 15, color: ZINC_400, lineHeight: 1.6, margin: 0, opacity: subO, transform: `translateY(${subY}px)` }}>
          {sub}
        </p>
      </div>

      {/* Video card column */}
      <div style={cardCol}>
        <VideoCard
          srcStartSec={videoSrcSec}
          srcFile={videoSrcFile}
          crop={videoCrop}
          width={520}
          height={320}
          entryFrame={18}
          entryFrom={videoEntryFrom}
        />
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene: end card ─────────────────────────────────────────────────────────

function EndCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 100 } });
  const logoO = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const tagO = interpolate(frame, [14, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tagY = interpolate(frame, [14, 28], [16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const btnScale = spring({ frame: Math.max(0, frame - 28), fps, config: { damping: 12, stiffness: 100 } });
  const btnO = interpolate(frame, [28, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter, Helvetica Neue, Arial, sans-serif" }}>
      {/* Subtle grid bg */}
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(${ZINC_800} 1px, transparent 1px)`, backgroundSize: "32px 32px", opacity: 0.4 }} />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, opacity: logoO, transform: `scale(${logoScale})` }}>
          <Img src={staticFile("logo.png")} style={{ height: 56, objectFit: "contain", filter: "invert(1)" }} />
          <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-1px", color: WHITE }}>Polydelve</span>
        </div>

        <p style={{ fontSize: 18, color: ZINC_400, marginBottom: 36, opacity: tagO, transform: `translateY(${tagY}px)`, textAlign: "center" }}>
          Predict. Trade. <span style={{ color: YELLOW }}>Win schmeckles.</span>
        </p>

        <div style={{ opacity: btnO, transform: `scale(${btnScale})` }}>
          <div style={{ borderRadius: 9999, background: YELLOW, padding: "14px 44px", fontSize: 15, fontWeight: 700, color: "#18181b" }}>
            Sign in to play
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Transition: subliminal white flash (4 frames, peaks at 22% opacity) ─────

function LineWipe() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 2, 4], [0, 0.22, 0], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ backgroundColor: WHITE, opacity, pointerEvents: "none" }} />;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const TITLE_DUR = 90;
const FADE_DUR  = 6;

interface SceneDef {
  eyebrow: string;
  headline: string;
  accent?: string;
  sub: string;
  srcSec: number;
  /** source file in public/ (defaults to walkthrough.mov) */
  srcFile?: string;
  /** how long this scene holds, in composition frames (30fps). Plays src for dur/30 seconds. */
  durFrames: number;
  crop?: VideoCardProps["crop"];
  from?: VideoCardProps["entryFrom"];
  textSide?: "left" | "right";
}

const SCENES: SceneDef[] = [
  {
    eyebrow: "Package intelligence",
    headline: "500 OSS packages.",
    accent: "Every CVE tracked.",
    sub: "We monitor the top 500 open source packages continuously — scoring exploitability with EPSS data updated daily.",
    // list + package EPSS green curve window: 5.30–8.70s (3.4s of motion)
    srcSec: 5.4,
    durFrames: 96, // 3.2s @30fps → plays src 5.4–8.6s
    crop: { top: 0.0, bottom: 0.1, left: 0.0, right: 0.0 },
    from: "right",
    textSide: "left",
  },
  {
    eyebrow: "Exploit intelligence",
    headline: "EPSS scores.",
    accent: "Plotted live.",
    sub: "Every tracked package gets a daily exploit-probability score. Watch the curve climb as new CVEs land and risk shifts.",
    // security_feed.mov: EPSS curve + scatter draws in 8.9s, clean hold to 12.2s
    srcSec: 9.0,
    srcFile: "security_feed.mov",
    durFrames: 90, // 3.0s @30fps → plays src 9.0–12.0s
    crop: { top: 0.08, bottom: 0.04, left: 0.02, right: 0.02 },
    from: "left",
    textSide: "right",
  },
  {
    eyebrow: "Build a position",
    headline: "Pick a package.",
    accent: "Set the terms.",
    sub: "Define your EPSS threshold, pick a timeframe, set your stake — then watch the live payoff curve. Contracts settle on real exploit data.",
    // builder + EPSS decay curves + Buy button window: 10.80–16.40s (hero shot)
    srcSec: 11.0,
    durFrames: 150, // 5.0s @30fps → plays src 11.0–16.0s
    crop: { top: 0.1, bottom: 0.05, left: 0.05, right: 0.05 },
    from: "right",
    textSide: "left",
  },
];

const END_DUR = 90;

// Cumulative start frame of scene i (scenes have individual durations).
function sceneStart(i: number) {
  let f = TITLE_DUR;
  for (let k = 0; k < i; k++) f += SCENES[k].durFrames + FADE_DUR;
  return f;
}

export const TOTAL_FRAMES =
  sceneStart(SCENES.length) + END_DUR;

export function PolydelveIntro() {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Title */}
      <Sequence from={0} durationInFrames={TITLE_DUR + FADE_DUR}>
        <TitleCard />
      </Sequence>
      <Sequence from={TITLE_DUR} durationInFrames={FADE_DUR}>
        <LineWipe />
      </Sequence>

      {/* Scenes */}
      {SCENES.map((s, i) => {
        const start = sceneStart(i);
        return (
          <>
            <Sequence key={`scene-${i}`} from={start} durationInFrames={s.durFrames + FADE_DUR}>
              <StatScene
                eyebrow={s.eyebrow}
                headline={s.headline}
                headlineAccent={s.accent}
                sub={s.sub}
                videoSrcSec={s.srcSec}
                videoSrcFile={s.srcFile}
                videoCrop={s.crop}
                videoEntryFrom={s.from}
                textSide={s.textSide}
              />
            </Sequence>
            <Sequence key={`wipe-${i}`} from={start + s.durFrames} durationInFrames={FADE_DUR}>
              <LineWipe />
            </Sequence>
          </>
        );
      })}

      {/* End card */}
      <Sequence from={sceneStart(SCENES.length)} durationInFrames={END_DUR}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
}
