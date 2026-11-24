# Orbit Run: arcade option (spec)

**What it is:** an original endless side-scrolling flyer inside Ground Truth. It is an *easily chosen option* from the Satellite Spotter start screen (a big card, always available, no unlock needed), not the main feature. It is not a copy of Flappy Bird or Subway Surfers: no copied names, art, sounds or level layouts.

**Learning goal:** drill dot point 4.3.4's "how satellites collect data". Students practise which sensor measures what, and what blocks each sensor (cloud, night). The core action *is* the science; there is no quiz between runs.

**Audience:** a very low-ability Year 9 class on school Chromebooks (1366×768, often weak GPUs), and phones. Text is minimal and plain.

## Core loop
- **Flight:** the satellite flies right, automatically, over a scrolling strip of Earth.
  - **Hold or tap control:** hold Space, the mouse or a touch to climb, and let go to sink. Movement is smooth and floaty, not punishing.
  - **Altitude band:** the satellite moves within a band marked by red dashed danger lines. Any touch of the top or bottom edge bounces the satellite back and costs a quarter shield (once per 0.9 s while pinned), so camping on an edge ends the run in about 10 s. A "Too high" / "Too low" hint shows on the first touch.
- **Terrain zones:** the strip below scrolls through ocean, reef, forest, sea ice and open sea, each lasting 4–8 s, in a random order with sensible transitions.
  - The zone is shown by its look (blue sea, turquoise reef, green canopy, white ice) and a small label at the bottom edge ("Forest").
- **Sensor switching:** press 1–4, or tap the 4 big eye buttons along the bottom on touch, to pick a sensor. The active eye glows, and a beam shines down from the satellite.
  - **Heat camera:** warm ocean and reef. Collects "ocean temperature".
  - **Colour camera:** forest. Collects "forest cover".
  - **Radar ruler:** open sea. Collects "sea height".
  - **Microwave eye:** sea ice. Collects "ice cover".
- **Collecting data:** a correct sensor over its zone collects glowing data points (+1 each) streaming up the beam into the satellite.
  - A wrong sensor collects nothing, and a gentle hint appears once per zone, for example "Ice? Try the microwave eye".
- **Power (penalty for the wrong eye):** a power bar under the shields. Collecting charges it (+0.10/s). A wrong eye drains it (−0.16/s, about 6 s from full to empty) and resets the combo, with a "Wrong eye: losing power" tag. There is a 0.6 s grace after the ground changes, and no drain when the right eye could not work anyway (cloud over warm sea or reef, night over forest). Empty power ends the run, also in Sensor-only mode.
- **Hazards:**
  - **Space junk:** a hit costs one shield (3 shields per run), and losing all three ends the run. Three patterns, all reaching the edges so there is no safe lane:
    - **Walls:** a column of junk across the whole band with one gap (0.46 of the band at first, down to 0.36). The gap jumps away from the last one, so the player must move. 40% of obstacles in orbit 1, 55% later.
    - **Pairs** (from orbit 2) and **singles**, 30% of which sit right by an edge.
    - Spacing tightens each orbit. A bot that only hovers mid-band survives about 30 s.
  - **Cloud banks:** clouds below block the heat and colour cameras (the beam scatters and collects nothing). Radar and microwave still work through cloud, with a hint: "Clouds! Radar and microwave see through."
  - **Night side:** the colour camera stops working at night (the beam goes dark). Every other sensor works, with the hint "Night! The colour camera needs sunlight."
- **Pacing:** each loop around Earth is an "orbit", and speed rises a little each orbit. A run should last about 1–3 minutes.
- **Easy mode** (a toggle on the start card): altitude is automatic and avoids junk, so the student only switches sensors. Make it obvious and shame-free ("Sensor-only mode").

## End of run: Data report
- **Totals:** a short card with data points by type, orbits flown (one decimal) and junk hits, plus why the run ended (out of power, or shields gone).
- **One rotating fact line tied to real science**, for example:
  - "Real satellites collect millions of ocean temperatures every day. Scientists use them to spot marine heatwaves that bleach coral."
  - "The radar ruler measures sea height to about 3 cm on each pass. Averaging millions of passes shows the sea rising."
- **Score:** best score saved locally (key `ground-truth:orbit-run:v1`). No online leaderboard.
- **Buttons:** "Fly again" and "Back to missions".

## Look and feel (owner judges on screenshots and play)
- **Art:** authored stylised vector art only, with **no AI images and no emoji**.
- **Rendering:** Canvas 2D (preferred, for weak Chromebooks), with layered parallax:
  - starfield, the curved Earth limb with an atmosphere glow, a cloud layer and the terrain strip;
  - soft gradients and a subtle bloom-like glow on beams and data points.
- **Satellite sprite:** drawn in code, a crisp body with solar panels, a slight tilt with climb, and a thruster puff.
- **Juice:** particle sparkle on collect, a screen shake on junk hit (reduced-motion: none), a combo counter for a streak of correct collects, and a smooth speed-up.
- **Feel:** it must feel good within 5 seconds: responsive input, readable hazards, fair hitboxes (slightly forgiving).
- **Audio:** optional, off by default, toggleable; short synthesised blips via WebAudio, no external files.
- **Frame rate:** 60 fps target, adaptive. Hold a steady pace on a weak device by dropping particles and parallax layers when fps is under 45.
- **Layout:** works at 1366×768 and 375 px (portrait phone: a shorter band, eye buttons at the bottom).
- **Pause:** Pause on P/Esc and when the tab is hidden.
- **Accessibility:** a high-contrast option isn't required, but colours should be distinguishable (zones also differ in texture and label).

## Code
- **Location:** `src/orbit-run/`, holding `index.ts` (exports `mountOrbitRun(root: HTMLElement, opts: { onExit(): void }): () => void`, whose cleanup stops the loop and removes listeners), `game.ts` (pure state update, deterministic with a seeded RNG, testable), `render.ts`, `input.ts`, `audio.ts`, `content.ts` (zones, sensors, hints, facts) and `orbit-run.css`.
- **Dev page:** `src/orbit-run/dev.html`.
- **Tests (`tests/orbit-run-*.test.ts`):**
  - sensor×zone×condition collect matrix (cloud blocks heat and colour; night blocks colour; radar and microwave work through both);
  - shield and collision logic;
  - speed ramp;
  - easy mode auto-altitude avoiding junk;
  - save of the best score.

## Difficulty curve, power-ups and music (added 2026-11-24 after the owner's playtest)
- **One difficulty curve:** `difficultyAt(dist)` climbs from 0 to 1 over 5 orbits (about 2.5 minutes). Everything harder reads from it.
  - **Wrong-eye drain:** 0.07/s → 0.18/s. **Switch grace:** 1.4 s → 0.6 s. **Edge cost:** 0.18 → 0.25 shield.
  - **Junk:** the first half orbit has single junk only, far apart, slow drift, rarely by an edge. Walls start around d 0.1 with a very wide gap (0.56 of the band, narrowing to 0.34) that stays near the last gap early on and jumps further later. Pairs start at d 0.2. Spacing, drift and edge-huggers all grow with d. Speed still ramps per orbit.
  - Simulated: a bot that never dodges lasts about 45 s; a bot that camps on the top edge lasts about 17 s.
- **Power-ups** (fly into them; every 9–14 s, mid band, kept clear of junk columns; labelled in plain words):
  - **Shield** (blue): +1 shield, up to 3.
  - **Power** (gold solar panel): fills the power bar.
  - **x2 points** (pink): double points for 8 s, with a badge and timer under the score.
- **Sound** is now ON by default (save field `soundV: 2`; older saves that stored the old "off" default are treated as on). One toggle controls everything.
  - **Music:** a generative Web Audio loop in A minor (Am–F–C–G), no files. 100 BPM at the start, up to 126 BPM. Layers join as difficulty rises: pad and bass, then arpeggio on every eighth, then hi-hats (d > 0.25), then kick and busier bass (d > 0.5). Plays only while flying; fades on pause and game over.
  - **New effects:** a rising chime on power-up pick-up, and a low double buzz (at most every 0.7 s) while the wrong eye drains power. The attract demo behind the start card is silent.
