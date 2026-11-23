# Satellite Spotter: the new default mode (spec)

**Why:** the owner's Year 9 class is very low ability, and the current lesson (now **Challenge mode**) is too confusing even for the teacher. Satellite Spotter covers the same dot point (4.3.4) with one simple loop repeated four times.

**Routes:** Spotter becomes `index.html`. The existing app moves, unchanged, to `challenge.html`.

## Audience rules (non-negotiable)
- **Text per screen:** at most 2 short sentences, around a Year 3–4 reading level. Use plain words, explaining each one the first time ("satellite = a machine that circles Earth").
- **Read-aloud on every screen:** a 🔊 button (an authored SVG icon, **no emoji in the UI**) reads the screen's text using the Web Speech API. Prefer an `en-AU` voice, fall back to any English voice, and hide the button if `speechSynthesis` is missing.
- **Input:** no typing (apart from an optional name on the report card), no graphs to read precisely, and no maths.
- **Big targets:** tap targets are at least 48 px. Use one obvious primary button per screen ("Next →"). Progress shows as "Mission 2 of 4" with 4 stamp slots.
- **Mistakes are free:** a wrong pick shows a friendly reason plus "Try again". Nothing is lost.
- **Accessibility:** keyboard operable, with visible focus, `prefers-reduced-motion` respected, and a layout that works at 1366×768 down to 375 px wide.
- **Glossary:** a picture glossary button opens 6 words, each with an icon and one sentence: satellite, sensor, data, climate change, sea ice, coral bleaching.

## Look
- **Base style:** keep the Ground Truth tokens (`src/styles/tokens.css`) and its navy, credible feel, but make it friendlier. Use larger type (body text 20–22 px), rounded cards, and more space.
- **Icons:** authored SVG for the four "eyes":
  - **Heat camera:** thermometer and lens.
  - **Radar ruler:** dish with an echo arc.
  - **Colour camera:** lens with bands.
  - **Microwave eye:** wave rings.
- **Imagery rule:** no AI images. All imagery is real satellite imagery (see Images) or authored SVG/three.js.

## Structure
1. **Start screen:**
   - Title "Satellite Spotter" and one line: "Satellites watch Earth from space. Use them to check on our planet."
   - Big "Start mission 1" button.
   - A small "Challenge mode (harder)" link to `challenge.html` and a "Teacher guide" link.
   - Resume if progress is saved (localStorage key `ground-truth:spotter:v1`).
2. **Four missions, same 5 steps each:**
   1. **Problem:** one real image plus one sentence.
   2. **Pick the eye:** 4 eye cards. A wrong pick gives its reason; the right pick gives "Yes! because …". This is the "how satellites collect data" half.
   3. **Watch it scan:** about 6–8 s of the globe (reuse `src/globe/`) showing the satellite type flying and painting the map. Skippable, with a 2D fallback.
   4. **Before / after:** a drag slider (also arrow keys) comparing real images. Read-aloud prompt: "What changed?"
   5. **Say what it shows:** a sentence frame with 2–3 blanks. Each blank has 3 chunky word chips. The student taps a chip, then a blank, or drags. They check it; wrong chips wobble and give a hint, and they retry. A completed sentence earns the mission's **stamp** with a small, satisfying stamp animation. This is the "how data is used to evaluate climate change" half.
3. **Report card:**
   - Shows the 4 stamps, the 4 completed sentences, an optional name field, and the date.
   - "Print" (one page, light theme in print CSS) and "Copy" buttons.
   - Line at the end: "You used satellite data to check on Earth, just like real scientists."

## Missions (in this order)
| # | Problem (1 sentence) | Best eye and why | Wrong-eye reasons (examples) | Before / after | Sentence frame (blank options; correct in bold) |
|---|---|---|---|---|---|
| 1 Ice | "Is the ice at the top of the world getting smaller?" | Microwave eye: "It sees ice even in the dark and through clouds." | Colour camera: "It is dark for months at the North Pole." Heat camera: "Clouds block it." Radar ruler: "It measures height, not ice." | Arctic summer sea-ice minimum, 1980s vs 2020s (real NASA images) | "The satellite shows the Arctic sea ice is **[shrinking / growing / the same]**. This is because Earth is getting **[warmer / colder / darker]**." |
| 2 Forest | "What happened to these NSW forests in summer 2019–20?" | Colour camera: "It sees green trees and black burnt ground." | Microwave eye: "Its pixels are too big to see trees." Radar ruler: "It measures sea height." Heat camera: "It is for the sea's temperature." | Real satellite images of the same NSW forest area before and after Black Summer | "The satellite shows the forest was **[burnt / flooded / snowed on]**. Hot, dry weather made the fires **[more / less]** likely, and climate change makes hot, dry weather **[more / less]** common." |
| 3 Sea level | "Is the sea getting higher?" | Radar ruler: "It times an echo to measure the height of the sea." | Colour camera: "A photo can't measure a few millimetres." Heat camera: "It measures temperature." Microwave eye: "It is for ice." | No image pair. The slider draws the real sea-level line from `public/data/sealevel.json` (1993 → latest), from 0 to about +10 cm, with a ruler graphic. A plain caption like "about the height of your thumb" is fine if accurate. | "The satellite shows the sea is **[rising / falling / staying the same]**. Warmer water takes up **[more / less]** space, and melting ice adds water." |
| 4 Reef | "Why is coral on the Great Barrier Reef turning white?" | Heat camera: "It measures how hot the top of the sea is." | Colour camera: "It can't measure temperature." Radar ruler: "It measures sea height." Microwave eye: "It is for ice." | NOAA Coral Reef Watch heat-stress map of the GBR: a calm year vs 2024 | "The satellite shows the sea was too **[hot / cold / salty]**, so the coral **[bleached / grew / moved]**." Then **one bonus question:** "Is one hot summer enough to be sure the climate is changing?" (Yes / No). The answer reveal: "No. Scientists look at many years. The Great Barrier Reef has had mass bleaching in 1998, 2002, 2016, 2017, 2020, 2022, 2024 and 2025." Checked against `docs/DATA-SOURCES.md`. |

Scientific honesty: the forest frame must not say climate change *caused* the fires. It says hot, dry weather made fires more likely, and climate change makes such weather more common, which follows the van Oldenborgh et al. 2021 attribution study.

## Images (data builder fills these)
- **Files:** `public/spotter/{ice,forest,reef}-{before,after}.webp` (or `.jpg`), plus `public/spotter/images.json` holding `{ id, before: { file, label (e.g. "1984"), date }, after: {…}, caption, credit, licence, sourceUrl }`.
- **Framing:** each pair has the same framing and size, about 1200 px wide and ≤ 350 KB each.
- **Sources and licences:** real satellite imagery only, public domain or CC BY. Credits show on a Credits screen and as small text under the slider.
- **Missing images:** if a file is missing, show a tidy "Image coming" panel. Never use a fake image.

## Code layout
- `src/spotter/`: `main.ts`, `missions.ts` (content data above), `speech.ts`, `slider.ts`, `frame.ts` (sentence builder), `report.ts`, `glossary.ts`, `icons.ts`, `spotter.css`.
- Reuse `src/globe/` for the scan step. Read-only reuse is fine; small additive APIs are allowed if needed.
- `challenge.html` → the existing `src/main.ts`, with its links updated.
- `teacher.html`:
  - Add a **"Quick start (30 seconds)"** box at the top covering Spotter: what students do, how long it takes (about 40 min), how to collect the report card, and running mission 1 together on the board.
  - Keep the Challenge guide below it.
- Tests: mission content integrity (every frame has exactly one correct chip per blank; every mission has a best eye), sentence checking, and state save/resume.

## Out of scope
Changing Challenge-mode content, accounts, and AI imagery.
