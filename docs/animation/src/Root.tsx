import { Composition } from "remotion";
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
    </>
  );
}
