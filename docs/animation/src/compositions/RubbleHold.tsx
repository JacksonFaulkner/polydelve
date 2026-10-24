import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["400", "600", "700", "800"],
  subsets: ["latin"],
});

const WHITE = "#FFFFFF";
const YELLOW = "#FDE832";

const ease = { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type TypedText = { text: string; startSec: number; size: number; color: string; highlight?: boolean };

// One line, typed at 30 characters per second from startSec.
function TypedLine({ line }: { line: TypedText }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const elapsed = frame - Math.round(line.startSec * fps);
  const chars = Math.max(0, Math.min(line.text.length, Math.floor((elapsed / fps) * 30)));
  const caretOn = elapsed >= 0 && Math.floor(frame / 15) % 2 === 0;
  return (
    <div style={{ fontSize: line.size, fontWeight: 800, letterSpacing: "-2px", lineHeight: 1.2, color: line.color, minHeight: line.size * 1.2 }}>
      <span
        style={{
          background: line.highlight && chars > 0 ? YELLOW : "transparent",
          padding: line.highlight && chars > 0 ? "0 0.14em" : 0,
          borderRadius: 14,
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
        }}
      >
        {line.text.slice(0, chars)}
      </span>
      <span style={{ opacity: caretOn && chars < line.text.length ? 1 : 0 }}>|</span>
    </div>
  );
}

// Typed lines in the open space above the rubble. Its timeline starts at its own Sequence's frame 0.
export function RubbleText({ lines }: { lines: TypedText[] }) {
  return (
    <AbsoluteFill style={{ fontFamily, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 170 }}>
      <div style={{ textAlign: "center" }}>
        {lines.map((line) => (
          <TypedLine key={line.text} line={line} />
        ))}
      </div>
    </AbsoluteFill>
  );
}

// The rubble still and its typed text, moving as one. Local frame 0 is body frame startBody.
// Pan up: the still and the text slide down together and leave the frame; the text is visible
// until it has left. Pan down: the still comes back from below, with no text.
export function RubbleScene({
  startBody,
  panStart,
  panFrames,
  downStart,
  downFrames,
  stillStart,
  lines,
}: {
  startBody: number;
  panStart: number;
  panFrames: number;
  downStart: number;
  downFrames: number;
  stillStart: number;
  lines: TypedText[];
}) {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const body = frame + startBody;

  const up = interpolate(body, [panStart, panStart + panFrames], [0, 1], ease);
  const down = interpolate(body, [downStart, downStart + downFrames], [0, 1], ease);
  const y = body < panStart ? 0 : body < downStart ? up * height : (1 - down) * height;
  const textVisible = body < panStart + panFrames;

  return (
    <AbsoluteFill style={{ transform: `translateY(${y}px)` }}>
      {body >= stillStart ? (
        <AbsoluteFill style={{ backgroundColor: WHITE }}>
          <Img src={staticFile("crash_end.png")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
        </AbsoluteFill>
      ) : null}
      <div style={{ opacity: textVisible ? 1 : 0 }}>
        <RubbleText lines={lines} />
      </div>
    </AbsoluteFill>
  );
}
