import { AbsoluteFill, Img, staticFile } from "remotion";

const BG = "#15191D";

export interface AvatarProps {
  /** background fill behind the mark */
  bg: string;
  /** invert the logo to white (true) or leave dark (false) */
  invert: boolean;
}

// Same look as the app navbar top-left: white (inverted) cube on the dark brand bg.
export const avatarDefaultProps: AvatarProps = {
  bg: BG,
  invert: true,
};

// 400x400 square. X crops avatars to a circle, so keep the mark centered
// with generous padding so nothing clips at the edges.
export const Avatar: React.FC<AvatarProps> = ({ bg, invert }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Img
        src={staticFile("logo.png")}
        style={{
          width: 310,
          height: 310,
          objectFit: "contain",
          filter: invert ? "invert(1)" : "none",
        }}
      />
    </AbsoluteFill>
  );
};
