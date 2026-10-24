import { AbsoluteFill, staticFile, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";

// White, to match the rubble scene.
const WHITE = "#FFFFFF";

// The recording is 1152×720 (16:10). Fills most of the canvas at 16:10, capped so it never gets
// blurrier than about 1.7× the capture.
function Recording() {
  const { width, height, fps } = useVideoConfig();
  const w = Math.min(2000, width * 0.9, height * 0.9 * 1.6);
  const h = w / 1.6;
  return (
    <AbsoluteFill style={{ backgroundColor: WHITE, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: w, height: h, borderRadius: 18, overflow: "hidden", boxShadow: "0 40px 120px rgba(21,25,29,0.22)", border: "1px solid #e4e4e7" }}>
        <Video src={staticFile("pypi-slip-fast.mp4")} trimBefore={Math.round(0.8 * fps)} muted style={{ width: w, height: h }} objectFit="cover" />
      </div>
    </AbsoluteFill>
  );
}

// Recording only, no title card: 13.67 s (410 frames at 30 fps, sped up 40%, slower cursor glides).
export function PypiSlipDemo() {
  return <Recording />;
}
