# Ground Truth

Two modes for NSW Science Year 9, Environmental Sustainability dot point **4.3.4**: how satellites collect ocean temperature, sea level, forest and ice data, and how that data is used to evaluate climate change.

| Mode | Page | Who it is for |
| --- | --- | --- |
| **Satellite Spotter** (default) | `index.html` | A class that struggles with reading. About 40 minutes. Four missions (ice, forest, sea level, reef), each with the same 5 steps: the problem, pick the satellite "eye", watch it scan, slide a before and after picture, then build a sentence from word chips to earn a stamp. Ends with a printable report card. |
| **Challenge mode** | `challenge.html` | Strong students. A one-period (about 50 minutes) lesson-game where the core skill is judging **how strongly satellite evidence supports a climate claim**. Ground truth can overturn what students predicted. |

- Teacher guide: `teacher.html` (a 30-second Spotter quick start and answer key at the top, then the Challenge lesson plan, answer guide, misconceptions, syllabus mapping and data sources).
- Satellite Spotter spec: [`docs/SPOTTER-SPEC.md`](docs/SPOTTER-SPEC.md). Challenge design and build contract: [`docs/SPEC.md`](docs/SPEC.md). Pitch and reviews: `docs/4.3.4-satellite-pitch-v2.md`, `docs/4.3.4-review-codex.md`.

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
| `/ground-truth/` | Satellite Spotter. |
| `/ground-truth/challenge.html` | Challenge mode. |
| `/ground-truth/challenge.html?unlock` | Challenge mode with every part open at once (otherwise each part unlocks after the one before). |
| `/ground-truth/challenge.html?draft` | Shows the First Nations content marked `DRAFT_FN` in `src/content.ts`. Hidden by default until it has been checked with the school's Aboriginal education contact. |
| `/ground-truth/teacher.html` | Teacher guide. |

## Satellite Spotter

Progress (position, stamps, finished sentences, optional name) is saved on the device in `localStorage` under `ground-truth:spotter:v1`. "Start again" clears it. Every screen has a Listen button (Web Speech API, `en-AU` voice if there is one, hidden when the browser has no speech). The report card prints on one light page and has a Copy button.

| Path | What |
| --- | --- |
| `src/spotter/main.ts` | Start screen, the five mission steps, report card, routing and save. |
| `src/spotter/missions.ts` | All student-facing content: missions, eye cards and reasons, sentence frames and chips, hints, glossary. |
| `src/spotter/frame.ts` | Sentence builder: pure checking (`checkFrame`) plus the tap-or-drag component. |
| `src/spotter/state.ts` | Typed save, resume and "next" logic. |
| `src/spotter/scan.ts` | The "watch it scan" step on `src/globe/` (3D, with the globe's own 2D fallback, skippable). |
| `src/spotter/slider.ts`, `sealevel.ts` | Before and after slider; the real sea-level line drawn next to a ruler from `public/data/sealevel.json`. |
| `src/spotter/images.ts` | Loads `public/spotter/images.json`. A missing picture shows an "Image coming" panel, never a stand-in. |
| `src/spotter/icons.ts`, `glossary.ts`, `speech.ts`, `report.ts`, `spotter.css` | Authored SVG icons, the picture glossary and credits, read-aloud, report text, styles. |

Pictures for the ice, forest and reef missions are real satellite images in `public/spotter/` (see `docs/DATA-SOURCES.md` for sources and licences). No AI-generated images anywhere.

## Challenge mode: how it is built

Vite, TypeScript and vanilla DOM. Charts and maps are hand-rolled SVG. `three` is used by the globe in the sensor lab and the Spotter scan step.

| Path | What |
| --- | --- |
| `src/main.ts` | Challenge shell: header, progress rail, part router, save and resume. |
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
- Spotter uses large type (20 px and up), 48 px or bigger tap targets, and one primary button per screen. Chips and sliders work with the keyboard.
- All art is authored in SVG and CSS. No AI-generated images.

## Credits

Data sources and licences are listed in the app (Credits) and on the teacher page, read from the `sources` array in each JSON file. Coastlines: Natural Earth (public domain). Earth imagery in the globe: NASA Earth Observatory Blue Marble (public domain).

## Deploy

`.github/workflows/deploy.yml` runs `npm ci`, `npm test`, `npm run build` and publishes `dist/` to GitHub Pages. The Vite base is `/ground-truth/`.
