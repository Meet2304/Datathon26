// Writes out/apollo-final.srt with the same timing rules as src/theme.ts + src/Captions.tsx.
import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("public/audio/durations.json", "utf8"));
const N = Object.fromEntries(
  fs.readFileSync("NARRATION.md", "utf8").split("\n").filter((l) => /^\| S\d/.test(l)).map((l) => { const p = l.split("|"); return [p[1].trim(), p[3].trim()]; }),
);
const ids = Object.keys(N);
const speech = ids.reduce((a, id) => a + d[id], 0);
const MIN = { S07: 330, S08: 360 };
const slotAt = (id, r) => id === "S12" ? Math.ceil((d[id] / r) * 30) + 8 + 66 : Math.max(MIN[id] ?? 0, Math.ceil((d[id] / r) * 30) + 14);
let R = 1; while (ids.reduce((a, id) => a + slotAt(id, R), 0) > 3585) R = Math.round((R + 0.01) * 100) / 100;
const ts = (f) => { const ms = Math.round((f / 30) * 1000); const p = (n, w = 2) => String(n).padStart(w, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
let a = 0, i = 1, out = "";
for (const id of ids) {
  const slot = slotAt(id, R);
  const dur = (d[id] / R) * 30;
  const parts = [];
  for (const p of N[id].split(/(?<=[.,:?])\s+/)) { const w = p.split(" "); if (w.length <= 9) parts.push(p); else { const m = Math.ceil(w.length / 2); parts.push(w.slice(0, m).join(" "), w.slice(m).join(" ")); } }
  const tot = parts.reduce((s, p) => s + p.length, 0);
  let t = a + 8;
  for (const p of parts) { const len = (p.length / tot) * dur; out += `${i++}\n${ts(t)} --> ${ts(t + len)}\n${p}\n\n`; t += len; }
  a += slot;
}
fs.mkdirSync("out", { recursive: true });
fs.writeFileSync("out/apollo-final.srt", out);
console.log("rate", R, "cues", i - 1, "total s", (a / 30).toFixed(2));
