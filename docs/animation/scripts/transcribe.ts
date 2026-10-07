// Usage: node scripts/transcribe.ts public/dario_speech.mp4 out/dario_captions.json
// Local Whisper (WebGPU) → @remotion/captions Caption[] JSON with word timings.
import { registerMediabunnyServer } from "@mediabunny/server";
import {
  WHISPER_WEBGPU_SAMPLE_RATE,
  canUseWhisperWebGpu,
  downloadWhisperModel,
  loadWhisperModel,
  toCaptions,
  transcribe,
} from "@remotion/whisper-webgpu";
import { ALL_FORMATS, Conversion, FilePathSource, Input, NullTarget, Output, WavOutputFormat } from "mediabunny";
import { writeFile } from "node:fs/promises";

const [src, dest] = process.argv.slice(2);
if (!src || !dest) throw new Error("usage: transcribe.ts <input> <output.json>");

registerMediabunnyServer();

const support = await canUseWhisperWebGpu();
if (!support.supported) throw new Error(support.detailedReason);

type WaveformChunk = { startFrame: number; waveform: Float32Array };
const chunks: WaveformChunk[] = [];

using input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(src) });
const audioTrack = await input.getPrimaryAudioTrack();
if (audioTrack === null) throw new Error("The media does not contain an audio track.");

const conversion = await Conversion.init({
  input,
  output: new Output({ format: new WavOutputFormat(), target: new NullTarget() }),
  video: { discard: true },
  audio: (track) => {
    if (track.id !== audioTrack.id) return { discard: true };
    return {
      codec: "pcm-f32",
      forceTranscode: true,
      numberOfChannels: 1,
      sampleFormat: "f32",
      sampleRate: WHISPER_WEBGPU_SAMPLE_RATE,
      process: (sample) => {
        const waveform = new Float32Array(
          sample.allocationSize({ format: "f32", planeIndex: 0 }) / Float32Array.BYTES_PER_ELEMENT,
        );
        sample.copyTo(waveform, { format: "f32", planeIndex: 0 });
        chunks.push({ startFrame: Math.round(sample.timestamp * WHISPER_WEBGPU_SAMPLE_RATE), waveform });
        return sample;
      },
    };
  },
});
if (!conversion.isValid) throw new Error("The audio track cannot be decoded.");
await conversion.execute();

const waveformLength = chunks.reduce((max, c) => Math.max(max, c.startFrame + c.waveform.length), 0);
const channelWaveform = new Float32Array(waveformLength);
for (const chunk of chunks) {
  const destinationStart = Math.max(0, chunk.startFrame);
  const sourceStart = Math.max(0, -chunk.startFrame);
  const n = Math.min(chunk.waveform.length - sourceStart, channelWaveform.length - destinationStart);
  if (n > 0) channelWaveform.set(chunk.waveform.subarray(sourceStart, sourceStart + n), destinationStart);
}

const model = "small.en";
await downloadWhisperModel({ model });
await using _modelHandle = await loadWhisperModel({ model });
const transcription = await transcribe({ channelWaveform, model });
const { captions } = toCaptions({ whisperWebGpuOutput: transcription });

await writeFile(dest, JSON.stringify(captions, null, 2));
console.log(`${captions.length} captions → ${dest}`);
