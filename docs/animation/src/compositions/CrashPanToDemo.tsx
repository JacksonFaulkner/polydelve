import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { PypiSlipDemo } from "./PypiSlipDemo";

// The demo layer only. The rubble and its text live in RubbleScene, so they move as one piece.
// Frames at 24 fps, from this sequence's frame 0 (the pan-up start):
//   0 .. PAN_FRAMES                    the demo slides down into frame from above
//   0 .. REC_FRAMES                    the recording plays (it ends on the Buy click)
//   REC_FRAMES .. +DOWN_FRAMES         the demo slides back up out of frame
export const PAN_FRAMES = 36; // 1.5 s
export const REC_FRAMES = 302; // the take minus its first 0.8 s (378 frames at 30 fps), converted to 24 fps
export const DOWN_FRAMES = 36; // 1.5 s
export const END_FRAMES = 96; // 4 s

const ease = { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export function CrashPanToDemo() {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  const up = interpolate(frame, [0, PAN_FRAMES], [0, 1], ease);
  const down = interpolate(frame, [REC_FRAMES, REC_FRAMES + DOWN_FRAMES], [0, 1], ease);
  const y = frame < REC_FRAMES ? (up - 1) * height : -down * height;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translateY(${y}px)` }}>
        <PypiSlipDemo />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
