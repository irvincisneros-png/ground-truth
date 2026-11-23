/** Station 2: radar altimeter -> sea-surface height. */
import { SATELLITES, JASON_REPEAT_S, DAY_S, equatorCrossingLons, maxEquatorGapKm } from '../../../globe';
import type { StationFactory } from '../station';
import {
  C_LIGHT, JASON_ALTITUDE_M, delayFromHeight, heightFromRange, rangeFromDelay, simulateMeasurements, stats,
} from '../physics';
import { clamp, dataTableToggle, fmt, grp, h, readout, s, sgn } from '../ui';

const TARGET_H = 0.4; // m, warm-core eddy
const TOL = 0.03;     // m
const SIGMA = 0.03;   // m, single-measurement scatter
const NMAX = 400;
const T0_NS = delayFromHeight(JASON_ALTITUDE_M, 0) * 1e9;
const NS_PER_M = 2 / C_LIGHT * 1e9; // delay change per metre of range, ns

export const createAltimeterStation: StationFactory = (env) => {
  const { host, state, globe } = env;
  let offsetNs = 3.0; // delay offset from the reference-level echo
  let n = 0;
  let days = 1;
  let winStart = 0;
  let timer = 0;
  let found = !!state.flags.found;
  let avg100 = !!state.flags.avg100;
  const meas = simulateMeasurements(TARGET_H, SIGMA, NMAX, 303);

  const info = () => {
    const t = (T0_NS + offsetNs) * 1e-9;
    const range = rangeFromDelay(t);
    return { t, range, height: heightFromRange(JASON_ALTITUDE_M, range) };
  };

  // ------------------------------------------------------------------ cross-section figure
  const VW = 420, VH = 300, REF_Y = 238, SAT_Y = 58, PX_PER_M = 44;
  const surfaceY = (m: number) => REF_Y - clamp(m, -1.4, 1.4) * PX_PER_M;
  const svg = s('svg', { class: 'sl-alt-svg', viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': 'Cross-section: a satellite above the sea sends a radar pulse down and receives the echo. The longer the echo takes, the lower the sea surface.' });
  const defsA = s('defs', null,
    s('linearGradient', { id: 'sl-sky', x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: 0, 'stop-color': '#050b17' }), s('stop', { offset: 1, 'stop-color': '#12304f' })),
    s('linearGradient', { id: 'sl-sea', x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: 0, 'stop-color': '#2e7fc0' }), s('stop', { offset: 1, 'stop-color': '#0b2a4d' })),
    s('marker', { id: 'sl-arr', viewBox: '0 0 8 8', refX: 4, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0L8 4L0 8z', fill: 'currentColor' })));
  const sea = s('path', { class: 'sl-alt-sea', fill: 'url(#sl-sea)' });
  const seaLine = s('path', { class: 'sl-alt-sealine', fill: 'none' });
  const refLine = s('g', { class: 'sl-alt-ref' }, s('path', { d: `M14 ${REF_Y}H${VW - 14}` }), s('text', { x: VW - 14, y: REF_Y + 16, 'text-anchor': 'end' }, 'reference level (h = 0)'));
  const pulses = s('g', { class: 'sl-alt-pulses' },
    ...[0, 1, 2].map((i) => s('path', { d: 'M-34 0Q0 16 34 0', class: 'sl-alt-pulse', style: `animation-delay:${i * 0.8}s` })));
  const rangeArrow = s('path', { class: 'sl-alt-dim sl-alt-dim--r', 'marker-start': 'url(#sl-arr)', 'marker-end': 'url(#sl-arr)' });
  const rangeLbl = s('text', { class: 'sl-alt-dimtxt sl-alt-dimtxt--r' });
  const heightArrow = s('path', { class: 'sl-alt-dim sl-alt-dim--h', 'marker-start': 'url(#sl-arr)', 'marker-end': 'url(#sl-arr)' });
  const heightLbl = s('text', { class: 'sl-alt-dimtxt sl-alt-dimtxt--h' });
  const heightTag = s('g', { class: 'sl-alt-target' });
  const satG = s('g', { transform: `translate(${VW / 2} ${SAT_Y})` },
    s('rect', { x: -66, y: -5, width: 50, height: 10, rx: 1, class: 'sl-alt-panel' }), s('rect', { x: 16, y: -5, width: 50, height: 10, rx: 1, class: 'sl-alt-panel' }),
    s('rect', { x: -16, y: -13, width: 32, height: 26, rx: 2, class: 'sl-alt-bus' }),
    s('path', { d: 'M-24 17Q0 36 24 17Z', class: 'sl-alt-dish' }), s('path', { d: 'M0 17V13', class: 'sl-alt-feed' }));
  const satLbl = s('text', { x: VW / 2 + 74, y: SAT_Y + 4, class: 'sl-alt-lbl' }, 'satellite');
  const orbitLbl = s('text', { x: 20, y: 22, class: 'sl-alt-lbl' }, 'Orbit height H = 1336 km above the reference level');
  const notScale = s('text', { x: VW - 14, y: VH - 8, class: 'sl-alt-lbl', 'text-anchor': 'end' }, 'height exaggerated, not to scale');
  svg.append(defsA, s('rect', { width: VW, height: VH, fill: 'url(#sl-sky)' }), sea, seaLine, refLine, heightArrow, heightLbl, heightTag, rangeArrow, rangeLbl, pulses, satG, satLbl, orbitLbl, notScale);

  function drawSurface(): void {
    const { height } = info();
    const y = surfaceY(height);
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (VW / 8) * i);
    const pts = xs.map((x, i) => [x, y + Math.sin(i * 1.7) * 3 + (i === 4 ? 0 : 0)] as const);
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      d += `C${(x0 + (x1 - x0) / 2).toFixed(1)} ${y0.toFixed(1)} ${(x0 + (x1 - x0) / 2).toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    seaLine.setAttribute('d', d);
    sea.setAttribute('d', `${d}V${VH}H0Z`);
    const cx = VW / 2;
    const yS = y + Math.sin(4 * 1.7) * 3;
    pulses.setAttribute('transform', `translate(${cx} ${(SAT_Y + 40 + yS) / 2})`);
    // range arrow from satellite dish to surface
    rangeArrow.setAttribute('d', `M${cx + 36} ${SAT_Y + 38}V${yS - 2}`);
    rangeLbl.setAttribute('x', String(cx + 44)); rangeLbl.setAttribute('y', String((SAT_Y + 34 + yS) / 2 + 4));
    rangeLbl.textContent = 'range r = c × t ÷ 2';
    // height arrow from reference to surface
    const hx = cx - 86;
    heightArrow.setAttribute('d', `M${hx} ${REF_Y}V${Math.abs(yS - REF_Y) < 8 ? REF_Y - 8 : yS}`);
    heightLbl.setAttribute('x', String(hx - 8)); heightLbl.setAttribute('y', String(Math.min(REF_Y, yS) - 8));
    heightLbl.setAttribute('text-anchor', 'end');
    heightLbl.textContent = `h = ${sgn(height, 2)} m`;
    // eddy target tick
    const ty = surfaceY(TARGET_H);
    heightTag.replaceChildren(
      s('path', { d: `M${VW - 128} ${ty}H${VW - 14}`, class: 'sl-alt-targetline' }),
      s('text', { x: VW - 14, y: ty - 6, 'text-anchor': 'end' }, `eddy: +${TARGET_H.toFixed(2)} m`));
    svg.classList.toggle('is-match', Math.abs(height - TARGET_H) <= TOL);
  }

  // ------------------------------------------------------------------ delay controls
  const slider = h('input', { type: 'range', min: -8, max: 8, step: 0.05, value: offsetNs, id: 'sl-alt-slider', 'aria-describedby': 'sl-alt-sd' });
  const sliderLab = h('label', { for: 'sl-alt-slider', class: 'sl-slab' }, 'Echo delay offset, ', h('span', { class: 'sl-mono' }, 'Δt in nanoseconds'));
  const rT = readout('Echo delay  t', 'ns');
  const rR = readout('Range  r = c × t ÷ 2', 'm');
  const rH = readout('Height  h = H − r', 'm', 'lg');
  const matchLine = h('p', { class: 'sl-matchline', 'aria-live': 'polite' });
  const sd = h('p', { class: 'sl-muted', id: 'sl-alt-sd' },
    'Orbit height H = 1 336 000.00 m, c = 299 792 458 m/s. One nanosecond of echo delay is about 15 cm of range. Real processing also corrects for the atmosphere, tides and waves.');
  const delayCard = h('div', { class: 'sl-card sl-alt-ctl' }, sliderLab, slider,
    h('div', { class: 'sl-slider-ends' }, h('span', null, 'sea higher (shorter echo)'), h('span', null, 'sea lower (longer echo)')),
    rT.el, rR.el, rH.el, matchLine, sd);

  function updateDelay(): void {
    const { t, range, height } = info();
    rT.set(grp(t * 1e9, 1));
    rR.set(grp(range, 2));
    rH.set(sgn(height, 2), Math.abs(height - TARGET_H) <= TOL ? 'ok' : '');
    const ok = Math.abs(height - TARGET_H) <= TOL;
    matchLine.textContent = ok ? 'Matched: this delay gives the eddy height.' : `Goal: ${sgn(TARGET_H, 2)} m (within 3 cm). Now ${sgn(height - TARGET_H, 2)} m away.`;
    matchLine.className = `sl-matchline ${ok ? 'is-ok' : ''}`;
    slider.setAttribute('aria-valuetext', `Delay offset ${offsetNs.toFixed(2)} nanoseconds, height ${sgn(height, 2)} metres`);
    drawSurface();
    if (ok && !found) { found = true; state.flags.found = true; env.save(); env.announce('Matched the eddy height.'); checkProgress(); }
  }
  slider.addEventListener('input', () => { offsetNs = Number(slider.value); updateDelay(); });

  // ------------------------------------------------------------------ averaging demo
  const CW = 300, CH = 200, PL = 34, PB = 34, PT = 18, PR = 8;
  const scatter = s('svg', { class: 'sl-chart', viewBox: `0 0 ${CW} ${CH}`, role: 'img', 'aria-label': 'Simulated height measurements as dots, with the running mean line and its standard error band.' });
  const se = s('svg', { class: 'sl-chart', viewBox: `0 0 ${CW} ${CH}`, role: 'img', 'aria-label': 'Standard error against number of measurements. It falls as one over the square root of n.' });
  const px = (i: number) => PL + (i / NMAX) * (CW - PL - PR);
  const yCm = (cm: number) => PT + (1 - (cm + 10) / 20) * (CH - PT - PB);
  const axes = () => {
    const g = s('g', { class: 'sl-axes' });
    for (const v of [-9, -6, -3, 0, 3, 6, 9]) g.append(s('path', { d: `M${PL} ${yCm(v)}H${CW - PR}`, class: v === 0 ? 'zero' : '' }), s('text', { x: PL - 5, y: yCm(v) + 3, 'text-anchor': 'end' }, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`));
    for (const v of [0, 100, 200, 300, 400]) g.append(s('text', { x: px(v), y: CH - PB + 13, 'text-anchor': 'middle' }, String(v)));
    g.append(s('text', { x: (PL + CW - PR) / 2, y: CH - 3, 'text-anchor': 'middle', class: 'ttl' }, 'measurement number'), s('text', { x: 4, y: 10, class: 'ttl' }, 'error, cm'));
    return g;
  };
  const dots = s('g', { class: 'sl-dots' });
  const meanLine = s('path', { class: 'sl-mean', fill: 'none' });
  const seBand = s('path', { class: 'sl-seband' });
  const trueLine = s('path', { d: `M${PL} ${yCm(0)}H${CW - PR}`, class: 'sl-true' });
  scatter.append(axes(), seBand, trueLine, dots, meanLine);

  // standard error plot (mm vs n)
  const ySe = (mm: number) => PT + (1 - clamp(mm, 0, 32) / 32) * (CH - PT - PB);
  const seAxes = s('g', { class: 'sl-axes' });
  for (const v of [0, 10, 20, 30]) seAxes.append(s('path', { d: `M${PL} ${ySe(v)}H${CW - PR}` }), s('text', { x: PL - 5, y: ySe(v) + 3, 'text-anchor': 'end' }, String(v)));
  for (const v of [0, 100, 200, 300, 400]) seAxes.append(s('text', { x: px(v), y: CH - 8, 'text-anchor': 'middle' }, String(v)));
  seAxes.append(s('text', { x: PL, y: CH - 0, class: 'ttl' }, 'number of measurements, n'), s('text', { x: 4, y: 8, class: 'ttl' }, 'standard error, mm'));
  let theory = '';
  for (let i = 1; i <= NMAX; i += 3) theory += `${i === 1 ? 'M' : 'L'}${px(i).toFixed(1)} ${ySe(SIGMA * 1000 / Math.sqrt(i)).toFixed(1)}`;
  const seTheory = s('path', { d: theory, class: 'sl-setheory', fill: 'none' });
  const seMeas = s('path', { class: 'sl-semeas', fill: 'none' });
  const seDot = s('circle', { r: 4, class: 'sl-sedot', cx: -10, cy: -10 });
  se.append(seAxes, seTheory, seMeas, seDot);

  const rN = readout('Measurements, n', '');
  const rMean = readout('Mean height', 'm');
  const rSE = readout('Standard error', 'mm', 'lg');
  const rTheory = readout('Theory: 30 mm ÷ √n', 'mm');
  const b = (label: string, k: number, cls = '') => {
    const btn = h('button', { type: 'button', class: `sl-btn ${cls}` }, label);
    btn.addEventListener('click', () => { n = Math.min(NMAX, n + k); updateAvg(); });
    return btn;
  };
  const reset = h('button', { type: 'button', class: 'sl-btn' }, 'Reset');
  reset.addEventListener('click', () => { n = 0; updateAvg(); });
  const goal = h('p', { class: 'sl-muted', id: 'sl-alt-goal' });

  function updateAvg(): void {
    dots.replaceChildren(...meas.slice(0, n).map((m, i) => s('circle', { cx: px(i + 1).toFixed(1), cy: yCm((m - TARGET_H) * 100).toFixed(1), r: 1.9 })));
    let md = '', bd = '', up = '', sd2 = '', mm = '';
    const st = stats(meas.slice(0, n));
    for (let i = 2; i <= n; i++) {
      const si = stats(meas.slice(0, i));
      const mcm = (si.mean - TARGET_H) * 100;
      md += `${md ? 'L' : 'M'}${px(i).toFixed(1)} ${yCm(mcm).toFixed(1)}`;
      up += `${up ? 'L' : 'M'}${px(i).toFixed(1)} ${yCm(mcm + si.se * 100).toFixed(1)}`;
      sd2 = `L${px(i).toFixed(1)} ${yCm(mcm - si.se * 100).toFixed(1)}` + sd2;
      mm += `${mm ? 'L' : 'M'}${px(i).toFixed(1)} ${ySe(si.se * 1000).toFixed(1)}`;
    }
    bd = up && sd2 ? `${up}${sd2}Z` : '';
    meanLine.setAttribute('d', md); seBand.setAttribute('d', bd); seMeas.setAttribute('d', mm);
    if (n >= 2) { seDot.setAttribute('cx', px(n).toFixed(1)); seDot.setAttribute('cy', ySe(st.se * 1000).toFixed(1)); } else { seDot.setAttribute('cx', '-10'); }
    rN.set(String(n));
    rMean.set(n ? fmt(st.mean, n >= 30 ? 3 : 2) : '–');
    rSE.set(n >= 2 ? fmt(st.se * 1000, 1) : '–', n >= 100 ? 'ok' : '');
    rTheory.set(n >= 1 ? fmt((SIGMA * 1000) / Math.sqrt(n), 1) : '–');
    goal.textContent = n >= 100
      ? `With ${n} readings the mean is known to about ${fmt(st.se * 1000, 0)} mm, ten times tighter than one reading (30 mm).`
      : `Take at least 100 readings (${Math.max(0, 100 - n)} to go) to see how far the error can shrink.`;
    if (n >= 100 && !avg100) { avg100 = true; state.flags.avg100 = true; env.save(); env.announce('100 measurements taken. The standard error is now about 3 millimetres.'); checkProgress(); }
  }

  const avgCard = h('div', { class: 'sl-card sl-alt-avg' },
    h('div', { class: 'sl-card-k' }, 'Averaging many measurements'),
    h('p', { class: 'sl-muted', style: 'margin:6px 0 10px' }, 'One reading of the same patch of sea scatters by about ±3 cm. Press the buttons to take more readings and watch the mean settle.'),
    h('div', { class: 'sl-actions' }, b('Take 1', 1), b('Take 10', 10), b('Take 100', 100, 'sl-btn--accent'), reset),
    h('div', { class: 'sl-charts' },
      h('figure', { class: 'sl-fig' }, scatter, h('figcaption', null, 'Each dot is one simulated reading. The line is the running mean, the band its standard error.')),
      h('figure', { class: 'sl-fig' }, se, h('figcaption', null, 'Measured standard error (solid) follows the 1/√n curve (dashed).'))),
    h('div', { class: 'sl-ro-row' }, rN.el, rMean.el, rSE.el, rTheory.el),
    goal,
    dataTableToggle('First 20 simulated readings (m) and the running mean', ['n', 'reading (m)', 'mean (m)', 'std error (mm)'], () => {
      const rows: (string | number)[][] = [];
      for (let i = 1; i <= Math.min(20, Math.max(n, 1)); i++) { const st2 = stats(meas.slice(0, i)); rows.push([i, meas[i - 1].toFixed(3), st2.mean.toFixed(3), Number.isNaN(st2.se) ? '–' : (st2.se * 1000).toFixed(1)]); }
      return rows;
    }),
    h('p', { class: 'sl-sim' }, h('strong', null, 'Simulation. '), 'These readings are random numbers (spread σ = 3 cm, seeded so everyone sees the same run). They are not real altimeter data.'));

  // ------------------------------------------------------------------ where does it look?
  const daysSlider = h('input', { type: 'range', min: 0.25, max: 9.9, step: 0.05, value: days, id: 'sl-alt-days' });
  const daysLab = h('label', { for: 'sl-alt-days', class: 'sl-slab' }, 'Days of ground tracks drawn on the globe');
  const rDays = readout('Time covered', 'days');
  const rOrb = readout('Orbits flown', '');
  const rGap = readout('Widest gap between tracks at the equator', 'km');
  const rLat = readout('Highest latitude ever reached', '°');
  const fullBtn = h('button', { type: 'button', class: 'sl-btn' }, 'Full 9.9-day cycle');
  fullBtn.addEventListener('click', () => { daysSlider.value = '9.9'; days = 9.9; updateTracks(); });
  const jason = SATELLITES.jason3;
  let gapPending = 0;
  function updateTracks(): void {
    const t1 = winStart + Math.min(days, JASON_REPEAT_S / DAY_S) * DAY_S;
    globe.add({ kind: 'track', id: 'tracks', orbit: jason.orbit, t0: winStart, t1, stepS: 40, color: '#ffb547', width: 1.5, opacity: 0.95 });
    rDays.set(fmt(days, 2));
    rOrb.set(fmt((days * DAY_S) / jason.orbit.periodS, 0));
    rLat.set(fmt(jason.orbit.inclDeg, 1));
    if (!gapPending) gapPending = requestAnimationFrame(() => {
      gapPending = 0;
      const lons = equatorCrossingLons(jason.orbit, winStart, t1);
      rGap.set(days < 0.6 ? '> 1000' : grp(maxEquatorGapKm(lons), 0));
    });
  }
  daysSlider.addEventListener('input', () => { days = Number(daysSlider.value); updateTracks(); });
  const tracksCard = h('div', { class: 'sl-card' },
    h('div', { class: 'sl-card-k' }, 'Where does it look?'),
    h('p', { class: 'sl-muted', style: 'margin:6px 0 8px' }, 'A nadir altimeter measures only straight below it, so the data is thin lines, not a picture. Drag the slider, or press the button, and watch the lines fill in on the globe.'),
    daysLab, daysSlider, h('div', { class: 'sl-actions', style: 'margin-top:6px' }, fullBtn),
    h('div', { class: 'sl-ro-row' }, rDays.el, rOrb.el, rGap.el, rLat.el),
    h('p', { class: 'sl-muted' }, 'The dashed lines on the globe mark 66° N and S. Nothing beyond them is ever measured, so the polar oceans and the ice edge are out of reach for this satellite.'));

  // ------------------------------------------------------------------ checklist and assembly
  const ck1 = h('li', null, 'Find the delay for the eddy'), ck2 = h('li', null, 'Take 100 measurements');
  const checklist = h('ul', { class: 'sl-checklist', 'aria-label': 'Goals' }, ck1, ck2);
  function checkProgress(): void {
    ck1.classList.toggle('on', found); ck2.classList.toggle('on', avg100);
    if (found && avg100) env.interactionDone();
  }
  const task = h('p', { class: 'sl-task' }, h('span', { class: 'sl-tag' }, 'Try it'), 'A warm ocean eddy raises the sea surface by about 40 cm. Slide the echo delay until the height matches it, then take 100 measurements.');
  host.append(task, checklist,
    h('div', { class: 'sl-alt-grid' }, h('figure', { class: 'sl-alt-fig' }, svg), delayCard),
    avgCard, tracksCard);

  updateDelay(); updateAvg(); checkProgress();
  void NS_PER_M;

  // dev/test hook
  const dbg = (globalThis as unknown as { __slDebug?: Record<string, unknown> }).__slDebug;
  if (dbg) dbg.altimeter = { offset(v: number) { offsetNs = v; slider.value = String(v); updateDelay(); }, take(k: number) { n = Math.min(NMAX, n + k); updateAvg(); }, days(d: number) { days = d; daysSlider.value = String(d); updateTracks(); } };

  let first = true;
  return {
    enter() {
      if (first) { first = false; globe.setSimTime(0); globe.setSunDeclination(-12); globe.setTimeScale(60); winStart = 0; }
      globe.add({ kind: 'sat', id: 'j3', label: 'Sentinel-6 / Jason-3 · 1336 km', orbit: jason.orbit, color: '#ffb547', model: 'altimeter', size: 1.3 });
      globe.add({ kind: 'latline', id: 'n66', latDeg: 66, color: '#9fb0d4', label: '66° N' });
      globe.add({ kind: 'latline', id: 's66', latDeg: -66, color: '#9fb0d4', label: '66° S' });
      updateTracks();
      globe.focus(-4, 150, 3.5, true);
      env.setLegend([{ color: '#ffb547', label: 'Ground tracks (nadir only)', kind: 'line' }, { color: '#9fb0d4', label: '66° latitude limit', kind: 'line' }]);
      globe.setDescription('Thin ground tracks of a radar altimeter satellite that never goes beyond 66 degrees north or south.');
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        const end = winStart + Math.min(days, JASON_REPEAT_S / DAY_S) * DAY_S;
        if (globe.getSimTime() > end) globe.setSimTime(winStart);
      }, 400);
    },
    leave() { window.clearInterval(timer); },
    dispose() { window.clearInterval(timer); if (gapPending) cancelAnimationFrame(gapPending); },
  };
};
