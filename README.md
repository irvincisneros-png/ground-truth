# Ground Truth

A one-period (about 50 minutes) Year 9 lesson-game for NSW Science, Environmental Sustainability dot point **4.3.4**: how satellites collect ocean temperature, sea level, forest and ice data, and how that data is used to evaluate climate change.

The core skill is judging **how strongly satellite evidence supports a climate claim**. Ground truth can overturn what students predicted.

- Student lesson: `index.html`. Teacher guide: `teacher.html` (lesson plan, answer guide, misconceptions, syllabus mapping, data sources).
- Design and build contract: [`docs/SPEC.md`](docs/SPEC.md). Pitch and reviews: `docs/4.3.4-satellite-pitch-v2.md`, `docs/4.3.4-review-codex.md`.

## Run it

```bash
npm install
npm run dev      # http://localhost:8800/ground-truth/
npm test         # vitest
npm run build    # tsc + vite build into dist/
```

Useful addresses while previewing:

| Address | Effect |
| --- | --- |
| `?unlock` | Opens every part at once (otherwise each part unlocks after the one before). |
| `?draft` | Shows the First Nations content marked `DRAFT_FN` in `src/content.ts`. Hidden by default until it has been checked with the school's Aboriginal education contact. |

## How it is built

Vite, TypeScript and vanilla DOM. Charts and maps are hand-rolled SVG. `three` is used only by the globe in the sensor lab.

| Path | What |
| --- | --- |
| `src/main.ts` | Shell: header, progress rail, part router, save and resume. |
| `src/state.ts` | Typed progress state in `localStorage` under `ground-truth:v1`. `award()` writes a score once, so only first attempts count. |
| `src/scoring.ts` | All scoring as pure functions: predictions score for commitment, symmetric claim-strength penalty, irrelevant evidence penalised, limitation must match the claim. |
| `src/content.ts` | Claims, evidence cards, limitation cards and every check-question option. Shared by the student app, scoring and teacher page. |
| `src/data/` | Types for `public/data/*.json`, loaders (a missing file shows a "Data loading" state, never invented numbers) and derivations. |
| `src/ui/` | `LineChart` (SVG, hover and keyboard readouts, data table toggle, trend fits, highlighted ranges), `MapPanel` (equirectangular SVG), Card, Button, Modal, DataTableToggle. |
| `src/parts/` | One file per screen. `sensor-lab/` and `src/globe/` belong to the globe build. |
| `tools/geo/build-geo.mjs` | Rebuilds `public/data/geo/au-land.json` from Natural Earth 1:50m land (public domain). |

## Accessibility and design notes

- Everything works from the keyboard. Charts take the left and right arrow keys (Shift or Page Up and Page Down for bigger jumps) and every chart has a "Show data table" toggle.
- Nothing is timed. `prefers-reduced-motion` switches animation off.
- Colour palettes are Okabe-Ito for categories and cividis-like for ordered survey categories. Colour is never the only cue.
- Designed for 1366 by 768 first, and usable down to 375 px wide.
- All art is authored in SVG and CSS. No AI-generated images.

## Credits

Data sources and licences are listed in the app (Credits) and on the teacher page, read from the `sources` array in each JSON file. Coastlines: Natural Earth (public domain). Earth imagery in the globe: NASA Earth Observatory Blue Marble (public domain).

## Deploy

`.github/workflows/deploy.yml` runs `npm ci`, `npm test`, `npm run build` and publishes `dist/` to GitHub Pages. The Vite base is `/ground-truth/`.
