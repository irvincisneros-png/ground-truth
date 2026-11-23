# Ground Truth: build spec

**Topic:** NSW Science Years 7–10 (2023). Year 9 Environmental Sustainability, dot point **4.3.4**: *"Investigate how satellites collect global data, including data on ocean temperatures, sea levels, and forest and ice cover, and examine how this data is used to evaluate the impact of climate change."*

- **Pitch and reviews:** `docs/4.3.4-satellite-pitch-v2.md` (authoritative design) and `docs/4.3.4-review-codex.md`.
- **Audience:** Year 9 at Woonona High School (HPGE-focused), on school laptops and Chromebooks over school wifi. The lesson takes one period of about 50 minutes and needs no login.
- **Core skill:** judging how strongly satellite evidence supports a climate claim. Ground truth can overturn what you predicted.

## Stack and repo
- **Toolchain:** Vite, TypeScript and vanilla DOM, with `three` used only for the globe. Tests use `vitest`. Charts are hand-rolled SVG, with no chart or UI framework.
- **Paths:** the repo is `ground-truth/`. Vite `base: '/ground-truth/'` for GitHub Pages. The dev server runs on port **8800**.
- **Pages:** `index.html` (student) and `teacher.html` (teacher guide).
- **Deploy workflow:** `.github/workflows/deploy.yml`, copied from `../magnitude/.github/workflows/deploy.yml`, running `npm ci`, `npm test`, `npm run build` and then deploying `dist`.
- **Size budget:** the core download, excluding the optional globe textures, must be **≤ 5 MB**. Globe textures load lazily and only when WebGL is good enough.
- **Accessibility:** every interaction works from the keyboard. Every chart has a "Show data table" toggle. Nothing is timed. Text is pitched at Year 9 reading level. Palettes are colourblind-safe and never rainbow; every map has a legend and units. Respect `prefers-reduced-motion`.
- **Layout:** works at a 1366×768 Chromebook size and degrades gracefully down to 375 px wide.
- **Persistence:** progress is saved to `localStorage` (key `ground-truth:v1`) and can be resumed. A "Start again" option clears it.

## Visual bar
This is a polished, credible mission-control and science-agency look, not a toy.

- **Base:** deep navy (#0b1424 / #111d33) panels with crisp light text and a thin hairline grid.
- **Accent:** one warm accent (#ffb547) for "your choice / commit". Data colours stay separate from UI colours.
- **Type:** `system-ui` for text and `ui-monospace` for numeric readouts. Readouts look like instrument panels: units always shown, with tabular figures.
- **Motion:** subtle and purposeful; scan lines sweep, footprints fade in. No bouncy cartoon motion and no emoji.
- **Data palettes:**
  - Sequential temperature and heat stress (DHW): `cividis` or a NOAA Coral Reef Watch–style ramp checked for CVD safety.
  - Diverging anomalies: blue→white→orange.
  - Categorical: Okabe–Ito.
- **Art sources:** all art is authored (SVG, CSS, three.js). **No AI-generated images.** The real Earth comes from the NASA Blue Marble textures copied from `../magnitude/public/assets/earth/` (`day_2048.jpg`, `clouds_2048.jpg`; public domain, credit NASA Earth Observatory).

## Design tokens (`src/styles/tokens.css`, owned by the shell builder)
```css
--bg:#0b1424; --panel:#111d33; --panel-2:#17284a; --line:#2a3d63; --text:#e8eefc; --muted:#9fb0d4;
--accent:#ffb547; --good:#4cc38a; --warn:#f2a93b; --bad:#e5636b; --focus:#7cc4ff;
--radius:10px; --font:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
```

## Flow (target minutes)
0. **Launch** (5): the hook "A satellite never photographs temperature. So what does it measure?" Then a 3-step mission map showing Sensor lab → Reef investigation → Transfer cases → Minister briefing.

1. **Sensor lab** (8): four short stations, about 2 minutes each, in any order. Each shows *raw signal → derived quantity* and ends with a trade-off card scoring coverage, revisit, resolution, cloud and night. There are no right or wrong sensor picks.
   - **Thermal infrared, for sea-surface skin temperature**
     - *Satellites:* a geostationary satellite (Himawari-9, a fixed view of Australia every 10 min, poor at high latitudes) and a polar sun-synchronous satellite (VIIRS on NOAA-20, roughly twice a day, 750 m).
     - *Interaction:* drag a cloud over a reef; that pixel becomes "no data" with a quality flag. Then reveal the gap-filled blended product (NOAA CoralTemp, 5 km, night-time).
     - *Check question:* "Why is there no reading for this reef on this pass?"
   - **Radar altimeter, for sea-surface height**
     - *Satellites:* Jason-3 / Sentinel-6 Michael Freilich, 66° inclination, not sun-synchronous, a 9.9-day repeat. Ground tracks are thin lines with gaps of about 300 km at the equator, and the orbit never sees the poles.
     - *Interaction:* an echo-delay slider changes range, and height = orbit altitude − range.
     - *Averaging demo:* single measurements scatter about ±3 cm, and as n grows the mean tightens to mm precision.
   - **Optical multispectral, for forest cover**
     - *Satellite:* Landsat 8/9, 30 m, a 16-day repeat each (8 days combined), using reflected sunlight.
     - *Interaction:* a pixel spectrum shows healthy vegetation reflecting strongly in near-infrared, burnt ground showing up in shortwave infrared, and clouds blocking the view. The sensor can't see at night.
   - **Passive microwave, for sea-ice concentration**
     - *Satellites:* AMSR2 / SSMIS, about 25 km pixels, measuring emitted microwaves. Ice and open water emit differently. The sensor works through cloud and through polar night.
     - *Interaction:* concentration per pixel, then the **15% threshold** → extent.

2. **Reef investigation** (20): the core game, using real data only.
   - **Map:** the GBR with two (optionally three) named reefs.
   - **Heat-stress graph:** each reef's DHW (°C-weeks) over several summers, against the same baseline (the Maximum Monthly Mean climatology).
   - **Predict:** "Which reef bleached more severely in 2024?" The student commits a prediction with a confidence level, and it locks.
   - **Survey flight:** the student has **one flight**, chooses which reef to fly over, and sees the real AIMS aerial survey category for that reef. Then all results are revealed, and the evidence can overturn the prediction.
   - **Ground truth:** a temperature logger at a labelled depth (AIMS) is compared with the satellite skin SST over the same period. Prompt: why do they differ?
   - **Quantified comparison:** "Reef A's peak DHW was __ °C-weeks, __ × Reef B". The student enters a number, checked with a tolerance.
   - **Attribution limit:** pick one or more limitations, such as "DHW predicts risk, not outcome", "depth and shading differ", "prior bleaching history" or "one year is not a trend".

3. **Transfer cases** (10): three cases of about 3 minutes each. Each case is built on a **trap**, and each ends on the long record, never on a single event.
   - **Sea level**
     - *Data:* the NASA global mean sea level series from 1993 to now. A trend fit shows acceleration: about 2.1 mm/yr in 1993–2002 versus about 4.7 mm/yr in 2015–2024 (show what the data gives).
     - *Trap:* a pair of years the student is invited to compare points the "wrong" way, because of ENSO. Then they view the full record.
     - *Contrast:* a local tide gauge (Torres Strait or the east-coast NSW region) measures sea level relative to land. Ask why it differs from the satellite global mean.
     - *Note:* altimetry cannot tell which street floods.
   - **Forest**
     - *Data:* two Hansen Global Forest Change "loss" crops that both look like loss pixels: (a) a NSW Black Summer 2019–20 fire area and (b) a Queensland clearing area.
     - *Overlays:* a fire perimeter and a clearing polygon (or a land-use label).
     - *Question:* "Which is climate-linked, which is bulldozers, how can you tell?" Black Summer attribution research found **increased fire-weather risk**, not the cause of each fire. Burnt eucalypt forest often resprouts.
   - **Ice**
     - *Data:* NSIDC Sea Ice Index v4 for the Antarctic (February minimum and September maximum, 1979–now) and the Arctic September series.
     - *Trap:* "Antarctic 2023 was a record low, so is that a trend?" Compare with the Antarctic 2014 record high and the steady Arctic September decline (about −12%/decade).
     - *Callout:* sea ice is not an ice sheet. Melting sea ice doesn't raise sea level; ice-sheet mass loss needs gravity (GRACE) or laser altimetry (ICESat-2).

4. **Minister briefing** (7): the exit ticket, built with a claim constructor.
   - *Claim:* the student chooses a claim (from case options) and a claim strength: *no evidence / suggests / strongly supports / proves*.
   - *Evidence and limitation:* 2–3 evidence cards, plus a **required** single limitation card.
   - *Scoring:* deterministic and in `src/scoring.ts`, with unit tests.
     - Overclaiming ("proves") is penalised as much as underclaiming.
     - Irrelevant evidence is penalised.
     - The limitation must match the claim.
   - *Free text:* an optional box, not auto-marked, which appears on the teacher export.

5. **Debrief and export**
   - **Score summary:** evidence points per part. There are **no ranks and no shop**. Predictions score on *commitment*, not correctness, and only first attempts score.
   - **End on use:** reef heat-stress warnings to managers; Indigenous ranger satellite fire-hotspot mapping in northern Australia; Torres Strait Islander–led monitoring and advocacy. All are framed as agency, never as victims. Content is marked `DRAFT_FN` and hidden unless `?draft` until it's checked with the school's Aboriginal education contact.
   - **Export:** a printable one-page summary (print CSS) plus a "copy summary" text for submission.

## Code layout (ownership)
```
src/main.ts            shell + router (parts as screens), progress bar, save/resume      [shell builder]
src/state.ts           typed progress state + localStorage                              [shell builder]
src/scoring.ts         all scoring, pure functions, tested                              [shell builder]
src/ui/*               shared components: Button, Card, Modal, DataTableToggle, LineChart (SVG), MapPanel (SVG equirect with lat/lon→xy) [shell builder]
src/parts/launch.ts, reef.ts, transfer-sea.ts, transfer-forest.ts, transfer-ice.ts, briefing.ts, debrief.ts   [shell builder]
src/parts/sensor-lab/  the four stations                                               [globe builder]
src/globe/             three.js globe: Blue Marble + clouds + soft atmosphere rim, orbits, ground tracks, swaths, footprints; fallback 2D map when WebGL weak/absent [globe builder]
src/data/types.ts      TS types matching public/data/*.json (below)                   [shell builder; others read-only]
public/data/*.json     real data                                                        [data builder]
src/styles/tokens.css, base.css                                                         [shell builder]
teacher.html + src/teacher.ts   lesson plan, timings, answer guide, misconceptions, syllabus mapping, data sources  [shell builder]
```
**Interface between the shell and the sensor lab:** `export function mountSensorLab(root: HTMLElement, ctx: { state: Progress; save(): void; onDone(): void }): () => void` returns a cleanup function. The shell imports it lazily, and until it exists it shows a placeholder.

## Data contracts (`public/data/`; units in field names, all dates ISO)
Every file has `"sources": [{ "name", "url", "licence", "citation", "retrieved" }]`.

- `reef.json`:
  ```
  { baseline: "MMM climatology note",
    reefs: [{ id, name, lat, lon, crwStation?,
              dhw: [{ date, dhw_cweeks }],      // weekly or daily, ≥ 4 summers incl. 2024
              peakDhwBySummer: { "2016": n, ... },
              survey: { "2024": { category: 0-4, label, note } , ...} }],
    surveyScale: [{ category, label, description }] }
  ```
- `buoy.json`: `{ site, depth_m, series: [{ date, logger_c, satellite_c }] }`, with the same period and real values.
- `sealevel.json`:
  ```
  { gmsl: [{ t_year, gmsl_mm }],
    tideGauge: { station, lat, lon, series: [{ year, msl_mm }] },
    rates: { "1993-2002": mm_per_yr, "2015-2024": mm_per_yr }   // computed by the data builder; document the method
  }
  ```
- `forest.json` plus images in `public/data/forest/`:
  ```
  { cases: [{ id, label, bounds: [w, s, e, n], lossPng, lossYears: [from, to], overlay: GeoJSON, overlayKind: "fire" | "clearing", answer: "climate-linked" | "land-use", note }] }
  ```
- `seaice.json`:
  ```
  { antarctic: { feb_min: [{ year, extent_mkm2 }], sep_max: [...] },
    arctic: { sep: [...] },
    trendPctPerDecade: { arctic_sep: n } }
  ```
- `orbits.json` (optional, the globe builder may hard-code these): per satellite, its inclination, altitude, repeat period and swath width, with sources.

## Out of scope
Accounts, a backend, leaderboards, AI-generated art, live API calls at runtime (all data is pre-baked), and Carrying Capacity changes (a separate follow-up).
