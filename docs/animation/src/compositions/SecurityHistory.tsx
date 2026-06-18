import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
  OffthreadVideo,
  Html5Audio,
  Sequence,
} from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { wipe } from "@remotion/transitions/wipe";
import { loadFont } from "@remotion/google-fonts/Inter";

// ─── Font ─────────────────────────────────────────────────────────────────────

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

// ─── Palette ──────────────────────────────────────────────────────────────────

const BG = "#15191D";
const YELLOW = "#FDE832";
const WHITE = "#FFFFFF";
const ZINC_400 = "#a1a1aa";

// ─── Timing ───────────────────────────────────────────────────────────────────

const INTRO_DUR = 105;
const OUTRO_DUR = 114;
const SCENE_FADE = 12; // root cross-fade frames

// Phase 1 (find packages) shorter, phase 2 (gamble) longer
const PHASE1_DUR = 170;
const PHASE2_DUR = 276;
const TITLE_WIPE = 11;

// VIDEO_DUR = PHASE1_DUR + PHASE2_DUR - TITLE_WIPE (TransitionSeries overlaps by wipe frames)
const VIDEO_DUR = PHASE1_DUR + PHASE2_DUR - TITLE_WIPE; // 209

// TransitionSeries overlaps SCENE_FADE on each side
export const SECURITY_HISTORY_FRAMES =
  INTRO_DUR + VIDEO_DUR + OUTRO_DUR - 2 * SCENE_FADE; // 281

const C = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

// ─── Scene: Intro ─────────────────────────────────────────────────────────────

function IntroScene() {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const S = height / 720;

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const logoO = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  const h1O = interpolate(frame, [18, 32], [0, 1], C);
  const h1Y = interpolate(frame, [18, 32], [24, 0], C);

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16 * S,
          marginBottom: 32 * S,
          opacity: logoO,
          transform: `scale(${logoScale})`,
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{ height: 52 * S, objectFit: "contain", filter: "invert(1)" }}
        />
        <span
          style={{
            fontSize: 36 * S,
            fontWeight: 700,
            letterSpacing: "-1px",
            color: WHITE,
          }}
        >
          Polydelve
        </span>
      </div>

      <div
        style={{
          maxWidth: 600 * S,
          textAlign: "center",
          marginBottom: 18 * S,
          opacity: h1O,
          transform: `translateY(${h1Y}px)`,
        }}
      >
        <h1
          style={{
            fontSize: 34 * S,
            fontWeight: 700,
            color: WHITE,
            margin: 0,
            lineHeight: 1.28,
          }}
        >
          Prediction markets meet{" "}
          <span style={{ color: YELLOW }}>software security events.</span>
        </h1>
      </div>
    </AbsoluteFill>
  );
}

// ─── Title phase — drop-in animations match StatScene exactly ─────────────────

interface TitlePhaseProps {
  eyebrow: string;
  headline: string;
  accent: string;
  mirror?: boolean;
  exitRight?: boolean;
  enterFromRight?: boolean;
  durationInFrames?: number;
}

function TitlePhase({
  eyebrow,
  headline,
  accent,
  mirror = false,
  exitRight = false,
  enterFromRight = false,
  durationInFrames,
}: TitlePhaseProps) {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const S = height / 720; // scale factor

  const EXIT_START = durationInFrames ? durationInFrames - 20 : 9999;
  const exitX = exitRight
    ? interpolate(frame, [EXIT_START, EXIT_START + 28], [0, 80], C)
    : 0;
  const exitO = exitRight
    ? interpolate(frame, [EXIT_START, EXIT_START + 28], [1, 0], C)
    : 1;

  const eyeO = interpolate(frame, [6, 18], [0, 1], C);
  const eyeX = interpolate(frame, [6, 18], [mirror ? 16 : -16, 0], C);
  const lineScale = interpolate(frame, [10, 30], [0, 1], C);
  const h1O = interpolate(frame, [14, 30], [0, 1], C);
  const h1X = enterFromRight ? interpolate(frame, [14, 30], [-40, 0], C) : 0;
  const h1Y = enterFromRight ? 0 : interpolate(frame, [14, 30], [20, 0], C);

  const align = mirror ? "flex-end" : "flex-start";
  const textAlign = mirror ? "right" : ("left" as const);
  const padding = mirror ? { paddingRight: 0 } : { paddingLeft: 0 };

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align,
        justifyContent: "flex-start",
        paddingTop: "10%",
        fontFamily,
        backgroundColor: "transparent",
        ...padding,
        opacity: exitO,
        transform: `translateX(${exitX}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexDirection: mirror ? "row-reverse" : "row",
          gap: 10 * S,
          marginBottom: 14 * S,
          opacity: eyeO,
          transform: `translateX(${eyeX}px)`,
        }}
      >
        <div
          style={{
            width: 28 * S,
            height: 2 * S,
            background: YELLOW,
            borderRadius: 1,
            transformOrigin: mirror ? "right" : "left",
            transform: `scaleX(${lineScale})`,
          }}
        />
        <span
          style={{
            fontSize: 14 * S,
            fontWeight: 600,
            letterSpacing: "2px",
            color: YELLOW,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </span>
      </div>

      <div
        style={{
          maxWidth: 560 * S,
          textAlign,
          marginBottom: 14 * S,
          opacity: h1O,
          transform: `translate(${h1X}px, ${h1Y}px)`,
        }}
      >
        <h2
          style={{
            fontSize: 40 * S,
            fontWeight: 800,
            color: WHITE,
            margin: 0,
            lineHeight: 1.2,
            letterSpacing: "-0.5px",
          }}
        >
          {headline} <span style={{ color: YELLOW }}>{accent}</span>
        </h2>
      </div>
    </AbsoluteFill>
  );
}

// ─── Component: Corner watermark ──────────────────────────────────────────────

function Watermark() {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const S = height / 720;
  const opacity = interpolate(
    frame,
    [0, 20, VIDEO_DUR - 20, VIDEO_DUR],
    [0, 0.5, 0.5, 0],
    C,
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 20 * S,
        right: 24 * S,
        display: "flex",
        alignItems: "center",
        gap: 7 * S,
        opacity,
      }}
    >
      <Img
        src={staticFile("logo.png")}
        style={{ height: 15 * S, objectFit: "contain", filter: "invert(1)" }}
      />
      <span
        style={{
          fontSize: 11 * S,
          fontWeight: 600,
          color: WHITE,
          letterSpacing: "0.02em",
          fontFamily,
        }}
      >
        Polydelve
      </span>
    </div>
  );
}

// ─── Scene: Video ─────────────────────────────────────────────────────────────

function VideoScene() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // All sizing relative to canvas
  const VID_H = Math.round(height * 0.661);
  const VID_W = Math.round((VID_H * 16) / 9);
  const CARD_TOP = Math.round(height * 0.15);

  const cardSpring = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 80 },
  });
  const cardScale = interpolate(cardSpring, [0, 1], [0.95, 1], C);
  const sceneO = interpolate(frame, [0, 10], [0, 1], C);

  const sectionZoom = interpolate(frame, [0, VIDEO_DUR], [1.0, 1.13], C);

  const XOVER_START = PHASE1_DUR - 8;
  const XOVER_END = PHASE1_DUR + 14;

  const rotX = 18;
  const rotY = interpolate(frame, [XOVER_START, XOVER_END], [-4, 4], C);
  const rotZ = interpolate(frame, [XOVER_START, XOVER_END], [-14, 14], C);

  const cardLeft = interpolate(
    frame,
    [XOVER_START, XOVER_END],
    [width - VID_W - Math.round(width * 0.016), Math.round(width * 0.156)],
    C,
  );
  const cardTop = CARD_TOP;
  const cardScale2 = 1.18;

  const cardTransform = `scale(${cardScale * cardScale2 * sectionZoom}) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        opacity: sceneO,
        fontFamily,
      }}
    >
      {/* ── Video card: absolutely positioned, mirrors between phases ── */}
      <div
        style={{
          position: "absolute",
          top: cardTop,
          left: cardLeft,
          perspective: "700px",
          perspectiveOrigin: "50% 50%",
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
            transform: cardTransform,
            filter: "blur(18px)",
            opacity: 0.7,
            zIndex: 0,
          }}
        >
          {/* phase 1 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(
                frame,
                [PHASE1_DUR - 10, PHASE1_DUR + 10],
                [1, 0],
                C,
              ),
            }}
          >
            <OffthreadVideo
              src={staticFile("nextjs_cfr.mp4")}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          {/* phase 2 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(
                frame,
                [PHASE1_DUR - 10, PHASE1_DUR + 10],
                [0, 1],
                C,
              ),
            }}
          >
            <Sequence from={PHASE1_DUR}>
              <OffthreadVideo
                src={staticFile("prediction2_cfr.mp4")}
                startFrom={90}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Sequence>
          </div>
        </div>

        {/* ── Sharp card ── */}
        <div
          style={{
            position: "relative",
            width: VID_W,
            height: VID_H,
            borderRadius: 12,
            overflow: "hidden",
            transform: cardTransform,
            boxShadow:
              "0 60px 140px rgba(0,0,0,0.98), 0 12px 40px rgba(0,0,0,0.7)",
            zIndex: 1,
          }}
        >
          {/* phase 1 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(
                frame,
                [PHASE1_DUR - 10, PHASE1_DUR + 10],
                [1, 0],
                C,
              ),
            }}
          >
            <OffthreadVideo
              src={staticFile("nextjs_cfr.mp4")}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          {/* phase 2 */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(
                frame,
                [PHASE1_DUR - 10, PHASE1_DUR + 10],
                [0, 1],
                C,
              ),
            }}
          >
            <Sequence from={PHASE1_DUR}>
              <OffthreadVideo
                src={staticFile("prediction2_cfr.mp4")}
                startFrom={90}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Sequence>
          </div>
          {/* DoF mask — linear gradient: bottom 40% blurs into DoF layer, top-center stays sharp */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, black 42%, black 100%)",
              maskImage:
                "linear-gradient(to bottom, transparent 0%, black 42%, black 100%)",
              background: "transparent",
              pointerEvents: "none",
            }}
          />

          {/* Heavy vignette — especially dark on the corners like the reference */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 70% 60% at 48% 65%, transparent 20%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.85) 100%)",
              pointerEvents: "none",
            }}
          />

          {/* Chromatic aberration — stronger on tilted edges */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              filter:
                "drop-shadow(3px 0 0 rgba(255,30,30,0.22)) drop-shadow(-3px 0 0 rgba(30,60,255,0.22))",
              borderRadius: 12,
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* ── Text: phase 1 left, phase 2 right ── */}
      <div
        style={{
          position: "absolute",
          top: Math.round(height * 0.033),
          left: interpolate(
            frame,
            [XOVER_START, XOVER_END],
            [
              Math.round(width * 0.056),
              width - Math.round(width * 0.453) - Math.round(width * 0.056),
            ],
            C,
          ),
          width: Math.round(width * 0.453),
          height: Math.round(height * 0.45),
          overflow: "hidden",
          zIndex: 10,
        }}
      >
        <TransitionSeries>
          <TransitionSeries.Sequence durationInFrames={PHASE1_DUR}>
            <TitlePhase
              eyebrow="Step 1 — Find packages"
              headline="Browse npm & PyPI packages."
              accent="See exploit risk in real time."
              exitRight
              durationInFrames={PHASE1_DUR}
            />
          </TransitionSeries.Sequence>

          <TransitionSeries.Transition
            timing={springTiming({
              config: { damping: 200 },
              durationInFrames: TITLE_WIPE,
              durationRestThreshold: 0.001,
            })}
            presentation={wipe({ direction: "from-bottom" })}
          />

          <TransitionSeries.Sequence durationInFrames={PHASE2_DUR}>
            <TitlePhase
              eyebrow="Step 2 — Place your bet"
              headline="Gamble on the prediction market."
              accent="Win schmeckles."
              mirror
              enterFromRight
            />
          </TransitionSeries.Sequence>
        </TransitionSeries>
      </div>

      <Watermark />
    </AbsoluteFill>
  );
}

// ─── Scene: Outro ─────────────────────────────────────────────────────────────

function OutroScene() {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const S = height / 720;

  const scale = spring({ frame, fps, config: { damping: 18, stiffness: 110 } });
  const opacity = interpolate(frame, [0, 12], [0, 1], C);
  const tagO = interpolate(frame, [14, 28], [0, 1], C);
  const tagY = interpolate(frame, [14, 28], [10, 0], C);
  const urlO = interpolate(frame, [26, 38], [0, 1], C);
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14 * S,
            marginBottom: 18 * S,
          }}
        >
          <Img
            src={staticFile("logo.png")}
            style={{
              height: 44 * S,
              objectFit: "contain",
              filter: "invert(1)",
            }}
          />
          <span
            style={{
              fontSize: 32 * S,
              fontWeight: 700,
              letterSpacing: "-0.5px",
              color: WHITE,
            }}
          >
            Polydelve
          </span>
        </div>

        <div
          style={{
            opacity: tagO,
            transform: `translateY(${tagY}px)`,
            marginBottom: 10 * S,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 18 * S, color: ZINC_400, margin: 0 }}>
            Predict. Trade.{" "}
            <span style={{ color: YELLOW }}>Win schmeckles.</span>
          </p>
        </div>

        <div style={{ opacity: urlO }}>
          <span
            style={{
              fontSize: 13 * S,
              color: ZINC_400,
              letterSpacing: "0.04em",
            }}
          >
            polydelve.com
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function SecurityHistory() {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Html5Audio src={staticFile("black_orbit.aac")} volume={0.85} />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO_DUR}>
          <IntroScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: SCENE_FADE,
            durationRestThreshold: 0.001,
          })}
          presentation={fade()}
        />

        <TransitionSeries.Sequence durationInFrames={VIDEO_DUR}>
          <VideoScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          timing={springTiming({
            config: { damping: 200 },
            durationInFrames: SCENE_FADE,
            durationRestThreshold: 0.001,
          })}
          presentation={fade()}
        />

        <TransitionSeries.Sequence durationInFrames={OUTRO_DUR}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}
