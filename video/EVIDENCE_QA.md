# Apollo video: evidence and QA note (2026-11-22)

**Deliverable:** `out/apollo-final.mp4` (H.264, 1920×1080, 30 fps, AAC). Captions in `out/apollo-final.srt`. Editable Remotion project: this folder (`npx remotion studio`).
**Runtime:** 3,571 frames = 119.03 s, under the 120 s limit. The plan was 118 s; the measured narration needed the extra second.

## What is real
- **App footage (S02–S04, S12):** screenshots of the live deployed app, https://find-the-right-care-redesign-7474644416958437.aws.databricksapps.com/ (branded Apollo), taken 2026-11-22 during a real search: Dialysis, PIN 492001. Result #1 is **Hospitales CARE, Raipur**, ~3.8 km, Strong evidence, High confidence, match 86. Its quote is "Dialysis treatment is provided using 25 dialysis machines." Recommended 5, Left out 17, 76 places checked.
- **Capture limitation:** the browser pane rendered the 1920×1080 viewport at 800×449, so the app stills are upscaled about 2.4× and look soft. `capture/capture-live.mjs` re-captures natively at 1080p; run it, then sign in in the window it opens. Coordinates in `src/scenes/layout.ts` would need a quick re-check after that.
- **Narration:** ElevenLabs, voice Esha (`NxYGDTZngCTtbvawEZyg`), model `eleven_multilingual_v2`, one take per scene (`public/audio/S01–S12.mp3`, flow "Apollo narration"). Played at 1.23× (ffmpeg atempo keeps the pitch), so about 154 wpm, inside the brief's 140–155 wpm target. The raw takes ran about 125 wpm and totalled 137 s.

## Claims and their sources
| Claim | Source |
|---|---|
| Dialysis weights 30/10/60, half-distance 15 km, road = 1.4 × haversine | `app/find_care_core.py` (PROFILE, lines 45 and 303–305) |
| Worked score 0.30×90 + 0.10×88 + 0.60×84 = 86.2 | `SUBMISSION.md`; the live app shows Proof 90, Support 88, Closeness 84, match 86 |
| 10,088 → 10,077; 2,078 cut lists; 112 implausible doctor counts; 1,492 coordinates far from their PIN; 1,643 → 1,531 cities | `app/frontend/src/lib/method-facts.ts` (read from workspace tables) |
| 83 searches, 3 baselines, 1,422 judge packets, ai_query judges | `evaluation/EVAL_RESULTS.md`, `SUBMISSION.md` |
| Dantewada dialysis: nearest documented ≈ 308 km (road estimate) | `docs/IMPLEMENTATION_NOTES.md` row 10 (recorded run; not re-run live for this video) |
| Burn care: 3 strong facilities nationally | `SUBMISSION.md`, `IMPLEMENTATION_NOTES.md` |
| Policy changes (planners, verification campaign, registry fixes) | `SUBMISSION.md` "Impact"; labelled **proposed** in the video |

## Known issues / not done
- No music bed: no licensed track was available in time. The voice is the only audio.
- The "Left out" scene highlights the real "Left out (17)" tab on the results screen. The tab's contents weren't captured.
- The live map shows a route label ("3.3 km · 3 min by road") drawn by the app's OSRM overlay. The narration makes no driving-time claim.
- The diagram scenes (S05–S11) were checked as stills only. Watch the full export once for pacing before submitting.
