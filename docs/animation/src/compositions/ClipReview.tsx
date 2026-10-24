import { AbsoluteFill, Easing, OffthreadVideo, Sequence, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { CrashPanToDemo, PAN_FRAMES, REC_FRAMES, DOWN_FRAMES } from "./CrashPanToDemo";
import { RubbleScene } from "./RubbleHold";
import { ClipEndCard } from "./ClipEndCard";

// Plain full-frame playback of each raw clip, for scrubbing and cropping in Studio.

const ClipFrame = ({ file, muted = false }: { file: string; muted?: boolean }) => (
  <AbsoluteFill
    style={{
      backgroundColor: "#FFFFFF"
    }}
  >
    <OffthreadVideo src={staticFile(file)} muted={muted} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
  </AbsoluteFill>
);

export const FluxShowThisCome = () => <ClipFrame file="clip_flux_show_this_come.mp4" />;
export const MinimaxHandleNoAngryBird = () => <ClipFrame file="clip_minimax_handle_no_angry_bird.mp4" />;
export const MinimaxShowRedOb = () => <ClipFrame file="clip_minimax_show_red_ob.mp4" />;
export const FluxShowTheTower = () => <ClipFrame file="clip_flux_show_the_tower.mp4" />;

// The sequence is built on an untrimmed ("body") timeline at 24 fps. CLIP_TRIM_FRAMES cut from the
// start; 0 keeps the whole first clip.
//   flux 0–117, graded crash 118–202, text from 178, rubble from 203,
//   pan up at PAN_START (body 384 = 16.0 s), recording, pan back down into the outro clip, end card.
export const CLIP_TRIM_FRAMES = 0;
// The voiceover runs 8.52 s (204 frames) from body 178, so the pan waits for it to finish.
const PAN_START = 384;
const OUTRO_START = PAN_START + REC_FRAMES;
// The outro clip is 6.04 s (145 frames at 24 fps). It replaces the rubble still and ends the sequence.
const OUTRO_FRAMES = 145;
// Cut at 33.11 s. At 24 fps the nearest frame is 795 (33.125 s), so the sequence ends there.
export const CLIP_SEQUENCE_FRAMES = Math.round(33.11 * 24);

// Demo narration clips. startSec is seconds after the pan up (PAN_START). Times are approximate.
const DEMO_VO = [
  { file: "rowan_demo_01_search.mp3", startSec: 0 },
  { file: "rowan_demo_02_litellm.mp3", startSec: 2 },
  { file: "rowan_demo_04_threshold.mp3", startSec: 5 },
];

// The outro clip replaces the rubble still. It slides up from below on the pan down, as the rubble did,
// then plays to its end.
const OutroClip = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const up = interpolate(frame, [0, DOWN_FRAMES], [1, 0], { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ transform: `translateY(${up * height}px)` }}>
      <ClipFrame file="outro_rubble_clear.mp4" />
    </AbsoluteFill>
  );
};

const ClipSequenceBody = () => (
  <AbsoluteFill>
    {/* Intro voiceover, delayed 1 s (from body 24). It ends at body 201.4, after the rubble text starts. */}
    <Audio name="Voiceover (Rowan)" src={staticFile("intro_rowan.mp3")} from={4} />
    {/* Sound from the first clip, split into its steady environment and its bird sounds, each looped
        under the whole sequence. Both start at the first visible frame (body 27). */}
    <Series>
      <Series.Sequence durationInFrames={118}>
        <ClipFrame file="clip_flux_show_this_come.mp4" muted />
      </Series.Sequence>
      <Series.Sequence durationInFrames={85} premountFor={24}>
        <ClipFrame file="clip_flux_show_the_tower_graded.mp4" />
      </Series.Sequence>
    </Series>
    {/* Rubble and its text. They slide out of frame together on the pan up; the demo is always in front. */}
    <Sequence name="Rubble scene" from={178} durationInFrames={OUTRO_START - 178}>
      <Audio name="Voiceover" src={staticFile("voice_over_eleven.mp3")} />
      <RubbleScene
        startBody={178}
        panStart={PAN_START}
        panFrames={PAN_FRAMES}
        downStart={PAN_START + REC_FRAMES}
        downFrames={DOWN_FRAMES}
        stillStart={203}
        lines={[
          { text: "Polydelve turns supply chain risk into a bet.", startSec: 0.23, size: 56, color: "#52525b" },
          { text: "Search PyPI and npm packages.", startSec: 3.81, size: 104, color: "#15191D" },
          { text: "Add them to a slip.", startSec: 6.48, size: 104, color: "#15191D" },
          { text: "Then submit.", startSec: 7.64, size: 104, color: "#15191D", highlight: true },
        ]}
      />
    </Sequence>
    {/* The demo: slides in from above, plays the recording, slides back out after the Buy click. */}
    <Sequence name="Demo" from={PAN_START} durationInFrames={REC_FRAMES + DOWN_FRAMES} premountFor={24}>
      <CrashPanToDemo />
    </Sequence>
    {/* Demo narration, one clip per line, each starting at its time after the pan up. */}
    {DEMO_VO.map((clip) => (
      <Sequence key={clip.file} name={clip.file} from={PAN_START + Math.round(clip.startSec * 24)}>
        <Audio src={staticFile(clip.file)} />
      </Sequence>
    ))}
    {/* Outro clip, from the pan down to the end of the sequence. */}
    <Sequence name="Outro clip" from={OUTRO_START} durationInFrames={OUTRO_FRAMES}>
      <OutroClip />
    </Sequence>
    {/* End card in the white space above the outro clip's rubble, once it has slid up. */}
    <Sequence name="End card" from={OUTRO_START + DOWN_FRAMES} durationInFrames={OUTRO_FRAMES - DOWN_FRAMES}>
      <ClipEndCard />
    </Sequence>
  </AbsoluteFill>
);

// Starts CLIP_TRIM_FRAMES in (0 now, so the whole first clip shows).
export const ClipSequence = () => (
  <Sequence from={-CLIP_TRIM_FRAMES}>
    <ClipSequenceBody />
  </Sequence>
);
