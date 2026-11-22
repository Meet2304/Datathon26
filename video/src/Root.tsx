import { Composition } from "remotion";
import { Apollo } from "./Apollo";
import { TOTAL, FPS, W, H } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition id="Apollo" component={Apollo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
  );
};
