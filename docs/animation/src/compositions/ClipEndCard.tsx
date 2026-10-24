import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const INK = "#15191D";
const MUTED = "#52525b";
const YELLOW = "#FDE832";

const TAGLINE = "Predict. Trade. Win bits.";
const ACCENT_AT = TAGLINE.indexOf("Win bits.");

// End card centred in the white space above the rubble. The rubble fills the bottom of the frame,
// so the content is centred in the top ~540 px. The tagline types out like the other typed text
// (30 characters per second) and its last part gets the yellow highlight. Pops in from frame 0.
export function ClipEndCard() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 20, stiffness: 340 } });

  const start = Math.round(0.4 * fps);
  const chars = Math.max(0, Math.min(TAGLINE.length, Math.floor(((frame - start) / fps) * 30)));
  const caretOn = frame >= start && Math.floor(frame / 15) % 2 === 0;
  const shown = TAGLINE.slice(0, chars);
  const plain = shown.slice(0, ACCENT_AT);
  const accent = shown.slice(ACCENT_AT);

  return (
    <AbsoluteFill style={{ fontFamily, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 740 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${0.9 + 0.1 * p})`, opacity: Math.min(1, p) }}>
        <p style={{ fontSize: 160, fontWeight: 800, letterSpacing: "-4px", color: MUTED, margin: "0 0 40px", textAlign: "center", minHeight: 192 }}>
          {plain}
          <span
            style={{
              color: INK,
              background: accent.length > 0 ? YELLOW : "transparent",
              padding: accent.length > 0 ? "0 0.14em" : 0,
              borderRadius: 14,
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
            }}
          >
            {accent}
          </span>
          <span style={{ opacity: caretOn && chars < TAGLINE.length ? 1 : 0, color: INK }}>|</span>
        </p>
        <Img
          src={staticFile("logo-hd.png")}
          style={{
            height: 280,
            objectFit: "contain",
            translate: "0px 18.6px"
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
