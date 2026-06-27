import { Still } from "remotion";
import { TwitterBanner, bannerDefaultProps } from "./TwitterBanner";
import { Avatar, avatarDefaultProps } from "./Avatar";

export function RemotionRoot() {
  return (
    <>
      {/* X / Twitter header image is 1500x500 (3:1). */}
      <Still
        id="TwitterBanner"
        component={TwitterBanner}
        width={1500}
        height={500}
        defaultProps={bannerDefaultProps}
      />
      {/* Profile picture — square, X crops to a circle. */}
      <Still
        id="Avatar"
        component={Avatar}
        width={400}
        height={400}
        defaultProps={avatarDefaultProps}
      />
    </>
  );
}
