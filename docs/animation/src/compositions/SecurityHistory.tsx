import {
  AbsoluteFill,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
  OffthreadVideo,
} from "remotion";
import {
  TransitionSeries,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { Rect } from "@remotion/shapes";
import { loadFont } from "@remotion/google-fonts/Inter";

// ─── Font ─────────────────────────────────────────────────────────────────────

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

// ─── Palette ──────────────────────────────────────────────────────────────────

const BG      = "#15191D";
const YELLOW  = "#FDE832";
const WHITE   = "#FFFFFF";
const INDIGO  = "#6366f1";
const ZINC_400 = "#a1a1aa";
const ZINC_700 = "#3f3f46";
const ZINC_800 = "#27272a";

// ─── Timing ───────────────────────────────────────────────────────────────────

// TransitionSeries manages scene timing automatically.
// Root: intro(60) + fade(12) + video(169) + fade(12) + outro(54) - 24 = 271
export const SECURITY_HISTORY_FRAMES = 271;

const INTRO_DUR  = 60;
const VIDEO_DUR  = 169; // 5.64s @ 30fps
const OUTRO_DUR  = 54;
const SCENE_FADE = 12;  // root cross-fade frames

// Title phases inside VideoScene: 2×90 - 1×11 = 169 = VIDEO_DUR
const PHASE_DUR  = 90;
const TITLE_WIPE = 11;

const SRC_FPS = 60;
const sf = (sec: number) => Math.round(sec * SRC_FPS);

const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ─── Scene: Intro ─────────────────────────────────────────────────────────────

function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const logoO     = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });

  const eyeO      = interpolate(frame, [10, 22], [0, 1], C);
  const eyeX      = interpolate(frame, [10, 22], [-16, 0], C);
  const lineScale = interpolate(frame, [10, 28], [0, 1], C);

  const h1O = interpolate(frame, [20, 36], [0, 1], C);
  const h1Y = interpolate(frame, [20, 36], [24, 0], C);

  const descO = interpolate(frame, [32, 48], [0, 1], C);
  const descY = interpolate(frame, [32, 48], [16, 0], C);

  const pill1O = interpolate(frame, [42, 54], [0, 1], C);
  const pill2O = interpolate(frame, [48, 60], [0, 1], C);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32, opacity: logoO, transform: `scale(${logoScale})` }}>
        <Img src={staticFile("logo.png")} style={{ height: 52, objectFit: "contain", filter: "invert(1)" }} />
        <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-1px", color: WHITE }}>Polydelve</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, opacity: eyeO, transform: `translateX(${eyeX}px)` }}>
        <div style={{ width: 28, height: 2, background: YELLOW, borderRadius: 1, transformOrigin: "left", transform: `scaleX(${lineScale})` }} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "2px", color: YELLOW, textTransform: "uppercase" }}>
          Prediction Markets
        </span>
      </div>

      <div style={{ maxWidth: 600, textAlign: "center", marginBottom: 18, opacity: h1O, transform: `translateY(${h1Y}px)` }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, color: WHITE, margin: 0, lineHeight: 1.28 }}>
          Prediction markets meet{" "}
          <span style={{ color: YELLOW }}>software security events.</span>
        </h1>
      </div>

      <div style={{ maxWidth: 480, textAlign: "center", marginBottom: 28, opacity: descO, transform: `translateY(${descY}px)` }}>
        <p style={{ fontSize: 15, color: ZINC_400, lineHeight: 1.65, margin: 0 }}>
          Find packages, create your own contracts, and earn schmeckles when your predictions land.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {[
          { l: "500 packages tracked", o: pill1O },
          { l: "Build your own contracts", o: pill2O },
        ].map(({ l, o }) => (
          <span key={l} style={{ borderRadius: 9999, border: `1px solid ${ZINC_700}`, background: ZINC_800 + "99", padding: "5px 14px", fontSize: 12, color: ZINC_400, opacity: o }}>
            {l}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

// ─── Title phase — drop-in animations match StatScene exactly ─────────────────

interface TitlePhaseProps {
  eyebrow: string;
  headline: string;
  accent: string;
  sub: string;
}

function TitlePhase({ eyebrow, headline, accent, sub }: TitlePhaseProps) {
  const frame = useCurrentFrame();

  // StatScene exact drop-in timings
  const eyeO      = interpolate(frame, [6, 18],  [0, 1],   C);
  const eyeX      = interpolate(frame, [6, 18],  [-16, 0], C);
  const lineScale = interpolate(frame, [10, 30], [0, 1],   C);
  const h1O       = interpolate(frame, [14, 30], [0, 1],   C);
  const h1Y       = interpolate(frame, [14, 30], [20, 0],  C);
  const subO      = interpolate(frame, [24, 40], [0, 1],   C);
  const subY      = interpolate(frame, [24, 40], [14, 0],  C);

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        fontFamily,
        backgroundColor: BG,
        paddingLeft: 72,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, opacity: eyeO, transform: `translateX(${eyeX}px)` }}>
        <div style={{ width: 28, height: 2, background: YELLOW, borderRadius: 1, transformOrigin: "left", transform: `scaleX(${lineScale})` }} />
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "2px", color: YELLOW, textTransform: "uppercase" }}>
          {eyebrow}
        </span>
      </div>

      <div style={{ maxWidth: 560, textAlign: "left", marginBottom: 14, opacity: h1O, transform: `translateY(${h1Y}px)` }}>
        <h2 style={{ fontSize: 30, fontWeight: 800, color: WHITE, margin: 0, lineHeight: 1.2, letterSpacing: "-0.5px" }}>
          {headline} <span style={{ color: YELLOW }}>{accent}</span>
        </h2>
      </div>

      <div style={{ maxWidth: 500, textAlign: "left", opacity: subO, transform: `translateY(${subY}px)` }}>
        <p style={{ fontSize: 14, color: ZINC_400, lineHeight: 1.6, margin: 0 }}>{sub}</p>
      </div>
    </AbsoluteFill>
  );
}

// ─── Component: Animated border draw-on ──────────────────────────────────────

// Derive video size from available height: 720 - paddingTop(24) - title(180) - gap(16) - paddingBottom(20) = 480px
const VID_H = 476;
const VID_W = Math.round(VID_H * 16 / 9); // = 847
const PERIMETER = 2 * (VID_W + VID_H);

function VideoBorderDrawOn() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({ frame, fps, config: { damping: 18, stiffness: 60 } });
  const opacity  = interpolate(frame, [0, 6], [0, 1], C);

  // Pulse after draw-on completes
  const glowPulse = 0.45 + 0.55 * Math.sin((frame / fps) * Math.PI * 0.5);
  const glowAlpha = Math.round(Math.min(progress, 1) * glowPulse * 38)
    .toString(16)
    .padStart(2, "0");

  const dasharray = `${PERIMETER * progress} ${PERIMETER}`;
  const dashoffset = 0;

  return (
    <svg
      width={VID_W + 4}
      height={VID_H + 4}
      style={{
        position: "absolute",
        top: -2,
        left: -2,
        overflow: "visible",
        opacity,
        pointerEvents: "none",
      }}
    >
      <Rect
        width={VID_W}
        height={VID_H}
        cornerRadius={10}
        fill="none"
        stroke={`${INDIGO}${glowAlpha}`}
        strokeWidth={1.5}
        strokeDasharray={dasharray}
        strokeDashoffset={String(dashoffset)}
        style={{
          filter: `drop-shadow(0 0 8px ${INDIGO}88)`,
          transform: "translate(2px, 2px)",
        }}
      />
    </svg>
  );
}

// ─── Component: Progress bar ──────────────────────────────────────────────────

function VideoProgress() {
  const frame = useCurrentFrame();
  const progress = Math.min(frame / VIDEO_DUR, 1);
  const opacity  = interpolate(frame, [0, 12, VIDEO_DUR - 12, VIDEO_DUR], [0, 0.6, 0.6, 0], C);

  const barColor = interpolateColors(progress, [0, 1], [INDIGO, YELLOW]);

  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: ZINC_800, opacity }}>
      <div style={{ height: "100%", width: `${progress * 100}%`, background: barColor, borderRadius: 1 }} />
    </div>
  );
}

// ─── Component: Corner watermark ──────────────────────────────────────────────

function Watermark() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20, VIDEO_DUR - 20, VIDEO_DUR], [0, 0.5, 0.5, 0], C);

  return (
    <div style={{ position: "absolute", top: 20, right: 24, display: "flex", alignItems: "center", gap: 7, opacity }}>
      <Img src={staticFile("logo.png")} style={{ height: 15, objectFit: "contain", filter: "invert(1)" }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: WHITE, letterSpacing: "0.02em", fontFamily }}>Polydelve</span>
    </div>
  );
}

// ─── Scene: Video ─────────────────────────────────────────────────────────────

function VideoScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardSpring  = spring({ frame, fps, config: { damping: 22, stiffness: 80 } });
  const cardScale   = interpolate(cardSpring, [0, 1], [0.95, 1], C);
  const sceneO      = interpolate(frame, [0, 10], [0, 1], C);

  // Single dramatic push-in over the full video: 1.0 → 1.10
  // Slow push-in — zoom origin biased toward bottom third of card
  const sectionZoom = interpolate(frame, [0, VIDEO_DUR], [1.0, 1.13], C);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        opacity: sceneO,
        fontFamily,
        paddingTop: 24,
        paddingBottom: 20,
        paddingLeft: 72,
        paddingRight: 40,
        gap: 16,
      }}
    >
      {/* ── Title phases via TransitionSeries + wipe ── */}
      <div style={{ position: "relative", width: "100%", height: 180, flexShrink: 0, overflow: "hidden" }}>
        <TransitionSeries>
          <TransitionSeries.Sequence durationInFrames={PHASE_DUR}>
            <TitlePhase
              eyebrow="Find the package"
              headline="Search 500 OSS packages."
              accent="See the risk score instantly."
              sub="Every package gets a daily EPSS exploit-probability score. Spot which ones are heating up before a CVE drops."
            />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition
            timing={springTiming({ config: { damping: 200 }, durationInFrames: TITLE_WIPE, durationRestThreshold: 0.001 })}
            presentation={wipe({ direction: "from-bottom" })}
          />

          <TransitionSeries.Sequence durationInFrames={PHASE_DUR}>
            <TitlePhase
              eyebrow="Build a contract"
              headline="Set your terms."
              accent="Earn schmeckles."
              sub="Pick a package, set an EPSS threshold, lock in your stake — and get paid when the exploit probability crosses the line."
            />
          </TransitionSeries.Sequence>
        </TransitionSeries>
      </div>

      {/* ── Video card: 3D cinematic tilt + DoF blur layer ── */}
      {/* perspective on wrapper = telephoto (1400px ≈ 85mm feel) */}
      {/* perspective: 700px = wider/closer lens, matches the Reddit example feel */}
      <div
        style={{
          position: "relative",
          flexShrink: 0,
          perspective: "700px",
          perspectiveOrigin: "52% 68%",
        }}
      >
        {/* ── DoF blur layer: heavy bottom blur, fades into sharp card ── */}
        <div
          style={{
            position: "absolute",
            width: VID_W,
            height: VID_H,
            borderRadius: 12,
            overflow: "hidden",
            transform: `scale(${cardScale * sectionZoom}) rotateX(18deg) rotateY(-4deg) rotateZ(-14deg)`,
            filter: "blur(18px)",
            opacity: 0.7,
            zIndex: 0,
          }}
        >
          <OffthreadVideo
            src={staticFile("nextjs.mov")}
            startFrom={sf(0)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        {/* ── Sharp card ── */}
        <div
          style={{
            position: "relative",
            width: VID_W,
            height: VID_H,
            borderRadius: 12,
            overflow: "hidden",
            transform: `scale(${cardScale * sectionZoom}) rotateX(18deg) rotateY(-4deg) rotateZ(-14deg)`,
            boxShadow: "0 60px 140px rgba(0,0,0,0.98), 0 12px 40px rgba(0,0,0,0.7)",
            zIndex: 1,
          }}
        >
          <OffthreadVideo
            src={staticFile("nextjs.mov")}
            startFrom={sf(0)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />

          {/* DoF mask — linear gradient: bottom 40% blurs into DoF layer, top-center stays sharp */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 42%, black 100%)",
              maskImage: "linear-gradient(to bottom, transparent 0%, black 42%, black 100%)",
              background: "transparent",
              pointerEvents: "none",
            }}
          />

          {/* Heavy vignette — especially dark on the corners like the reference */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(ellipse 70% 60% at 48% 65%, transparent 20%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.85) 100%)",
              pointerEvents: "none",
            }}
          />

          {/* Chromatic aberration — stronger on tilted edges */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              filter: "drop-shadow(3px 0 0 rgba(255,30,30,0.22)) drop-shadow(-3px 0 0 rgba(30,60,255,0.22))",
              borderRadius: 12,
              pointerEvents: "none",
            }}
          />

          <VideoProgress />
        </div>

        {/* Border draw-on — same transform */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `scale(${cardScale * sectionZoom}) rotateX(18deg) rotateY(-4deg) rotateZ(-14deg)`,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <VideoBorderDrawOn />
        </div>
      </div>

      <Watermark />
    </AbsoluteFill>
  );
}

// ─── Scene: Outro ─────────────────────────────────────────────────────────────

function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale    = spring({ frame, fps, config: { damping: 18, stiffness: 110 } });
  const opacity  = interpolate(frame, [0, 12], [0, 1], C);
  const tagO     = interpolate(frame, [14, 28], [0, 1], C);
  const tagY     = interpolate(frame, [14, 28], [10, 0], C);
  const urlO     = interpolate(frame, [26, 38], [0, 1], C);
  const lineScale = interpolate(frame, [12, 30], [0, 1], C);
  const glowPulse = 0.55 + 0.45 * Math.sin((frame / fps) * Math.PI * 1.8);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 600px 300px at center, ${YELLOW}14 0%, transparent 65%)`,
          opacity: glowPulse,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity,
          transform: `scale(${interpolate(scale, [0, 1], [0.92, 1], C)})`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <Img src={staticFile("logo.png")} style={{ height: 44, objectFit: "contain", filter: "invert(1)" }} />
          <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.5px", color: WHITE }}>Polydelve</span>
        </div>

        <div
          style={{
            width: 320,
            height: 1,
            background: `linear-gradient(to right, transparent, ${INDIGO}, transparent)`,
            transformOrigin: "center",
            transform: `scaleX(${lineScale})`,
            marginBottom: 18,
          }}
        />

        <div style={{ opacity: tagO, transform: `translateY(${tagY}px)`, marginBottom: 10, textAlign: "center" }}>
          <p style={{ fontSize: 18, color: ZINC_400, margin: 0 }}>
            Predict. Trade. <span style={{ color: YELLOW }}>Win schmeckles.</span>
          </p>
        </div>

        <div style={{ opacity: urlO }}>
          <span style={{ fontSize: 13, color: ZINC_400, letterSpacing: "0.04em" }}>polydelve.com</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function SecurityHistory() {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO_DUR}>
          <IntroScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 200 }, durationInFrames: SCENE_FADE, durationRestThreshold: 0.001 })}
          presentation={fade()}
        />

        <TransitionSeries.Sequence durationInFrames={VIDEO_DUR}>
          <VideoScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          timing={springTiming({ config: { damping: 200 }, durationInFrames: SCENE_FADE, durationRestThreshold: 0.001 })}
          presentation={fade()}
        />

        <TransitionSeries.Sequence durationInFrames={OUTRO_DUR}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}
