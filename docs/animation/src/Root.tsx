import { Composition, Folder } from "remotion";
import { LinkedInCve } from "./compositions/linkedin/LinkedInCve";
import { HookScene } from "./compositions/linkedin/HookScene";
import { MarketScene } from "./compositions/linkedin/MarketScene";
import { AxiosScene } from "./compositions/linkedin/AxiosScene";
import { EndCard } from "./compositions/linkedin/EndCard";
import { DarioCut, DARIO_CUT_FRAMES } from "./compositions/dario/DarioCut";
import { PolydelveIntro, TOTAL_FRAMES } from "./compositions/PolydelveIntro";
import { RedditClickbait, REDDIT_TOTAL_FRAMES } from "./compositions/RedditClickbait";
import { SecurityHistory, SECURITY_HISTORY_FRAMES } from "./compositions/SecurityHistory";
import { PolydelveOrigin, POLYDELVE_ORIGIN_FRAMES } from "./compositions/PolydelveOrigin";
import { FluxShowThisCome, MinimaxHandleNoAngryBird, MinimaxShowRedOb, ClipSequence, CLIP_SEQUENCE_FRAMES } from "./compositions/ClipReview";
import { PolydelveReel, POLYDELVE_REEL_FRAMES } from "./compositions/PolydelveReel";
import { PypiSlipDemo } from "./compositions/PypiSlipDemo";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="PolydelveIntro"
        component={PolydelveIntro}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="RedditClickbait"
        component={RedditClickbait}
        durationInFrames={REDDIT_TOTAL_FRAMES}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="SecurityHistory"
        component={SecurityHistory}
        durationInFrames={SECURITY_HISTORY_FRAMES}
        fps={30}
        width={3840}
        height={2160}
      />
      <Composition
        id="PolydelveOrigin"
        component={PolydelveOrigin}
        durationInFrames={POLYDELVE_ORIGIN_FRAMES}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="LinkedInCve"
        component={LinkedInCve}
        durationInFrames={360}
        fps={30}
        width={1080}
        height={1350}
      />
      <Composition
        id="DarioCut"
        component={DarioCut}
        durationInFrames={DARIO_CUT_FRAMES}
        fps={30}
        width={1080}
        height={1350}
      />
      <Folder name="LinkedInCve-Scenes">
        <Composition id="LinkedInHook" component={HookScene} durationInFrames={84} fps={30} width={1080} height={1350} />
        <Composition id="LinkedInMarket" component={MarketScene} durationInFrames={138} fps={30} width={1080} height={1350} />
        <Composition id="LinkedInAxios" component={AxiosScene} durationInFrames={84} fps={30} width={1080} height={1350} />
        <Composition id="LinkedInEnd" component={EndCard} durationInFrames={78} fps={30} width={1080} height={1350} />
      </Folder>
      <Composition
        id="PolydelveReel"
        component={PolydelveReel}
        durationInFrames={POLYDELVE_REEL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="PypiSlipDemo"
        component={PypiSlipDemo}
        durationInFrames={378}
        fps={30}
        width={1920}
        height={1080}
      />
      <Folder name="ClipReview">
        <Composition id="ClipSequence" component={ClipSequence} durationInFrames={CLIP_SEQUENCE_FRAMES} fps={24} width={2544} height={1456} />
        <Composition id="FluxShowThisCome" component={FluxShowThisCome} durationInFrames={121} fps={24} width={1280} height={704} />
        <Composition id="MinimaxHandleNoAngryBird" component={MinimaxHandleNoAngryBird} durationInFrames={124} fps={24} width={2544} height={1456} />
        <Composition id="MinimaxShowRedOb" component={MinimaxShowRedOb} durationInFrames={124} fps={24} width={2544} height={1456} />
      </Folder>
    </>
  );
}
