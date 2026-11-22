# Submission video ("Apollo")

A [Remotion](https://www.remotion.dev/) project that renders the 2-minute submission video (1920×1080, 30 fps) from screenshots of the deployed app, scene components and narration clips.

| Path | What |
|---|---|
| `src/Root.tsx`, `src/Apollo.tsx` | Composition and scene timeline |
| `src/scenes/` | One component per scene (S01–S12); `layout.ts` holds the screenshot hotspots |
| `src/narration.ts`, `src/Captions.tsx` | Narration timing and burned-in captions |
| `public/app`, `public/app_pane` | Screenshots of the live app |
| `public/audio` | Final narration clips (`public/audio_v1` is the first take) |
| `capture/` | Playwright scripts that re-capture the app at native 1080p |
| `gen-srt.mjs` | Writes the `.srt` captions file |
| [NARRATION_v2_british.md](NARRATION_v2_british.md) | Final script; [NARRATION.md](NARRATION.md) is the earlier version |
| [EVIDENCE_QA.md](EVIDENCE_QA.md) | Every on-screen claim and where it comes from |

## Render

Needs Node 20+.

```bash
npm ci
```

```bash
npx remotion studio            # preview
```

```bash
npx remotion render Apollo out/apollo-final.mp4
```

`out/` and the rendered `.mp4` are gitignored because of their size; publish the final video as a GitHub release asset or link it from the main README.
