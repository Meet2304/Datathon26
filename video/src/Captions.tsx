import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, FPS } from "./theme";

// Splits a narration line into short phrases and times them by character count across the clip duration.
export const phrases = (text: string): string[] => {
  const parts = text.split(/(?<=[.,:?])\s+/);
  const out: string[] = [];
  for (const p of parts) {
    const words = p.split(" ");
    if (words.length <= 9) out.push(p);
    else {
      const mid = Math.ceil(words.length / 2);
      out.push(words.slice(0, mid).join(" "), words.slice(mid).join(" "));
    }
  }
  return out;
};

export const timedPhrases = (text: string, startFrame: number, durSec: number) => {
  const ps = phrases(text);
  const total = ps.reduce((a, p) => a + p.length, 0);
  let t = startFrame;
  const frames = durSec * FPS;
  return ps.map((p) => {
    const len = (p.length / total) * frames;
    const r = { text: p, from: Math.round(t), to: Math.round(t + len) };
    t += len;
    return r;
  });
};

export const CaptionTrack: React.FC<{ items: { text: string; from: number; to: number }[] }> = ({ items }) => {
  const f = useCurrentFrame();
  const cur = items.find((c) => f >= c.from && f < c.to + 4);
  if (!cur) return null;
  const op = interpolate(f, [cur.from, cur.from + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 44, pointerEvents: "none" }}>
      <div
        style={{
          opacity: op,
          maxWidth: 1500,
          textAlign: "center",
          fontFamily: BODY,
          fontWeight: 500,
          fontSize: 40,
          lineHeight: 1.25,
          color: "white",
          background: "rgba(20,27,38,0.88)",
          padding: "12px 28px",
          borderRadius: 14,
        }}
      >
        {cur.text}
      </div>
      <div style={{ display: "none", color: C.ink }} />
    </AbsoluteFill>
  );
};
