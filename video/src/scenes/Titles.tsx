import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, HEAD } from "../theme";
import { ShotLayer } from "../AppShot";

const cl = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

const Pin: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size * 1.3} viewBox="0 0 40 52">
    <path d="M20 2C10 2 2 10 2 20c0 13 18 30 18 30s18-17 18-30C38 10 30 2 20 2z" fill={C.teal} />
    <circle cx="20" cy="20" r="7" fill="white" />
  </svg>
);

const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.25 }}>
    <svg width={size * 0.9} height={size * 0.9} viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </svg>
    <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: size, color: C.teal, letterSpacing: -1 }}>Apollo</div>
  </div>
);

export const S01: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36, marginTop: -90 }}>
        <div style={{ opacity: interpolate(f, [0, 18], [0, 1], cl), translate: `0px ${interpolate(f, [0, 24], [20, 0], { ...cl, easing: ease })}px` }}>
          <Wordmark size={120} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 40, opacity: interpolate(f, [20, 38], [0, 1], cl) }}>
          <Pin size={64} />
          <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 60, color: C.ink }}>Nearby care. Clear evidence.</div>
        </div>
        <div
          style={{
            opacity: interpolate(f, [55, 70], [0, 1], cl),
            fontFamily: BODY,
            fontSize: 34,
            color: C.sub,
            border: `2px solid ${C.line}`,
            borderRadius: 999,
            padding: "10px 28px",
            background: "white",
          }}
        >
          Example search · Dialysis · PIN 492001, Raipur, India
        </div>
      </div>
      <AbsoluteFill style={{ background: C.bg, opacity: interpolate(f, [168, 180], [0, 1], cl) }} />
    </AbsoluteFill>
  );
};

export const S12: React.FC<{ hasResults: boolean }> = ({ hasResults }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {hasResults ? <ShotLayer shot={{ src: "06_results.png", from: -10, to: 60, focus: [1915, 380], zoom: [1.6, 1.65] }} /> : null}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: interpolate(f, [45, 62], [0, 1], cl),
          background: C.bg,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30, marginTop: -80 }}>
          <Wordmark size={130} />
          <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 56, color: C.ink }}>Find nearby care. Understand why.</div>
          <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 48, color: C.closeness }}>Call to confirm.</div>
          <div style={{ fontFamily: BODY, fontSize: 28, color: C.sub, marginTop: 10 }}>
            find-the-right-care-redesign-7474644416958437.aws.databricksapps.com
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
