import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, HEAD, SAFE, W } from "../theme";

const DUR = 330;
const ease = Easing.out(Easing.cubic);
const prog = (f: number, s: number, d = 18) =>
  interpolate(f, [s, s + d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
const rise = (f: number, s: number, dist = 24): React.CSSProperties => {
  const p = prog(f, s);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

const STEPS = [
  { label: "Resolve location", at: 14 },
  { label: "Check eligibility", at: 44 },
  { label: "Score", at: 78 },
  { label: "Explain", at: 104 },
];

const BAR_W = W - SAFE * 2;
const SEGS = [
  { pct: 30, name: "Evidence", color: C.evidence, at: 150 },
  { pct: 10, name: "Capability", color: C.capability, at: 166 },
  { pct: 60, name: "Closeness", color: C.closeness, at: 182 },
];

export const S06: React.FC = () => {
  const f = useCurrentFrame();
  const fade = Math.min(
    interpolate(f, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(f, [DUR - 10, DUR], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );

  const term = (txt: string, color: string) => <span style={{ color, fontWeight: 700 }}>{txt}</span>;

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ opacity: fade }}>
        <div
          style={{
            position: "absolute",
            left: SAFE,
            top: 64,
            fontFamily: HEAD,
            fontSize: 52,
            fontWeight: 600,
            color: C.ink,
            ...rise(f, 2),
          }}
        >
          How the recommendation is calculated
        </div>

        {/* Steps */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            right: SAFE,
            top: 175,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {STEPS.map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && (
                <div
                  style={{
                    fontFamily: BODY,
                    fontSize: 40,
                    color: C.sub,
                    opacity: prog(f, s.at - 6, 10),
                  }}
                >
                  →
                </div>
              )}
              <div
                style={{
                  width: 370,
                  height: 110,
                  borderRadius: 16,
                  background: C.panel,
                  border: `2px solid ${C.line}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "0 24px",
                  boxSizing: "border-box",
                  ...rise(f, s.at),
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    background: C.teal,
                    color: C.panel,
                    fontFamily: BODY,
                    fontSize: 26,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ fontFamily: BODY, fontSize: 34, fontWeight: 700, color: C.ink }}>{s.label}</div>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Weight bar */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            top: 340,
            fontFamily: BODY,
            fontSize: 36,
            fontWeight: 700,
            color: C.ink,
            ...rise(f, 138),
          }}
        >
          Dialysis weights: 30 / 10 / 60
        </div>
        <div
          style={{
            position: "absolute",
            left: SAFE,
            top: 400,
            width: BAR_W,
            height: 90,
            borderRadius: 14,
            overflow: "hidden",
            display: "flex",
            background: "rgba(15,27,45,0.06)",
            opacity: prog(f, 140, 10),
          }}
        >
          {SEGS.map((s) => {
            const p = prog(f, s.at, 22);
            return (
              <div
                key={s.name}
                style={{
                  width: (BAR_W * s.pct * p) / 100,
                  height: "100%",
                  background: s.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: BODY,
                  fontSize: 34,
                  fontWeight: 700,
                  color: "#FFFFFF",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ opacity: prog(f, s.at + 14, 10) }}>{s.pct}%</span>
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: SAFE, top: 506, width: BAR_W, height: 44 }}>
          {SEGS.map((s, i) => {
            const left = (BAR_W * SEGS.slice(0, i).reduce((a, b) => a + b.pct, 0)) / 100;
            return (
              <div
                key={s.name}
                style={{
                  position: "absolute",
                  left: i === 1 ? left - 20 : left,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: BODY,
                  fontSize: 30,
                  fontWeight: 600,
                  color: C.ink,
                  opacity: prog(f, s.at + 10, 12),
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 9, background: s.color }} />
                {s.name}
              </div>
            );
          })}
        </div>

        {/* Worked example */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            right: SAFE,
            top: 600,
            background: C.panel,
            border: `2px solid ${C.line}`,
            borderRadius: 20,
            padding: "26px 40px",
            ...rise(f, 222),
          }}
        >
          <div style={{ fontFamily: BODY, fontSize: 32, fontWeight: 600, color: C.sub }}>Hospitales CARE, Raipur</div>
          <div style={{ fontFamily: BODY, fontSize: 54, fontWeight: 500, color: C.ink, marginTop: 12 }}>
            {term("0.30 × 90", C.evidence)} + {term("0.10 × 88", C.capability)} + {term("0.60 × 84", C.closeness)}{" "}
            <span style={{ opacity: prog(f, 246, 14) }}>
              = <span style={{ fontWeight: 800 }}>86.2</span>
            </span>
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: SAFE,
            top: 836,
            fontFamily: BODY,
            fontSize: 30,
            fontWeight: 500,
            color: C.sub,
            ...rise(f, 266),
          }}
        >
          Distance is estimated: road ≈ 1.4 × straight-line distance
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
