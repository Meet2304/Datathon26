import React from "react";
import { AbsoluteFill, Freeze, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { SCENES, C, DESIGN, VO_OFFSET, VO_RATE } from "./theme";
import { CaptionTrack, timedPhrases } from "./Captions";
import { NARRATION } from "./narration";
import { S01, S12 } from "./scenes/Titles";
import { S02, S03, S04 } from "./scenes/AppScenes";
import { S05 } from "./scenes/S05";
import { S06 } from "./scenes/S06";
import { S07 } from "./scenes/S07";
import { S08 } from "./scenes/S08";
import { S09 } from "./scenes/S09";
import { S10 } from "./scenes/S10";
import { S11 } from "./scenes/S11";
import durations from "../public/audio/durations.json";

const DUR = durations as Record<string, number | object>;
export const clipSec = (id: string, fallbackWords: number) => {
  const d = DUR[id];
  return (typeof d === "number" ? d : fallbackWords / 2.5) / VO_RATE;
};

const COMPONENTS: Record<string, React.FC> = {
  S01,
  S02,
  S03,
  S04,
  S05,
  S06,
  S07,
  S08,
  S09,
  S10,
  S11,
  S12: () => <S12 hasResults />,
};

export const captionItems = () =>
  SCENES.flatMap((s) =>
    timedPhrases(NARRATION[s.id], s.from + VO_OFFSET, clipSec(s.id, NARRATION[s.id].split(" ").length)),
  );

// Holds the scene's last designed frame when its slot is longer; fades every slot in/out.
const Fit: React.FC<{ design: number; slot: number; children: React.ReactNode }> = ({ design, slot, children }) => {
  const f = useCurrentFrame();
  const hold = design - 12;
  const op = interpolate(f, [0, 6, slot - 8, slot], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <Freeze frame={hold} active={slot > design && f >= hold}>
        {children}
      </Freeze>
    </AbsoluteFill>
  );
};

export const Apollo: React.FC = () => {
  const caps = captionItems();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {SCENES.map((s) => {
        const Comp = COMPONENTS[s.id];
        return (
          <Sequence key={s.id} name={s.id} from={s.from} durationInFrames={s.to - s.from}>
            <Fit design={DESIGN[s.id]} slot={s.to - s.from}>
              <Comp />
            </Fit>
          </Sequence>
        );
      })}
      {SCENES.map((s) => (
        <Sequence key={"vo" + s.id} name={"VO " + s.id} from={s.from + VO_OFFSET} durationInFrames={s.to - s.from - VO_OFFSET}>
          <Audio src={staticFile(`audio/${s.id}.mp3`)} playbackRate={VO_RATE} />
        </Sequence>
      ))}
      <CaptionTrack items={caps} />
    </AbsoluteFill>
  );
};
