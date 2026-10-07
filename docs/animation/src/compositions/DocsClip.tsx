import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig, staticFile } from "remotion"
import { Video } from "@remotion/media"

// A recorded app flow (scripts/demos.mjs) framed for the docs. The camera
// moves between element-based focus boxes recorded during the flow; the clip
// starts and ends on the full view so it loops cleanly.
export const DOCS_W = 1152
export const DOCS_H = 720
const MAX_ZOOM = 2 // source is captured at 2× device scale, so 2× camera zoom stays sharp
const MOVE_SEC = 0.9

type Focus = { t: number; x: number; y: number; w: number; h: number }
export type DocsClipProps = {
  src: string
  srcW: number
  srcH: number
  startSec: number
  durationSec: number
  focus: Focus[]
}

export const docsClipDefaults: DocsClipProps = {
  src: "docs/place-bet.mp4",
  srcW: 1600,
  srcH: 1000,
  startSec: 1,
  durationSec: 5,
  focus: [],
}

type Cam = { cx: number; cy: number; s: number }

// Source-space centre + output scale that fits a focus box (or the full frame).
function camFor(p: DocsClipProps, f?: Focus): Cam {
  const fit = Math.min(DOCS_W / p.srcW, DOCS_H / p.srcH)
  if (!f) return { cx: p.srcW / 2, cy: p.srcH / 2, s: fit }
  const s = Math.max(fit, Math.min(MAX_ZOOM, DOCS_W / f.w, DOCS_H / f.h))
  return { cx: f.x + f.w / 2, cy: f.y + f.h / 2, s }
}

export const DocsClip: React.FC<DocsClipProps> = (props) => {
  const { src, srcW, srcH, startSec, durationSec, focus } = props
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = frame / fps

  // Keyframes: full view → each focus → full view. Each move starts at its own
  // time and eases; between moves the camera holds.
  const keys: { t: number; cam: Cam }[] = [
    { t: 0, cam: camFor(props) },
    ...focus.map((f) => ({ t: f.t, cam: camFor(props, f) })),
    { t: Math.max(0, durationSec - MOVE_SEC - 0.4), cam: camFor(props) },
  ]
  let from = keys[0]
  let to = keys[0]
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].t <= t) { from = keys[i]; to = keys[Math.min(i + 1, keys.length - 1)] }
  }
  const k = from === to ? 1 : interpolate(t, [from.t, Math.min(to.t, from.t + MOVE_SEC)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.45, 0, 0.2, 1),
  })
  const s = from.cam.s + (to.cam.s - from.cam.s) * k
  const cx = from.cam.cx + (to.cam.cx - from.cam.cx) * k
  const cy = from.cam.cy + (to.cam.cy - from.cam.cy) * k
  // translate so (cx, cy) is centred, without exposing past the video edges
  const tx = Math.min(0, Math.max(DOCS_W - srcW * s, DOCS_W / 2 - cx * s))
  const ty = Math.min(0, Math.max(DOCS_H - srcH * s, DOCS_H / 2 - cy * s))

  return (
    <AbsoluteFill style={{ background: "#15191D", overflow: "hidden" }}>
      <Video
        src={staticFile(src)}
        trimBefore={Math.round(startSec * fps)}
        premountFor={fps}
        muted
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: srcW,
          height: srcH,
          transformOrigin: "0 0",
          translate: `${tx}px ${ty}px`,
          scale: s,
        }}
      />
    </AbsoluteFill>
  )
}
