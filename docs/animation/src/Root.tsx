import { Composition, Folder } from "remotion";
import { LinkedInCve } from "./compositions/linkedin/LinkedInCve";
import { HookScene } from "./compositions/linkedin/HookScene";
import { MarketScene } from "./compositions/linkedin/MarketScene";
import { AxiosScene } from "./compositions/linkedin/AxiosScene";
import { EndCard } from "./compositions/linkedin/EndCard";
import { DocsClip, docsClipDefaults, DOCS_W, DOCS_H } from "./compositions/DocsClip";
import { DarioCut, DARIO_CUT_FRAMES } from "./compositions/dario/DarioCut";
import { PolydelveIntro, TOTAL_FRAMES } from "./compositions/PolydelveIntro";
import { RedditClickbait, REDDIT_TOTAL_FRAMES } from "./compositions/RedditClickbait";
import { SecurityHistory, SECURITY_HISTORY_FRAMES } from "./compositions/SecurityHistory";
import { PolydelveOrigin, POLYDELVE_ORIGIN_FRAMES } from "./compositions/PolydelveOrigin";

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
      <Composition
        id="DocsClip"
        component={DocsClip}
        defaultProps={docsClipDefaults}
        calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, Math.round(props.durationSec * 30)) })}
        durationInFrames={150}
        fps={30}
        width={DOCS_W}
        height={DOCS_H}
      />
      <Folder name="LinkedInCve-Scenes">
        <Composition id="LinkedInHook" component={HookScene} durationInFrames={84} fps={30} width={1080} height={1350} />
        <Composition id="LinkedInMarket" component={MarketScene} durationInFrames={138} fps={30} width={1080} height={1350} />
        <Composition id="LinkedInAxios" component={AxiosScene} durationInFrames={84} fps={30} width={1080} height={1350} />
        <Composition id="LinkedInEnd" component={EndCard} durationInFrames={78} fps={30} width={1080} height={1350} />
      </Folder>
    </>
  );
}
