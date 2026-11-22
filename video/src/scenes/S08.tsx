import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, HEAD, SAFE } from "../theme";

// Design length 440 frames. Cards revealed with the S08 narration (VO starts ~frame 8).
const DUR = 440;
const MONO = "SFMono-Regular, Menlo, monospace";
const ease = Easing.out(Easing.cubic);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const prog = (f: number, s: number, d = 18) => interpolate(f, [s, s + d], [0, 1], { ...clamp, easing: ease });
const rise = (f: number, s: number, dist = 24): React.CSSProperties => {
  const p = prog(f, s);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

type Rule = {
  title: string;
  value: number;
  caption: string;
  accent: string;
  at: number;
  code: string[];
  late?: { t: string; at: number };
};

const RULES: Rule[] = [
  {
    title: "Truncation flag",
    value: 2078,
    caption: "records, lists cut at exactly 50",
    accent: C.warn,
    at: 40,
    code: ["coalesce(size(procedure), 0) >= 50", "WHEN truncated THEN 'truncated'  -- unknown"],
  },
  {
    title: "Plausibility",
    value: 112,
    caption: "implausible doctor counts → NULL",
    accent: C.closeness,
    at: 196,
    code: ["CASE WHEN NOT flag_numberDoctors_implausible", "  THEN n_doctors END AS n_doctors"],
  },
  {
    title: "Geo-validation",
    value: 1492,
    caption: "snapped to PIN centroid",
    accent: C.evidence,
    at: 234,
    code: ["IF(far_from_pin, pin.lat, lat) AS lat,", "'approximate' AS location_quality"],
  },
  {
    title: "Negation-aware extraction",
    value: 405759,
    caption: "clauses · 616 negated",
    accent: C.capability,
    at: 330,
    code: ["posexplode(split(c, :split_rx)) AS clause", "lower(clause) rlike '^\\s*(no|not|none)\\b'"],
    late: { t: '-- "no dialysis" ≠ evidence', at: 392 },
  },
];

const Card: React.FC<{ r: Rule; f: number }> = ({ r, f }) => {
  const n = Math.round(interpolate(f, [r.at + 6, r.at + 36], [0, r.value], { ...clamp, easing: ease }));
  const lines = r.late ? [...r.code, r.late.t] : r.code;
  return (
    <div
      style={{
        boxSizing: "border-box",
        height: 330,
        background: C.panel,
        border: `2px solid ${C.line}`,
        borderLeft: `10px solid ${r.accent}`,
        borderRadius: 18,
        padding: "20px 26px",
        display: "flex",
        flexDirection: "column",
        ...rise(f, r.at),
      }}
    >
      <div style={{ fontFamily: BODY, fontSize: 44, fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>{r.title}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 4, whiteSpace: "nowrap" }}>
        <div style={{ fontFamily: HEAD, fontSize: 52, fontWeight: 600, color: r.accent }}>{n.toLocaleString("en-US")}</div>
        <div style={{ fontFamily: BODY, fontSize: 30, fontWeight: 500, color: C.sub }}>{r.caption}</div>
      </div>
      <div
        style={{
          marginTop: "auto",
          background: C.ink,
          borderRadius: 12,
          padding: "12px 20px",
        }}
      >
        {lines.map((l, j) => {
          const isLate = r.late && j === lines.length - 1;
          const o = isLate ? prog(f, r.late!.at, 12) : prog(f, r.at + 10 + j * 5, 12);
          return (
            <div
              key={j}
              style={{
                fontFamily: MONO,
                fontSize: 28,
                lineHeight: "40px",
                whiteSpace: "pre",
                color: C.bg,
                opacity: (isLate ? 1 : 0.95) * o,
                fontWeight: isLate ? 700 : 400,
              }}
            >
              {l}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const S08: React.FC = () => {
  const f = useCurrentFrame();
  const fade = Math.min(
    interpolate(f, [0, 10], [0, 1], clamp),
    interpolate(f, [DUR - 10, DUR], [1, 0], clamp),
  );

  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ opacity: fade }}>
        <div
          style={{
            position: "absolute",
            left: SAFE,
            top: 46,
            fontFamily: HEAD,
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: 6,
            color: C.teal,
            ...rise(f, 4),
          }}
        >
          DATA QUALITY · PROFILING-DRIVEN RULES
        </div>

        <div
          style={{
            position: "absolute",
            left: SAFE,
            right: SAFE,
            top: 116,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 22,
          }}
        >
          {RULES.map((r) => (
            <Card key={r.title} r={r} f={f} />
          ))}
        </div>

        {/* Footer chip */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            right: SAFE,
            top: 820,
            display: "flex",
            justifyContent: "center",
            ...rise(f, 166),
          }}
        >
          <div
            style={{
              padding: "8px 40px",
              borderRadius: 999,
              background: C.panel,
              border: `3px solid ${C.teal}`,
              fontFamily: BODY,
              fontSize: 44,
              fontWeight: 700,
              color: C.teal,
              whiteSpace: "nowrap",
            }}
          >
            Unknown ≠ not offered
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
