// Shared design tokens for every Apollo scene. 1920x1080, 30 fps.
import { loadFont as loadUnbounded } from "@remotion/google-fonts/Unbounded";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

export const HEAD = loadUnbounded("normal", { weights: ["500", "600", "700"] }).fontFamily;
export const BODY = loadInter("normal", { weights: ["400", "500", "600", "700"] }).fontFamily;

// Unified with the live Apollo app's CSS tokens (oklch values converted to hex).
export const C = {
  bg: "#F5F2EC", // --background oklch(96.4% .009 85)
  panel: "#FDFCFA", // --card
  ink: "#141B26", // --foreground oklch(20% .02 260)
  sub: "#586070", // --muted-foreground
  line: "#E0DBD1", // --border
  dark: "#141B26", // app's dark search panel
  teal: "#1F4FD6", // primary accent: app --primary cobalt oklch(50% .21 258) (key kept for compatibility)
  accentSoft: "#E3EBFA", // --accent
  evidence: "#141B26", // app score bar "Proof" (dark)
  capability: "#9AA3B2", // app score bar "Support" (grey)
  closeness: "#2F6BEF", // app score bar "Closeness" (blue)
  warn: "#B45309", // app "to check" amber
};
export const MONO = "SFMono-Regular, Menlo, monospace";

export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const SAFE = 80; // safe margin px
export const CAPTION_ZONE = 170; // bottom px reserved for captions: keep scene content above H - CAPTION_ZONE

// Scene table. DESIGN = the length each scene component was animated for.
// SCENES = actual slots on the master timeline, fitted to the measured narration clips at VO_RATE.
import durations from "../public/audio/durations.json";
export const DESIGN: Record<string, number> = {
  S01: 180, S02: 210, S03: 270, S04: 330, S05: 300, S06: 330, S07: 400, S08: 440, S09: 270, S10: 270, S11: 600, S12: 180,
};
const MAX_FRAMES = 3585; // 119.5 s hard cap (< 120 s)
export const VO_OFFSET = 8;
const TAIL = 6;
const MIN_SLOT: Record<string, number> = { S07: 330, S08: 360 }; // technical scenes need reading time
const IDS = Object.keys(DESIGN);
const clip = (id: string) => (durations as unknown as Record<string, number>)[id];
const slotAt = (id: string, r: number) =>
  id === "S12"
    ? Math.ceil((clip(id) / r) * FPS) + VO_OFFSET + 66
    : Math.max(MIN_SLOT[id] ?? 0, Math.ceil((clip(id) / r) * FPS) + VO_OFFSET + TAIL);
let _r = 1;
while (IDS.reduce((a, id) => a + slotAt(id, _r), 0) > MAX_FRAMES) _r = Math.round((_r + 0.01) * 100) / 100;
export const VO_RATE = _r;
let acc = 0;
export const SCENES = IDS.map((id) => {
  const from = acc;
  acc += slotAt(id, VO_RATE);
  return { id, from, to: acc };
});
export const TOTAL = acc;
