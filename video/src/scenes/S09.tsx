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

const prog = (f: number, start: number, len: number) =>
  interpolate(f, [start, start + len], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

const Box: React.FC<{
  f: number;
  start: number;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  accent?: string;
}> = ({ f, start, x, y, w, h, title, sub, accent = C.teal }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      background: C.panel,
      border: `2px solid ${C.line}`,
      borderLeft: `8px solid ${accent}`,
      borderRadius: 18,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      padding: "0 32px",
      boxSizing: "border-box",
      boxShadow: "0 6px 18px rgba(15,27,45,0.06)",
      ...rev(f, start),
    }}
  >
    <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 48, color: C.ink, lineHeight: 1.1 }}>
      {title}
    </div>
    {sub ? (
      <div style={{ fontFamily: BODY, fontWeight: 500, fontSize: 32, color: C.sub, marginTop: 8 }}>
        {sub}
      </div>
    ) : null}
  </div>
);

const LaneTag: React.FC<{ f: number; start: number; x: number; y: number; text: string }> = ({
  f,
  start,
  x,
  y,
  text,
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      fontFamily: HEAD,
      fontWeight: 600,
      fontSize: 30,
      letterSpacing: 4,
      color: C.teal,
      ...rev(f, start, 12),
    }}
  >
    {text}
  </div>
);

// Layout
const L = 80;
const GAP = 130;
const BW = 500;
const BH = 150;
const R1 = 230; // build row top
const R2 = 530; // serve row top
const col = (i: number) => L + i * (BW + GAP);
const SQLW = 440;
const APPX = L + SQLW + 260;
const APPW = 1840 - APPX;

export const S09: React.FC = () => {
  const f = useCurrentFrame();
  const fade = interpolate(f, [0, 10, DUR - 10, DUR], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Arrow progress
  const a1 = prog(f, 40, 14);
  const a2 = prog(f, 75, 14);
  const elbow = prog(f, 118, 26);
  const a3 = prog(f, 178, 16);

  const ey = (R1 + BH + R2) / 2; // elbow horizontal y
  const deltaCx = col(2) + BW / 2;
  const sqlCx = L + SQLW / 2;
  const elbowLen = R2 - (R1 + BH) + (deltaCx - sqlCx);
  const arrowY2 = R2 + BH / 2;

  return (
    <AbsoluteFill style={{ background: C.bg, opacity: fade }}>
      <div
        style={{
          position: "absolute",
          left: L,
          top: 80,
          fontFamily: HEAD,
          fontWeight: 600,
          fontSize: 60,
          color: C.ink,
          ...rev(f, 0, 16),
        }}
      >
        Built on Databricks
      </div>

      <LaneTag f={f} start={12} x={L} y={R1 - 48} text="BUILD" />
      <LaneTag f={f} start={130} x={L} y={R2 - 48} text="SERVE" />

      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          <marker id="s09arrow" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto">
            <path d="M0,0 L12,6 L0,12 z" fill={C.teal} />
          </marker>
        </defs>
        {/* build lane arrows */}
        {[a1, a2].map((p, i) => {
          const x1 = col(i) + BW + 10;
          const x2 = col(i + 1) - 14;
          const y = R1 + BH / 2;
          return p > 0 ? (
            <line
              key={i}
              x1={x1}
              y1={y}
              x2={x1 + (x2 - x1) * p}
              y2={y}
              stroke={C.teal}
              strokeWidth={5}
              markerEnd={p > 0.95 ? "url(#s09arrow)" : undefined}
            />
          ) : null;
        })}
        {/* elbow: Delta tables -> SQL warehouse */}
        {elbow > 0 ? (
          <path
            d={`M${deltaCx},${R1 + BH + 8} L${deltaCx},${ey} L${sqlCx},${ey} L${sqlCx},${R2 - 14}`}
            fill="none"
            stroke={C.teal}
            strokeWidth={5}
            strokeDasharray={elbowLen}
            strokeDashoffset={elbowLen * (1 - elbow)}
            markerEnd={elbow > 0.97 ? "url(#s09arrow)" : undefined}
          />
        ) : null}
        {/* serve lane arrow into app */}
        {a3 > 0 ? (
          <line
            x1={L + SQLW + 10}
            y1={arrowY2}
            x2={L + SQLW + 10 + (APPX - 14 - (L + SQLW + 10)) * a3}
            y2={arrowY2}
            stroke={C.teal}
            strokeWidth={5}
            markerEnd={a3 > 0.95 ? "url(#s09arrow)" : undefined}
          />
        ) : null}
      </svg>

      {/* BUILD lane */}
      <Box f={f} start={18} x={col(0)} y={R1} w={BW} h={BH} title="Notebooks" sub="Spark SQL / PySpark" />
      <Box f={f} start={52} x={col(1)} y={R1} w={BW} h={BH} title="Serverless Jobs" />
      <Box f={f} start={88} x={col(2)} y={R1} w={BW} h={BH} title="Delta tables" sub="in Unity Catalog" />

      {/* SERVE lane */}
      <Box f={f} start={145} x={L} y={R2} w={SQLW} h={BH} title="SQL warehouse" accent={C.evidence} />
      <Box
        f={f}
        start={198}
        x={APPX}
        y={R2}
        w={APPW}
        h={BH}
        title="FastAPI + React"
        sub="on Databricks Apps"
        accent={C.evidence}
      />

      {/* capability labels */}
      <div
        style={{
          position: "absolute",
          left: L,
          top: R2 + BH + 16,
          width: SQLW,
          fontFamily: BODY,
          fontSize: 30,
          fontWeight: 500,
          color: C.sub,
          lineHeight: 1.3,
          ...rev(f, 160, 12),
        }}
      >
        SQL table function
        <br />
        <span style={{ fontFamily: "Menlo, Consolas, monospace", color: C.ink }}>find_care_sql</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: L + SQLW,
          top: arrowY2 + 22,
          width: APPX - (L + SQLW),
          textAlign: "center",
          fontFamily: BODY,
          fontSize: 30,
          fontWeight: 500,
          color: C.sub,
          lineHeight: 1.3,
          ...rev(f, 184, 12),
        }}
      >
        Databricks SDK /
        <br />
        SQL Connector
      </div>

      {/* takeaway line */}
      <div
        style={{
          position: "absolute",
          left: L,
          width: 1760,
          top: 800,
          textAlign: "center",
          fontFamily: BODY,
          fontWeight: 600,
          fontSize: 48,
          color: C.ink,
          ...rev(f, 228, 16),
        }}
      >
        Build once → search prepared data{" "}
        <span style={{ color: C.sub, fontWeight: 500 }}>(in app memory, 10–100 ms per search)</span>
      </div>
    </AbsoluteFill>
  );
};
