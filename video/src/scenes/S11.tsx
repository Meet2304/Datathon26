import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, HEAD } from "../theme";

const DUR = 600;
const ease = Easing.out(Easing.cubic);

const rev = (f: number, start: number, dist = 24, len = 18): React.CSSProperties => {
  const p = interpolate(f, [start, start + len], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

// Card timings matched to narration (~10.6 frames per word, speech from ~frame 8)
const T1 = 58; // "Planners can target dialysis outreach..."
const T1_EX = 170; // "...like Dantewada, about three hundred kilometres..."
const T1_BURN = 240;
const T2 = 280; // "Health departments can phone-verify..."
const T3 = 395; // "And registries..."
const T3_B1 = 425; // "...stop cutting lists short"
const T3_B2 = 490; // "...check every location against its PIN code"

const CARD_W = 560;
const CARD_GAP = 40;
const CARD_TOP = 205;
const CARD_H = 625;
const cardX = (i: number) => 80 + i * (CARD_W + CARD_GAP);

const Card: React.FC<{
  f: number;
  start: number;
  i: number;
  who: string;
  what: string;
  accent: string;
  children?: React.ReactNode;
}> = ({ f, start, i, who, what, accent, children }) => (
  <div
    style={{
      position: "absolute",
      left: cardX(i),
      top: CARD_TOP,
      width: CARD_W,
      height: CARD_H,
      background: C.panel,
      border: `2px solid ${C.line}`,
      borderTop: `8px solid ${accent}`,
      borderRadius: 22,
      padding: "30px 36px",
      boxSizing: "border-box",
      boxShadow: "0 8px 24px rgba(15,27,45,0.07)",
      ...rev(f, start, 30, 20),
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          background: accent,
          color: "#fff",
          fontFamily: HEAD,
          fontWeight: 600,
          fontSize: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {i + 1}
      </div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 32, color: accent }}>{who}</div>
    </div>
    <div
      style={{
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: 48,
        lineHeight: 1.1,
        color: C.ink,
        marginTop: 20,
      }}
    >
      {what}
    </div>
    {children}
  </div>
);

const Chip: React.FC<{ f: number; start: number; text: string }> = ({ f, start, text }) => (
  <div
    style={{
      width: 340,
      textAlign: "center",
      padding: "8px 0",
      background: C.bg,
      border: `2px solid ${C.line}`,
      borderRadius: 12,
      fontFamily: BODY,
      fontWeight: 600,
      fontSize: 30,
      color: C.ink,
      ...rev(f, start, 12, 14),
    }}
  >
    {text}
  </div>
);

const Down: React.FC<{ f: number; start: number }> = ({ f, start }) => (
  <div
    style={{
      width: 340,
      textAlign: "center",
      fontFamily: BODY,
      fontSize: 30,
      lineHeight: "40px",
      color: C.closeness,
      opacity: interpolate(f, [start, start + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    }}
  >
    ↓
  </div>
);

const Bullet: React.FC<{ f: number; start: number; main: string; count: string }> = ({
  f,
  start,
  main,
  count,
}) => (
  <div style={{ display: "flex", gap: 16, marginTop: 28, ...rev(f, start, 16) }}>
    <div style={{ width: 12, height: 12, borderRadius: 6, background: C.evidence, marginTop: 16, flexShrink: 0 }} />
    <div style={{ fontFamily: BODY, fontSize: 32, fontWeight: 500, color: C.ink, lineHeight: 1.3 }}>
      {main}
      <div style={{ color: C.sub, fontSize: 30, marginTop: 4 }}>{count}</div>
    </div>
  </div>
);

export const S11: React.FC = () => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [0, 10, DUR - 10, DUR], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // return path of the verification loop
  const loopP = interpolate(f, [T2 + 80, T2 + 105], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const loopLen = 60 + 192 + 52;

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade }}>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 56,
          fontFamily: HEAD,
          fontWeight: 600,
          fontSize: 30,
          letterSpacing: 6,
          color: C.teal,
          ...rev(f, 0, 12),
        }}
      >
        IMPACT
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 98,
          fontFamily: HEAD,
          fontWeight: 600,
          fontSize: 62,
          color: C.ink,
          ...rev(f, 8, 16),
        }}
      >
        Proposed policy changes
      </div>

      {/* 1: District planners */}
      <Card
        f={f}
        start={T1}
        i={0}
        who="District planners"
        what="Target outreach where care isn't documented"
        accent={C.closeness}
      >
        <div
          style={{
            marginTop: 26,
            padding: "18px 20px",
            background: "rgba(232,98,44,0.08)",
            borderLeft: `5px solid ${C.closeness}`,
            borderRadius: 10,
            fontFamily: BODY,
            fontSize: 30,
            fontWeight: 500,
            lineHeight: 1.3,
            color: C.ink,
            ...rev(f, T1_EX, 14),
          }}
        >
          Dialysis searched from Dantewada, Chhattisgarh →{" "}
          <b>nearest documented option ≈ 300 km</b> <span style={{ color: C.sub }}>(road estimate)</span>
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: BODY,
            fontSize: 30,
            fontWeight: 500,
            lineHeight: 1.3,
            color: C.sub,
            ...rev(f, T1_BURN, 12),
          }}
        >
          Burn care: only 3 facilities with strong evidence nationwide
        </div>
      </Card>

      {/* 2: Health departments */}
      <Card
        f={f}
        start={T2}
        i={1}
        who="Health departments"
        what="Phone-verify facilities that are often recommended but low-confidence"
        accent={C.teal}
      >
        <div style={{ position: "relative", marginTop: 26, width: 488 }}>
          <Chip f={f} start={T2 + 30} text="Search logs" />
          <Down f={f} start={T2 + 42} />
          <Chip f={f} start={T2 + 48} text="Verification queue" />
          <Down f={f} start={T2 + 60} />
          <Chip f={f} start={T2 + 66} text="Corrected records" />
          <svg
            width={140}
            height={260}
            style={{ position: "absolute", left: 340, top: 0, overflow: "visible" }}
          >
            <defs>
              <marker id="s11loop" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto">
                <path d="M0,0 L12,6 L0,12 z" fill={C.teal} />
              </marker>
            </defs>
            {loopP > 0 ? (
              <path
                d="M6,220 L66,220 L66,28 L14,28"
                fill="none"
                stroke={C.teal}
                strokeWidth={4}
                strokeDasharray={loopLen}
                strokeDashoffset={loopLen * (1 - loopP)}
                markerEnd={loopP > 0.97 ? "url(#s11loop)" : undefined}
              />
            ) : null}
          </svg>
        </div>
      </Card>

      {/* 3: Data registries */}
      <Card f={f} start={T3} i={2} who="Data registries" what="Fix the source" accent={C.evidence}>
        <Bullet f={f} start={T3_B1} main="Stop cutting lists at 50 items" count="2,078 records" />
        <Bullet f={f} start={T3_B2} main="Check every location against its PIN code" count="1,492 records" />
      </Card>

      {/* persistent footer */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 852,
          width: 1760,
          textAlign: "center",
          fontFamily: BODY,
          fontSize: 30,
          fontWeight: 500,
          color: C.sub,
          ...rev(f, 20, 8),
        }}
      >
        <span style={{ color: C.ink, fontWeight: 700 }}>Proposed next steps</span> · a documented gap is not
        proof that no care exists
      </div>
    </AbsoluteFill>
  );
};
