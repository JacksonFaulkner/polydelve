import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Img,
  staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import { ShieldCheck, ShieldAlert } from "lucide-react";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "700", "800"],
  subsets: ["latin"],
});

const BG     = "#15191D";
const WHITE  = "#FFFFFF";
const YELLOW = "#FDE832";
const BLUE   = "#3B82F6";
const C = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

// ── Timing ────────────────────────────────────────────────────────────────────
// 0–33    text slides in
// 48–80   logos fly in and park
// 82–170  Delve audit popup runs (3s of theatre)
// 190     IMPACT
// 202+    Polydelve logo emerges
const LINE1_START  = 5;
const LINE1_END    = 18;
const LINE2_START  = 20;
const LINE2_END    = 33;

const FLY_START    = 48;
const FLY_IN_END   = 80;

// Audit popup timing
const AUDIT_START   = 85;   // popup springs in
const AUDIT_RUNNING = 90;   // counter starts climbing
const AUDIT_PEAK    = 155;  // counter hits max (~850 criticals)
const AUDIT_DONE    = 168;  // audit "completes", counter drops
const AUDIT_SETTLED = 178;  // counter lands at 2

const IMPACT       = 190;
const SETTLE_END   = 208;
const EMERGE_START = 202;

export const POLYDELVE_ORIGIN_FRAMES = 240;

const LOGO_W = 480;
const LOGO_H = 200;

// ── Slide-up line ─────────────────────────────────────────────────────────────
function SlideUpLine({ children, start, end }: {
  children: React.ReactNode;
  start: number;
  end: number;
}) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [start, end], [0, 1], C);
  const y = interpolate(frame, [start, end], [32, 0], C);
  return <div style={{ opacity: o, transform: `translateY(${y}px)` }}>{children}</div>;
}

// ── Particle ──────────────────────────────────────────────────────────────────
function Particle({ angle, speed, color, size, delay }: {
  angle: number; speed: number; color: string; size: number; delay: number;
}) {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - IMPACT - delay);
  const dist = interpolate(f, [0, 30], [0, speed * 120], C);
  return (
    <div style={{
      position: "absolute",
      width: size, height: size,
      borderRadius: size * 0.2,
      background: color,
      transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) rotate(${interpolate(f, [0, 30], [0, angle * 200], C)}deg) scale(${interpolate(f, [0, 4, 30], [0, 1, 0], C)})`,
      opacity: interpolate(f, [0, 5, 28, 32], [0, 1, 1, 0], C),
    }} />
  );
}

// ── Delve audit popup ─────────────────────────────────────────────────────────
function DelveAuditPopup({ dlLeft, logoW, logoH, cy }: {
  dlLeft: number; logoW: number; logoH: number; cy: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const popupSpring = spring({ frame: Math.max(0, frame - AUDIT_START), fps, config: { damping: 14, stiffness: 220 } });
  const popupO = interpolate(frame, [AUDIT_START, AUDIT_START + 8, IMPACT - 8, IMPACT], [0, 1, 1, 0], C);
  const popupScale = interpolate(popupSpring, [0, 1], [0.7, 1], C);

  // Counter: rockets up to 852 then slams to 2
  const rawCount  = interpolate(frame, [AUDIT_RUNNING, AUDIT_PEAK], [0, 13], C);
  const dropCount = interpolate(frame, [AUDIT_DONE, AUDIT_SETTLED], [13, 2], C);
  // stall: hold at 13 between AUDIT_PEAK and AUDIT_DONE
  const critCount = frame < AUDIT_PEAK ? Math.round(rawCount)
    : frame < AUDIT_DONE ? 13
    : Math.round(dropCount);

  const isStalling = frame >= AUDIT_PEAK && frame < AUDIT_DONE;
  const isDone     = frame >= AUDIT_DONE;

  // Progress bar: fills 0→100% over audit, then instantly full
  const progress = interpolate(frame, [AUDIT_RUNNING, AUDIT_PEAK], [0, 1], C);

  // Spinner rotation (stops when done)
  const spinDeg = frame < AUDIT_DONE
    ? interpolate(frame, [AUDIT_RUNNING, AUDIT_PEAK], [0, 720], C)
    : 720;

  const popupW = 280;
  const popupX = dlLeft + logoW / 2 - popupW / 2;
  const popupY = cy - logoH / 2 - 180;

  const borderColor = isDone ? "#22c55e" : isStalling ? "#52525b" : "#ef4444";
  const accentColor = isDone ? "#22c55e" : isStalling ? "#71717a" : "#ef4444";
  const countColor  = isDone ? "#22c55e" : isStalling ? "#a1a1aa" : "#ef4444";

  return (
    <div style={{
      position: "absolute",
      left: popupX, top: popupY,
      width: popupW,
      background: "#1e2530",
      border: `1.5px solid ${borderColor}`,
      borderRadius: 14,
      padding: "14px 18px",
      opacity: popupO,
      transform: `scale(${popupScale})`,
      transformOrigin: "bottom center",
      fontFamily,
      boxShadow: `0 8px 32px ${isDone ? "rgba(34,197,94,0.2)" : isStalling ? "rgba(0,0,0,0.2)" : "rgba(239,68,68,0.25)"}`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {isDone
          ? <ShieldCheck size={18} color="#22c55e" />
          : isStalling
          ? <ShieldAlert size={18} color="#71717a" />
          : (
            <div style={{
              width: 16, height: 16,
              border: `2.5px solid #ef4444`,
              borderTopColor: "transparent",
              borderRadius: "50%",
              transform: `rotate(${spinDeg}deg)`,
              flexShrink: 0,
            }} />
          )
        }
        <span style={{ fontSize: 13, fontWeight: 700, color: isDone ? "#22c55e" : WHITE }}>
          {isDone ? "Audit Complete" : isStalling ? "Analyzing results..." : "Audit Running..."}
        </span>
      </div>

      {/* Critical counter */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: `${accentColor}18`,
        borderRadius: 8, padding: "10px 14px", marginBottom: 10,
        border: `1px solid ${accentColor}44`,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 10, color: "#71717a", fontWeight: 700, letterSpacing: "0.08em" }}>CRITICAL</span>
          {isDone && <span style={{ fontSize: 9, color: "#22c55e", opacity: 0.8 }}>vulnerabilities</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isDone && <ShieldCheck size={20} color="#22c55e" />}
          <span style={{
            fontSize: 32, fontWeight: 800,
            color: countColor,
            letterSpacing: "-1.5px",
            minWidth: 48, textAlign: "right",
          }}>
            {critCount}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: "#2d3748", borderRadius: 4, height: 5, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${isDone ? 100 : isStalling ? 92 : progress * 92}%`,
          background: accentColor,
          borderRadius: 4,
        }} />
      </div>

      {isDone && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 7, justifyContent: "flex-end" }}>
          <ShieldCheck size={11} color="#22c55e" />
          <span style={{ fontSize: 10, color: "#22c55e", opacity: 0.75 }}>packages cleared</span>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function PolydelveOrigin() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cx = width / 2;
  const cy = height * 0.65;

  const flyFrame = Math.max(0, frame - FLY_START);
  const logoSpring = spring({ frame: flyFrame, fps, config: { damping: 22, stiffness: 140 } });

  // Each logo has a fixed "parked" X (absolute screen position of its left edge).
  // Spring drives them from off-screen to parked. At IMPACT they fast-interpolate away.
  const pmParkedLeft = cx - LOGO_W - 80;       // right edge 80px left of center
  const dlParkedLeft = cx + 80;                 // left edge 80px right of center

  const pmLeft = frame < IMPACT
    ? interpolate(logoSpring, [0, 1], [-LOGO_W - 20, pmParkedLeft], C)
    : interpolate(frame, [IMPACT, SETTLE_END], [pmParkedLeft, -LOGO_W - 20], C);

  const dlLeft = frame < IMPACT
    ? interpolate(logoSpring, [0, 1], [width + 20, dlParkedLeft], C)
    : interpolate(frame, [IMPACT, SETTLE_END], [dlParkedLeft, width + 20], C);

  const logoOpacity = frame < FLY_START ? 0
    : interpolate(frame, [SETTLE_END - 8, SETTLE_END], [1, 0], C);

  // Slight inward tilt while parked
  const pmRot = interpolate(frame, [FLY_IN_END, IMPACT], [-3, -10], C);
  const dlRot = interpolate(frame, [FLY_IN_END, IMPACT], [3, 10], C);

  // Flash + shake
  const flashO  = interpolate(frame, [IMPACT, IMPACT + 1, IMPACT + 6], [0, 1, 0], C);
  const shakeAmt = interpolate(frame, [IMPACT, IMPACT + 1, IMPACT + 12], [0, 18, 0], C);
  const shakeX  = shakeAmt * Math.sin(frame * 3.7);
  const shakeY  = shakeAmt * Math.cos(frame * 2.9);

  // "+" appears during hold
  const plusO = interpolate(frame, [FLY_IN_END + 4, FLY_IN_END + 16, IMPACT - 4, IMPACT], [0, 0.7, 0.7, 0], C);

  // Polydelve emerges
  const pdSpring = spring({ frame: Math.max(0, frame - EMERGE_START), fps, config: { damping: 12, stiffness: 200 } });
  const pdO      = interpolate(frame, [EMERGE_START, EMERGE_START + 8], [0, 1], C);

  const particles = Array.from({ length: 16 }, (_, i) => ({
    angle: (i / 16) * Math.PI * 2,
    speed: 0.4 + (i % 3) * 0.25,
    color: i % 2 === 0 ? BLUE : YELLOW,
    size: 6 + (i % 4) * 5,
    delay: i % 4,
  }));

  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily }}>
      {/* Flash */}
      <AbsoluteFill style={{ background: WHITE, opacity: flashO, pointerEvents: "none" }} />

      {/* Text — top, stays visible throughout */}
      <div style={{
        position: "absolute", top: 80, left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        pointerEvents: "none",
      }}>
        <SlideUpLine start={LINE1_START} end={LINE1_END}>
          <span style={{ fontSize: 40, fontWeight: 800, color: WHITE, letterSpacing: "-0.5px" }}>
            There is now a place to
          </span>
        </SlideUpLine>
        <SlideUpLine start={LINE2_START} end={LINE2_END}>
          <span style={{ fontSize: 52, fontWeight: 800, color: YELLOW, letterSpacing: "-1px" }}>
            short your tech stack.
          </span>
        </SlideUpLine>
      </div>

      {/* Collision zone — shakes on impact */}
      <AbsoluteFill style={{ transform: `translate(${shakeX}px, ${shakeY}px)` }}>

        {/* Particles at collision point */}
        <div style={{ position: "absolute", left: cx - 8, top: cy - 8 }}>
          {particles.map((p, i) => <Particle key={i} {...p} />)}
        </div>

        {/* Polymarket */}
        <div style={{
          position: "absolute",
          left: pmLeft, top: cy - LOGO_H / 2,
          width: LOGO_W, height: LOGO_H,
          opacity: logoOpacity,
          borderRadius: 16, overflow: "hidden",
          transform: `rotate(${pmRot}deg)`,
          boxShadow: "0 8px 40px rgba(59,130,246,0.5)",
        }}>
          <Img src={staticFile("polymarket.png")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left center" }} />
        </div>

        {/* "+" during hold */}
        <div style={{
          position: "absolute", left: cx - 16, top: cy - 22,
          fontSize: 36, fontWeight: 800, color: WHITE, opacity: plusO,
          pointerEvents: "none",
        }}>+</div>

        {/* Delve audit popup */}
        <DelveAuditPopup dlLeft={dlLeft} logoW={LOGO_W} logoH={LOGO_H} cy={cy} />

        {/* Delve */}
        <div style={{
          position: "absolute",
          left: dlLeft, top: cy - LOGO_H / 2,
          width: LOGO_W, height: LOGO_H,
          opacity: logoOpacity,
          borderRadius: 16, overflow: "hidden",
          transform: `rotate(${dlRot}deg)`,
          boxShadow: "0 8px 40px rgba(253,232,50,0.3)",
        }}>
          <Img src={staticFile("delve.jpg")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left center" }} />
        </div>

        {/* Polydelve logo emerges from collision point */}
        <div style={{
          position: "absolute",
          left: cx - 44, top: cy - 44,
          width: 88, height: 88,
          opacity: pdO,
          transform: `scale(${interpolate(pdSpring, [0, 1], [0.6, 1], C)})`,
          filter: `drop-shadow(0 0 24px ${YELLOW}88)`,
        }}>
          <Img src={staticFile("logo.png")} style={{ width: 88, height: 88, objectFit: "contain", filter: "invert(1)" }} />
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  );
}
