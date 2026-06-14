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

// ─── Palette ──────────────────────────────────────────────────────────────────

const BG = "#0a0a0a";
const RED = "#ef4444";
const RED_DIM = "#7f1d1d";
const WHITE = "#fafafa";
const INDIGO = "#6366f1";
const ZINC_400 = "#a1a1aa";
const MCAFEE_BLUE = "#0000aa"; // classic Windows BSOD blue

// ─── Timing (30fps, 7s = 210 frames) ─────────────────────────────────────────

export const REDDIT_TOTAL_FRAMES = 210;

const ALERT_END    = 54;
const HOOK_START   = 50;
const HOOK_END     = 90;
const BROLL_START  = 90;
const BROLL_END    = 150;
const PREDICT_START = 150;
const PREDICT_END  = 196;
const LOGO_START   = 196;

// McAfee flash window
const MCAFEE_IN  = 3;
const MCAFEE_OUT = 10;

// Red strobe
const FLASH1 = 12;
const FLASH2 = 19;

// Alert typewriter
const LINE1_START = 26;
const LINE1_TEXT  = "[CRITICAL] CVE DETECTED";
const LINE2_START = 40;
const LINE2_TEXT  = "litellm · axios · next.js";

// Opera popup appears during b-roll, stays through predict
const OPERA_IN = 108;

// Source video fps
const SRC_FPS = 60;
const sf = (sec: number) => Math.round(sec * SRC_FPS);

// ─── Shake helper ─────────────────────────────────────────────────────────────

function useShake(startF: number, endF: number, amplitude = 18, freq = 2.0) {
  const frame = useCurrentFrame();
  if (frame < startF || frame > endF) return { x: 0, y: 0 };
  const t = frame - startF;
  const decay = Math.max(0, 1 - t / (endF - startF));
  const x = Math.sin(t * freq) * amplitude * decay;
  const y = Math.cos(t * freq * 0.7) * amplitude * 0.4 * decay;
  return { x, y };
}

// ─── McAfee crash dialog ──────────────────────────────────────────────────────

function McAfeeDialog() {
  return (
    <div
      style={{
        width: 380,
        background: "#d4d0c8",
        border: "2px solid #ffffff",
        borderRightColor: "#404040",
        borderBottomColor: "#404040",
        fontFamily: "Tahoma, Arial, sans-serif",
        boxShadow: "4px 4px 0px #000000",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: `linear-gradient(to right, ${MCAFEE_BLUE}, #1084d0)`,
          padding: "3px 6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: WHITE, fontSize: 11, fontWeight: 700 }}>
          🛡️ McAfee Antivirus
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          {["_", "□", "✕"].map((ch) => (
            <div
              key={ch}
              style={{
                width: 16,
                height: 14,
                background: "#d4d0c8",
                border: "1px solid #fff",
                borderRightColor: "#404040",
                borderBottomColor: "#404040",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: "#000",
                fontWeight: 700,
              }}
            >
              {ch}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 14px 12px", display: "flex", gap: 12 }}>
        <div style={{ fontSize: 32, lineHeight: 1 }}>⚠️</div>
        <div>
          <div style={{ fontSize: 12, color: "#000", marginBottom: 6, fontWeight: 700 }}>
            MCAFEE.EXE has stopped working
          </div>
          <div style={{ fontSize: 11, color: "#444", lineHeight: 1.4 }}>
            Windows is collecting more information about the problem. This may take several minutes...
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ padding: "0 14px 12px", display: "flex", justifyContent: "flex-end", gap: 6 }}>
        {["Cancel", "Debug"].map((label) => (
          <div
            key={label}
            style={{
              padding: "3px 16px",
              background: "#d4d0c8",
              border: "2px solid #fff",
              borderRightColor: "#404040",
              borderBottomColor: "#404040",
              fontSize: 11,
              color: "#000",
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Opera browser popup ──────────────────────────────────────────────────────

function OperaPopup({ offsetX = 0, offsetY = 0, rotation = 0, entryFrame = 0 }: {
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  entryFrame?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame: Math.max(0, frame - entryFrame), fps, config: { damping: 14, stiffness: 160 } });
  const opacity = interpolate(frame, [entryFrame, entryFrame + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: `calc(50% + ${offsetY}px)`,
        left: `calc(50% + ${offsetX}px)`,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
        opacity,
        width: 380,
        background: "#f0ede8",
        border: "1px solid #999",
        fontFamily: "Tahoma, Arial, sans-serif",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: "linear-gradient(to bottom, #e8e4df, #d8d4cf)",
          padding: "6px 10px",
          borderBottom: "1px solid #bbb",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>
          🔴 Opera
        </span>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "#ff5f57",
            border: "1px solid #e0443e",
            fontSize: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 900,
          }}
        >
          ✕
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "18px 16px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ fontSize: 28 }}>🌐</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6 }}>
            Set Opera as your default browser?
          </div>
          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>
            Opera is faster, safer, and uses less memory. Make Opera your default browser today.
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div
        style={{
          padding: "0 16px 14px",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        {[
          { label: "Not now", bg: "#e8e4df", color: "#333" },
          { label: "Yes, set Opera!", bg: "#cc0000", color: "#fff" },
        ].map(({ label, bg, color }) => (
          <div
            key={label}
            style={{
              padding: "5px 14px",
              background: bg,
              border: "1px solid #aaa",
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 700,
              color,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Scene 1: Pager-buzz alert ────────────────────────────────────────────────

function AlertScene() {
  const frame = useCurrentFrame();

  // McAfee dialog flash — brief subliminal
  const mcafeeO = interpolate(
    frame,
    [MCAFEE_IN, MCAFEE_IN + 1, MCAFEE_OUT - 1, MCAFEE_OUT],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Red double-strobe
  const flash1 = interpolate(frame, [FLASH1, FLASH1 + 2, FLASH1 + 5], [0, 1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const flash2 = interpolate(frame, [FLASH2, FLASH2 + 2, FLASH2 + 6], [0, 0.65, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const flashOpacity = Math.max(flash1, flash2);

  const { x, y } = useShake(FLASH1, FLASH1 + 22, 22, 2.0);

  // Line 1 typewriter
  const chars1 = Math.floor(
    interpolate(frame, [LINE1_START, LINE1_START + 18], [0, LINE1_TEXT.length], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    })
  );
  // Line 2 typewriter
  const chars2 = Math.floor(
    interpolate(frame, [LINE2_START, LINE2_START + 14], [0, LINE2_TEXT.length], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    })
  );

  const cursorOn = Math.floor(frame / 7) % 2 === 0;

  const textO = interpolate(frame, [LINE1_START, LINE1_START + 4], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const glowO = interpolate(frame, [LINE1_START, LINE1_START + 20], [0, 0.2], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const showLine2 = frame >= LINE2_START;
  const activeCursor = frame < LINE2_START ? 1 : 2;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        transform: `translate(${x}px, ${y}px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
      }}
    >
      {/* McAfee subliminal — blue background + dialog */}
      <AbsoluteFill style={{ backgroundColor: MCAFEE_BLUE, opacity: mcafeeO, pointerEvents: "none" }} />
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: mcafeeO,
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        <McAfeeDialog />
      </AbsoluteFill>

      {/* Red strobe */}
      <AbsoluteFill style={{ backgroundColor: RED, opacity: flashOpacity, pointerEvents: "none" }} />

      {/* Glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 600px 200px at center, ${RED} 0%, transparent 70%)`,
          opacity: glowO,
          pointerEvents: "none",
        }}
      />

      {/* Alert text */}
      <div style={{ opacity: textO, textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: RED, letterSpacing: "0.08em", textShadow: `0 0 24px ${RED}`, marginBottom: 10 }}>
          {LINE1_TEXT.slice(0, chars1)}
          {activeCursor === 1 && <span style={{ opacity: cursorOn ? 1 : 0 }}>█</span>}
        </div>
        {showLine2 && (
          <div style={{ fontSize: 20, fontWeight: 600, color: RED_DIM, letterSpacing: "0.1em" }}>
            {LINE2_TEXT.slice(0, chars2)}
            {activeCursor === 2 && <span style={{ opacity: cursorOn ? 1 : 0 }}>█</span>}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 2: Hook text ───────────────────────────────────────────────────────

function HookScene() {
  const frame = useCurrentFrame();

  const lines = [
    { text: "I built a site where you", color: ZINC_400, delay: 0 },
    { text: "bet on npm packages", color: WHITE, delay: 8 },
    { text: "getting hacked.", color: RED, italic: true, delay: 16 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "0 120px",
        textAlign: "center",
      }}
    >
      {lines.map(({ text, color, italic, delay }) => {
        const o = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const yy = interpolate(frame, [delay, delay + 12], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={text} style={{ opacity: o, transform: `translateY(${yy}px)` }}>
            <span style={{ fontSize: 40, fontWeight: italic ? 800 : 700, color, lineHeight: 1.3, fontStyle: italic ? "italic" : "normal" }}>
              {text}
            </span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

// ─── Scene 3: security_feed.mov B-roll ───────────────────────────────────────

function BRollScene() {
  const frame = useCurrentFrame();

  const zoom = interpolate(frame, [0, BROLL_END - BROLL_START], [1.0, 1.06], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const operaVisible = frame >= OPERA_IN - BROLL_START;

  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <OffthreadVideo
          src={staticFile("security_feed.mov")}
          startFrom={sf(8.9)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>

      {/* Dark vignette */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.65) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Opera popups */}
      {operaVisible && (
        <>
          <OperaPopup offsetX={-60} offsetY={40} rotation={-2} entryFrame={OPERA_IN - BROLL_START} />
          <OperaPopup offsetX={80} offsetY={-60} rotation={3} entryFrame={OPERA_IN - BROLL_START + 12} />
        </>
      )}
    </AbsoluteFill>
  );
}

// ─── Scene 4: walkthrough.mov predict clip ────────────────────────────────────

function PredictScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sceneLen = PREDICT_END - PREDICT_START;
  const zoom = interpolate(frame, [0, sceneLen], [1.0, 1.05], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // EPSS badge slides in after a beat
  const badgeO = interpolate(frame, [18, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const badgeScale = spring({ frame: Math.max(0, frame - 18), fps, config: { damping: 12, stiffness: 120 } });
  const pulse = 0.7 + 0.3 * Math.sin((frame / fps) * Math.PI * 3);

  // Third Opera popup appears here
  const opera3O = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opera3Scale = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });

  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <OffthreadVideo
          src={staticFile("walkthrough.mov")}
          startFrom={sf(11.0)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <AbsoluteFill style={{ background: "rgba(0,0,0,0.45)" }} />
      </AbsoluteFill>

      {/* EPSS badge */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: badgeO,
          transform: `scale(${badgeScale})`,
        }}
      >
        <div
          style={{
            background: "#0f0f0f",
            border: `2px solid ${RED}`,
            borderRadius: 16,
            padding: "20px 44px",
            textAlign: "center",
            boxShadow: `0 0 ${40 * pulse}px ${RED}55`,
            fontFamily: "monospace",
          }}
        >
          <div style={{ fontSize: 12, color: ZINC_400, letterSpacing: "0.12em", marginBottom: 6 }}>
            EPSS EXPLOIT PROBABILITY
          </div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: RED,
              lineHeight: 1,
              textShadow: `0 0 ${20 * pulse}px ${RED}`,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            84.5%
          </div>
          <div style={{ fontSize: 12, color: RED_DIM, marginTop: 6, letterSpacing: "0.06em" }}>
            react-server-dom-webpack
          </div>
        </div>
      </AbsoluteFill>

      {/* Third Opera popup — bottom corner, chaotic */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          right: 80,
          opacity: opera3O,
          transform: `scale(${opera3Scale}) rotate(5deg)`,
        }}
      >
        <OperaPopup offsetX={0} offsetY={0} rotation={0} entryFrame={0} />
      </div>
    </AbsoluteFill>
  );
}

// ─── Scene 5: Logo lockup ─────────────────────────────────────────────────────

function LogoScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glowPulse = 0.6 + 0.4 * Math.sin((frame / fps) * Math.PI * 2);

  const tagO = interpolate(frame, [8, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tagY = interpolate(frame, [8, 20], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const mcafeeO = interpolate(frame, [16, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 500px 300px at center, ${INDIGO}33 0%, transparent 70%)`,
          opacity: glowPulse,
          pointerEvents: "none",
        }}
      />

      <div style={{ opacity, transform: `scale(${scale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Img src={staticFile("logo.png")} style={{ height: 50, objectFit: "contain", filter: "invert(1)" }} />
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-1px", color: WHITE }}>Polydelve</span>
        </div>

        <div style={{ opacity: tagO, transform: `translateY(${tagY}px)` }}>
          <span style={{ fontSize: 14, color: ZINC_400, letterSpacing: "0.04em" }}>polydelve.com</span>
        </div>

        <div style={{ opacity: mcafeeO, marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "#52525b", letterSpacing: "0.03em", fontStyle: "italic" }}>
            John McAfee was right. He just didn't have this site.
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Crossfade overlay ────────────────────────────────────────────────────────

function FadeIn({ startF = 0, dur = 8 }: { startF?: number; dur?: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [startF, startF + dur], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ backgroundColor: BG, opacity, pointerEvents: "none" }} />;
}

// ─── Root composition ─────────────────────────────────────────────────────────

export function RedditClickbait() {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Sequence from={0} durationInFrames={ALERT_END + 6}>
        <AlertScene />
      </Sequence>

      <Sequence from={HOOK_START} durationInFrames={HOOK_END - HOOK_START + 6}>
        <FadeIn startF={0} dur={8} />
        <HookScene />
      </Sequence>

      <Sequence from={BROLL_START} durationInFrames={BROLL_END - BROLL_START + 6}>
        <FadeIn startF={0} dur={6} />
        <BRollScene />
      </Sequence>

      <Sequence from={PREDICT_START} durationInFrames={PREDICT_END - PREDICT_START + 6}>
        <FadeIn startF={0} dur={6} />
        <PredictScene />
      </Sequence>

      <Sequence from={LOGO_START} durationInFrames={REDDIT_TOTAL_FRAMES - LOGO_START}>
        <FadeIn startF={0} dur={8} />
        <LogoScene />
      </Sequence>
    </AbsoluteFill>
  );
}
