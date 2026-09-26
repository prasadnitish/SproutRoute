# SproutRoute: Big trips. Little people.

[Watch the 60-second film](brag.mp4) · [Preview + portfolio gallery](preview.html) · [AI eval report](../benchmarks/sproutroute-ai-eval-report-2026-09-25.md)

![SproutRoute product film](brag.jpg)

## Use it

The master is 1920×1080, 30 fps, 60 seconds, H.264/AAC. `brag.jpg` is the poster. `brag.vtt` describes the visual sequence for the no-narration film. The `screens/` folder contains 2× desktop (2880×2000) and mobile (780×1688) PNGs from the real React app. `portfolio/` contains designed landscape stills from the film.

For a portfolio page, copy this folder's `brag.mp4`, `brag.jpg`, and `brag.vtt` into a public asset directory:

```html
<video controls playsinline preload="metadata" poster="/sproutroute/brag.jpg"
       aria-label="SproutRoute product demo, 60 seconds">
  <source src="/sproutroute/brag.mp4" type="video/mp4">
  <track kind="captions" src="/sproutroute/brag.vtt" srclang="en" label="Visual descriptions">
</video>
```

The included `preview.html` provides a responsive gallery and disclosure copy. Serve the repository with `python3 -m http.server 8080`, then open this folder's preview path. No API key is needed to watch the film, inspect screens, or read the saved results.

## Reproduce

From the repository root, install app dependencies with `npm run install:all`. Build the frontend, then run its preview on port 4174. Run `node scripts/capture-portfolio.mjs` in a second terminal. This replays a saved synthetic model output through the actual app, without paid model calls or customer data. Install Playwright Chromium with `npx playwright install chromium`; alternatively set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a local Chrome executable.

The editable video lives in `composition/index.html`. It uses a pinned HyperFrames CLI, local fonts, local screenshots, and local GSAP. From `composition/`:

```bash
npm run check
npx hyperframes@0.8.78 preview --background
npm run render -- --output ../brag.mp4 --quality delivery --fps 30 --workers 2
```

The original score is reproducible with `node scripts/create-demo-score.mjs score.wav`. No voiceover or third-party music samples are included. See [asset provenance](ASSETS.md).

## Cut to 30 seconds later

Use the master ranges `[0,4]`, `[9,17]`, `[17,23]`, `[26,31]`, `[34,36]`, `[55,60]` in that order. They total 30 seconds. Re-score the cut with the original music rather than concatenating its audio discontinuities. Keep the demo disclosure and final URL.

## Evidence and limitations

- The UI is the real SproutRoute application. The family and trip inputs are fictional.
- The itinerary comes from the saved September 26 paid generation pilot. Weather and general safety content in the staged capture are illustrative fixtures.
- Screenshots, crops, cursor motion, and transitions are edited for storytelling. The film does not depict real-time generation speed. It does not show a native mobile app.
- The 10/10 recovery figure is a small synthetic structural test, not production reliability, venue accuracy, or legal accuracy. Full outputs, failures, and methods are linked in the eval report.
- A separate production browser check appears in `evidence/`. It is not a substitute for a larger real-user evaluation.
- The video checker passed runtime, layout, motion, and 22 text-contrast checks. Remaining authoring warnings concern repeated screenshot assets and the single-file timeline; they are not runtime errors.

Suggested share copy: “I built SproutRoute to turn a family trip idea into daily activities, packing, weather context, and travel guidance. The repo includes the model evaluation, failure-recovery tests, and a reproducible product demo.”
