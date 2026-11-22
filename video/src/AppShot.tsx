import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BODY, C } from "./theme";

// A real app screenshot (1920x1080) shown in a framed window with a slow focus zoom and an optional highlight box.
export type Shot = {
  src: string; // file in public/app
  from: number; // local frame the shot appears
  to: number; // local frame it is gone
  focus?: [number, number]; // px in the 1920x1080 screenshot to zoom toward
  zoom?: [number, number]; // start/end zoom
  box?: { x: number; y: number; w: number; h: number; at: number; label?: string };
};

const ease = Easing.bezier(0.33, 0, 0.2, 1);

export const ShotLayer: React.FC<{ shot: Shot }> = ({ shot }) => {
  const f = useCurrentFrame();
  const { from, to } = shot;
  const op = interpolate(f, [from, from + 10, to - 10, to], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (f < from - 1 || f > to + 1) return null;
  const [z0, z1] = shot.zoom ?? [1, 1.04];
  const z = interpolate(f, [from, to], [z0, z1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const [fx, fy] = shot.focus ?? [960, 540];
  const b = shot.box;
  const bop = b ? interpolate(f, [b.at, b.at + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  return (
    <AbsoluteFill style={{ opacity: op }}>
      <AbsoluteFill style={{ transformOrigin: `${fx}px ${fy}px`, scale: String(z) }}>
        <Img src={staticFile("app/" + shot.src)} style={{ width: 1920, height: 1080 }} />
        {b ? (
          <div
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              borderRadius: 14,
              border: `4px solid ${C.teal}`,
              boxShadow: `0 0 0 9999px rgba(15,27,45,${0.28 * bop})`,
              opacity: bop,
            }}
          >
            {b.label ? (
              <div
                style={{
                  position: "absolute",
                  top: -58,
                  left: -4,
                  background: C.teal,
                  color: "white",
                  fontFamily: BODY,
                  fontWeight: 600,
                  fontSize: 30,
                  padding: "6px 16px",
                  borderRadius: 10,
                  whiteSpace: "nowrap",
                }}
              >
                {b.label}
              </div>
            ) : null}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const AppScene: React.FC<{ shots: Shot[]; children?: React.ReactNode }> = ({ shots, children }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    {shots.map((s, i) => (
      <ShotLayer key={i} shot={s} />
    ))}
    {children}
  </AbsoluteFill>
);

export const Tag: React.FC<{ text: string; at: number; x?: number; y?: number; until?: number }> = ({ text, at, x = 80, y = 80, until = 99999 }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [at, at + 10, until - 10, until], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: op,
        translate: `0px ${interpolate(f, [at, at + 12], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
        background: C.ink,
        color: "white",
        fontFamily: BODY,
        fontWeight: 600,
        fontSize: 34,
        padding: "12px 24px",
        borderRadius: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
      }}
    >
      {text}
    </div>
  );
};
