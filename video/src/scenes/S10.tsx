import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, HEAD } from "../theme";

const DUR = 270;
const ease = Easing.out(Easing.cubic);

const rev = (f: number, start: number, dist = 24, len = 18): React.CSSProperties => {
  const p = interpolate(f, [start, start + len], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

const Stat: React.FC<{ f: number; start: number; value: string; label: string }> = ({
  f,
  start,
  value,
  label,
}) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", ...rev(f, start) }}>
    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 64, color: C.teal, lineHeight: 1.1 }}>
      {value}
    </div>
    <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 34, color: C.ink, marginTop: 10 }}>
      {label}
    </div>
  </div>
);

const Step: React.FC<{ f: number; start: number; text: string; mono?: boolean }> = ({
  f,
  start,
  text,
  mono,
}) => (
  <div
    style={{
      background: C.panel,
      border: `2px solid ${C.line}`,
      borderRadius: 14,
      padding: "18px 28px",
      fontFamily: BODY,
      fontWeight: 600,
      fontSize: 32,
      color: C.ink,
      whiteSpace: "nowrap",
      ...rev(f, start, 16),
    }}
  >
    {mono ? <span>{text}</span> : text}
  </div>
);

const Arrow: React.FC<{ f: number; start: number }> = ({ f, start }) => (
  <div
    style={{
      fontFamily: BODY,
      fontSize: 40,
      fontWeight: 600,
      color: C.teal,
      margin: "0 18px",
      opacity: interpolate(f, [start, start + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    }}
  >
    →
  </div>
);

export const S10: React.FC = () => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [0, 10, DUR - 10, DUR], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade }}>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 80,
          fontFamily: HEAD,
          fontWeight: 600,
          fontSize: 60,
          color: C.ink,
          ...rev(f, 0, 16),
        }}
      >
        Testing the decision process
      </div>

      {/* validation card */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 200,
          width: 1760,
          background: C.panel,
          border: `2px solid ${C.line}`,
          borderRadius: 24,
          padding: "40px 48px 34px",
          boxSizing: "border-box",
          boxShadow: "0 8px 24px rgba(15,27,45,0.06)",
          ...rev(f, 10, 20),
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <Stat f={f} start={18} value="83" label="searches" />
          <Stat f={f} start={40} value="3" label="baselines" />
          <Stat f={f} start={66} value="1,422" label="blind judge packets" />
        </div>
        <div
          style={{
            marginTop: 30,
            paddingTop: 22,
            borderTop: `2px solid ${C.line}`,
            textAlign: "center",
            fontFamily: BODY,
            fontSize: 30,
            fontWeight: 500,
            color: C.sub,
            ...rev(f, 50, 10),
          }}
        >
          Baselines: Nearest keyword match · Mention count · Biggest nearby hospital
        </div>
      </div>

      {/* grading flow */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 560,
          width: 1760,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Step f={f} start={92} text="AI Functions / ai_query" />
        <Arrow f={f} start={104} />
        <Step f={f} start={110} text="blind record grading" />
        <Arrow f={f} start={122} />
        <Step f={f} start={128} text="evaluation files in Unity Catalog Volumes" />
      </div>

      {/* emphasis */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 710,
          width: 1760,
          textAlign: "center",
          fontFamily: HEAD,
          fontWeight: 600,
          fontSize: 54,
          color: C.ink,
          ...rev(f, 165, 18),
        }}
      >
        LLMs evaluate records. <span style={{ color: C.teal }}>Rules rank facilities.</span>
      </div>

      {/* badge */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 820,
          width: 1920,
          display: "flex",
          justifyContent: "center",
          ...rev(f, 205, 12),
        }}
      >
        <div
          style={{
            border: `2px solid ${C.warn}`,
            color: C.warn,
            background: "rgba(194,65,12,0.06)",
            borderRadius: 999,
            padding: "10px 30px",
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: 30,
          }}
        >
          LLM-graded evaluation · Human validation pending
        </div>
      </div>
    </AbsoluteFill>
  );
};
