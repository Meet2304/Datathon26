import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, HEAD, SAFE } from "../theme";

// Design length 400 frames. Reveals paced to the S07 narration (VO starts ~frame 8).
const DUR = 400;
const MONO = "SFMono-Regular, Menlo, monospace";
const ease = Easing.out(Easing.cubic);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const prog = (f: number, s: number, d = 18) => interpolate(f, [s, s + d], [0, 1], { ...clamp, easing: ease });
const rise = (f: number, s: number, dist = 24): React.CSSProperties => {
  const p = prog(f, s);
  return { opacity: p, transform: `translateY(${(1 - p) * dist}px)` };
};

const Arrow: React.FC<{ p: number }> = ({ p }) => (
  <div style={{ width: 80, display: "flex", alignItems: "center", flexShrink: 0 }}>
    <div style={{ width: 58 * p, height: 5, background: C.sub, borderRadius: 3 }} />
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

const source: React.CSSProperties = {
  background: C.panel,
  border: `2px solid ${C.line}`,
  borderRadius: 16,
  padding: "14px 20px",
  fontFamily: BODY,
  fontSize: 44,
  fontWeight: 600,
  color: C.ink,
  whiteSpace: "nowrap",
};

const layer = (bg: string, w: number): React.CSSProperties => ({
  width: w,
  height: 210,
  flexShrink: 0,
  borderRadius: 18,
  background: bg,
  color: C.panel,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
});

type Line = { t: string; c?: boolean };
type Step = { label: string; sub: string; at: number; code: Line[] };

const STEPS: Step[] = [
  {
    label: "Dedup",
    sub: "window fn · 11 duplicate IDs",
    at: 196,
    code: [
      { t: "SELECT *" },
      { t: "FROM bronze_facilities" },
      { t: "QUALIFY row_number() OVER (" },
      { t: "  PARTITION BY unique_id" },
      { t: "  ORDER BY unique_id) = 1   -- one row per ID" },
      { t: "-- 10,088 rows → 10,077 facilities", c: true },
    ],
  },
  {
    label: "Parse",
    sub: "JSON strings → array<string>",
    at: 250,
    code: [
      { t: "filter(from_json(procedure, 'array<string>')," },
      { t: "       x -> x IS NOT NULL AND trim(x) <> '')" },
      { t: "" },
      { t: "-- same for equipment, capability, specialties", c: true },
    ],
  },
  {
    label: "Standardize",
    sub: "controlled specialty vocabulary",
    at: 292,
    code: [
      { t: "SELECT f.unique_id, v.specialty" },
      { t: "FROM silver_facilities f" },
      { t: "LATERAL VIEW explode(f.specialties) t AS raw" },
      { t: "JOIN ref_specialty_vocab v" },
      { t: "  ON v.raw_term = lower(trim(t.raw))" },
      { t: "-- free text → one controlled term", c: true },
    ],
  },
  {
    label: "Canonicalize cities",
    sub: "alias table · 1,643 → 1,531",
    at: 338,
    code: [
      { t: "coalesce(a.canonical_city, sp.spelling)" },
      { t: "  AS clean_city" },
      { t: "LEFT JOIN ref_city_alias a" },
      { t: "  ON a.alias_key = r5.k5  -- letters-only key" },
      { t: "-- Bangalore → Bengaluru (466 legacy names)", c: true },
      { t: "-- 1,643 spellings → 1,531 cities", c: true },
    ],
  },
];

export const S07: React.FC = () => {
  const f = useCurrentFrame();
  const fade = Math.min(
    interpolate(f, [0, 10], [0, 1], clamp),
    interpolate(f, [DUR - 10, DUR], [1, 0], clamp),
  );

  const facilities = Math.round(interpolate(f, [STEPS[0].at, STEPS[0].at + 28], [10088, 10077], { ...clamp, easing: ease }));
  const activeIdx = STEPS.reduce((acc, s, i) => (f >= s.at ? i : acc), -1);

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
          EXPLORATION · BRONZE → SILVER MEDALLION
        </div>

        {/* Sources -> bronze -> silver */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            right: SAFE,
            top: 110,
            height: 220,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18, width: 680, flexShrink: 0 }}>
            <div style={{ ...source, ...rise(f, 96) }}>Virtue Foundation records</div>
            <div style={{ ...source, ...rise(f, 140) }}>
              <span style={{ color: C.teal }}>⨝</span> India Post PIN directory
            </div>
          </div>
          <Arrow p={prog(f, 150, 16)} />
          <div style={{ ...layer(C.warn, 320), ...rise(f, 18) }}>
            <div style={{ fontFamily: HEAD, fontSize: 44, fontWeight: 600 }}>Bronze</div>
            <div style={{ fontFamily: BODY, fontSize: 44, fontWeight: 600 }}>10,088 rows</div>
          </div>
          <Arrow p={prog(f, 40, 16)} />
          <div style={{ ...layer(C.sub, 500), ...rise(f, 50) }}>
            <div style={{ fontFamily: HEAD, fontSize: 44, fontWeight: 600 }}>Silver</div>
            <div style={{ fontFamily: BODY, fontSize: 44, fontWeight: 600 }}>
              {facilities.toLocaleString("en-US")} facilities
            </div>
            <div style={{ fontFamily: BODY, fontSize: 32, fontWeight: 500, opacity: 0.9 }}>113 columns</div>
          </div>
        </div>

        {/* Stepper: tabs */}
        <div
          style={{
            position: "absolute",
            left: SAFE,
            top: 380,
            width: 600,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {STEPS.map((s, i) => {
            const active = i === activeIdx;
            const done = i < activeIdx;
            return (
              <div
                key={s.label}
                style={{
                  height: 115,
                  boxSizing: "border-box",
                  background: C.panel,
                  border: `2px solid ${active ? C.teal : C.line}`,
                  borderLeft: `10px solid ${active ? C.teal : done ? C.capability : C.line}`,
                  borderRadius: 14,
                  padding: "12px 22px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  ...rise(f, s.at - 6),
                }}
              >
                <div style={{ fontFamily: BODY, fontSize: 44, fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>
                  <span style={{ color: done ? C.capability : C.teal, marginRight: 14 }}>{done ? "✓" : `${i + 1}`}</span>
                  {s.label}
                </div>
                <div style={{ fontFamily: BODY, fontSize: 28, fontWeight: 500, color: C.sub, whiteSpace: "nowrap" }}>{s.sub}</div>
              </div>
            );
          })}
        </div>

        {/* Stepper: code panel */}
        <div
          style={{
            position: "absolute",
            left: SAFE + 640,
            right: SAFE,
            top: 380,
            height: 520,
            background: C.ink,
            borderRadius: 18,
            overflow: "hidden",
            opacity: prog(f, STEPS[0].at - 10, 14),
          }}
        >
          {STEPS.map((s, i) => {
            const next = STEPS[i + 1];
            const o = prog(f, s.at, 12) * (next ? 1 - prog(f, next.at - 4, 10) : 1);
            return (
              <div
                key={s.label}
                style={{
                  position: "absolute",
                  inset: 0,
                  padding: "34px 40px",
                  opacity: o,
                  transform: `translateY(${(1 - prog(f, s.at, 14)) * 16}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 28,
                    color: C.bg,
                    opacity: 0.6,
                    marginBottom: 20,
                    letterSpacing: 2,
                  }}
                >
                  {`STEP ${i + 1} · ${s.label.toUpperCase()}`}
                </div>
                {s.code.map((l, j) => (
                  <div
                    key={j}
                    style={{
                      fontFamily: MONO,
                      fontSize: 30,
                      lineHeight: "50px",
                      height: 50,
                      whiteSpace: "pre",
                      color: C.bg,
                      opacity: (l.c ? 0.72 : 1) * prog(f, s.at + 3 + j * 3, 10),
                    }}
                  >
                    {l.t}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
