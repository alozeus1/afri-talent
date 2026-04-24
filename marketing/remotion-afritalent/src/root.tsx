import { Composition } from "remotion";
import { AfriTalentLaunch } from "./AfriTalentLaunch";

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="AfriTalentLaunch"
        component={AfriTalentLaunch}
        durationInFrames={1350}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
    </>
  );
};
