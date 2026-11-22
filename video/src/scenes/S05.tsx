import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, HEAD, SAFE } from "../theme";

const DUR = 300;
const ease = Easing.out(Easing.cubic);
const prog = (f: number, s: number, d = 18) =>
  interpolate(f, [s, s + d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
const rise = (f: number, s: number, dist = 24): React.CSSProperties => {
  const p = prog(f, s);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

const Arrow: React.FC<{ p: number; w?: number }> = ({ p, w = 80 }) => (
  <div style={{ width: w + 20, display: "flex", alignItems: "center" }}>
    <div style={{ width: w * p, height: 5, background: C.sub, borderRadius: 3 }} />
    <div
      style={{
        width: 0,
        height: 0,
        borderTop: "12px solid transparent",
        borderBottom: "12px solid transparent",
        borderLeft: `18px solid ${C.sub}`,
        opacity: p,
      }}
    />
  </div>
);

const Check: React.FC<{ color: string; size?: number }> = ({ color, size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M4 12.5l5 5L20 6.5" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const chip: React.CSSProperties = {
  background: C.panel,
  border: `2px solid ${C.line}`,
  borderRadius: 14,
  padding: "14px 24px",
  fontFamily: BODY,
  fontSize: 34,
  fontWeight: 600,
  color: C.ink,
};

const ResultCard: React.FC<{ label: string; style: React.CSSProperties }> = ({ label, style }) => (
  <div
    style={{
      width: 640,
      background: C.panel,
      border: `2px solid ${C.line}`,
      borderRadius: 18,
      padding: "24px 32px",
      boxShadow: "0 6px 20px rgba(15,27,45,0.06)",
      ...style,
    }}
  >
    <div style={{ fontFamily: BODY, fontSize: 30, fontWeight: 600, color: C.sub, letterSpacing: 1 }}>{label}</div>
    <div style={{ fontFamily: BODY, fontSize: 36, fontWeight: 700, color: C.ink, marginTop: 10 }}>
      #1 Hospitales CARE, Raipur
    </div>
    <div style={{ fontFamily: BODY, fontSize: 34, fontWeight: 600, color: C.teal, marginTop: 6 }}>score 86</div>
  </div>
);

export const S05: React.FC = () => {
  const f = useCurrentFrame();
  const fade = Math.min(
    interpolate(f, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(f, [DUR - 10, DUR], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ opacity: fade }}>
        {/* Eyebrow */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            top: 70,
            fontFamily: HEAD,
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: 6,
            color: C.teal,
            ...rise(f, 4),
          }}
        >
          MODELING
        </div>

        {/* Row 1: inputs -> pipeline -> output */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            right: SAFE,
            top: 140,
            height: 270,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ ...chip, ...rise(f, 12) }}>Dialysis</div>
            <div style={{ ...chip, ...rise(f, 20) }}>PIN 492001</div>
            <div style={{ ...chip, ...rise(f, 28) }}>Fixed data + fixed rules</div>
          </div>
          <Arrow p={prog(f, 42, 16)} />
          <div
            style={{
              width: 440,
              height: 170,
              borderRadius: 20,
              background: C.ink,
              color: C.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontFamily: HEAD,
              fontSize: 40,
              fontWeight: 600,
              lineHeight: 1.25,
              ...rise(f, 52),
            }}
          >
            Deterministic
            <br />
            pipeline
          </div>
          <Arrow p={prog(f, 78, 16)} />
          <div
            style={{
              width: 520,
              height: 170,
              borderRadius: 20,
              background: C.panel,
              border: `3px solid ${C.teal}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: BODY,
              fontSize: 48,
              fontWeight: 700,
              color: C.ink,
              ...rise(f, 88),
            }}
          >
            Ranking + evidence
          </div>
        </div>

        {/* Row 2: Run 1 / Run 2 identical */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            right: SAFE,
            top: 450,
            display: "flex",
            alignItems: "center",
            gap: 40,
          }}
        >
          <ResultCard label="RUN 1" style={rise(f, 140)} />
          <ResultCard label="RUN 2" style={rise(f, 165)} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "18px 30px",
              borderRadius: 999,
              background: "rgba(14,124,123,0.12)",
              fontFamily: BODY,
              fontSize: 40,
              fontWeight: 700,
              color: C.teal,
              ...rise(f, 195),
            }}
          >
            <Check color={C.teal} />
            Identical
          </div>
        </div>

        {/* Bottom line */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            right: SAFE,
            top: 710,
            textAlign: "center",
            fontFamily: HEAD,
            fontSize: 54,
            fontWeight: 600,
            color: C.ink,
            ...rise(f, 232),
          }}
        >
          Reproducible · Traceable · Auditable
        </div>
        <div
          style={{
            position: "absolute",
            left: SAFE,
            right: SAFE,
            top: 808,
            textAlign: "center",
            fontFamily: BODY,
            fontSize: 30,
            fontWeight: 500,
            color: C.sub,
            ...rise(f, 250),
          }}
        >
          Record evidence ≠ current service availability
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
