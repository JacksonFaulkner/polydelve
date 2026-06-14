import { Composition } from "remotion";
import { PolydelveIntro, TOTAL_FRAMES } from "./compositions/PolydelveIntro";

export function RemotionRoot() {
  return (
    <Composition
      id="PolydelveIntro"
      component={PolydelveIntro}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1280}
      height={720}
    />
  );
}
