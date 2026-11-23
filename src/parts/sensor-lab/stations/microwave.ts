/** Station 4: passive microwave -> sea-ice concentration and extent. */
import { SATELLITES, DAY_S, ANTARCTIC_CAP_LAT } from '../../../globe';
import type { StationFactory } from '../station';
import {
  PIXEL_AREA_KM2, PIXEL_KM, STANDARD_THRESHOLD, TB_TIE, concentrationFromTb, extentCurve, generateIceField, iceAreaKm2, iceCount, mulberry32,
  valueNoiseField,
} from '../physics';
import { clamp, dataTableToggle, fmt, grp, h, readout, s } from '../ui';

const RAMP: [number, number, number][] = [[9, 27, 58], [34, 88, 156], [96, 160, 214], [196, 228, 250], [250, 253, 255]];
function iceColour(c: number): [number, number, number] {
  const x = clamp(c / 100, 0, 1) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  return [0, 1, 2].map((k) => RAMP[i][k] + (RAMP[i + 1][k] - RAMP[i][k]) * f) as [number, number, number];
}

export const createMicrowaveStation: StationFactory = (env) => {
  const { host, state, globe } = env;
  const field = generateIceField();
  const N = field.n;
  let threshold = STANDARD_THRESHOLD;
  let sensor: 'mw' | 'opt' = 'mw';
  let polarNight = false, cloudy = false;
  let cursor = { x: Math.round(N * 0.5), y: Math.round(N * 0.5 - 118) };
  const read = new Set<number>();
  let triedThreshold = !!state.flags.triedThreshold;
  let sawNight = !!state.flags.sawNight;
  let view: 'conc' | 'extent' = 'conc';
  const cloudNoise = valueNoiseField(5150, N);
  const curveTh = Array.from({ length: 101 }, (_, i) => i);
  const curve = extentCurve(field, curveTh);

  // ------------------------------------------------------------------ canvas map
  const SZ = N;
  const canvas = h('canvas', { class: 'sl-ice-canvas', width: SZ, height: SZ, tabindex: 0, role: 'application', 'aria-label': 'Sea ice around Antarctica on a 25 kilometre grid. Use the arrow keys to move the reading cursor; hold Shift to move 10 pixels.' });
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(SZ, SZ);
  const crossG = s('g', null, s('circle', { class: 'ring', r: 7 }), s('path', { class: 'hair', d: 'M-14 0H-9M9 0H14M0 -14V-9M0 9V14' }));
  const cross = s('svg', { class: 'sl-ice-cross', viewBox: `0 0 ${SZ} ${SZ}`, 'aria-hidden': 'true' }, crossG);
  const stage = h('div', { class: 'sl-ice-stage' }, canvas, cross);
  const overlay = h('div', { class: 'sl-ice-overlay', hidden: true }, h('strong', null, 'NO DATA'), h('span', null, ''));

  function paint(): void {
    const d = img.data;
    const opt = sensor === 'opt';
    for (let i = 0; i < N * N; i++) {
      const c = field.conc[i];
      let r: number, gr: number, b: number;
      if (c < 0) { r = 52; gr = 60; b = 80; }
      else if (opt && polarNight) { r = 3; gr = 5; b = 10; }
      else if (opt && cloudy && cloudNoise[i] > 0.52) { const k = clamp((cloudNoise[i] - 0.52) * 9, 0, 1); r = 20 + 20 * k; gr = 30 + 25 * k; b = 52 + 30 * k; if (((i % N) + Math.floor(i / N)) % 6 < 2) { r += 30; gr += 38; b += 55; } }
      else if (view === 'extent') { if (c >= threshold) { r = 232; gr = 244; b = 255; } else { r = 10; gr = 22; b = 44; } }
      else { [r, gr, b] = iceColour(c); }
      const j = i * 4;
      d[j] = r; d[j + 1] = gr; d[j + 2] = b; d[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // pole marker + 1000 km scale
    g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(14, N - 14); g.lineTo(14 + 40, N - 14); g.moveTo(14, N - 18); g.lineTo(14, N - 10); g.moveTo(54, N - 18); g.lineTo(54, N - 10); g.stroke();
    g.fillStyle = '#fff'; g.font = '600 9px ui-monospace, Menlo, monospace'; g.fillText('1000 km', 14, N - 22);
  }

  // ------------------------------------------------------------------ pixel readout
  const rTbH = readout('Brightness temp, 19 GHz horizontal', 'K');
  const rTbV = readout('Brightness temp, 19 GHz vertical', 'K');
  const rConc = readout('Derived ice concentration', '%', 'lg');
  const counted = h('p', { class: 'sl-counted', 'aria-live': 'polite' });
  const where = h('p', { class: 'sl-muted' });
  // brightness-temperature gauge between the two tie points
  const GW = 300, GH = 54;
  const gx = (k: number) => 14 + ((k - 90) / (260 - 90)) * (GW - 28);
  const gauge = s('svg', { class: 'sl-gauge', viewBox: `0 0 ${GW} ${GH}`, role: 'img', 'aria-label': 'Where this pixel sits between open water and solid ice brightness temperatures.' },
    s('rect', { x: gx(TB_TIE.water.h), y: 22, width: gx(TB_TIE.ice.h) - gx(TB_TIE.water.h), height: 6, rx: 3, class: 'trk' }),
    s('circle', { cx: gx(TB_TIE.water.h), cy: 25, r: 5, class: 'tie w' }), s('circle', { cx: gx(TB_TIE.ice.h), cy: 25, r: 5, class: 'tie i' }),
    s('text', { x: gx(TB_TIE.water.h) - 8, y: 48, 'text-anchor': 'start' }, `open water ${TB_TIE.water.h} K`),
    s('text', { x: gx(TB_TIE.ice.h) + 8, y: 48, 'text-anchor': 'end' }, `solid ice ${TB_TIE.ice.h} K`));
  const marker = s('g', { class: 'mk' }, s('path', { d: 'M0 14L-5 5H5z' }), s('text', { y: 4, 'text-anchor': 'middle' }, ''));
  gauge.append(marker);

  // magnifier: the 9 x 9 pixels around the cursor, with numbers
  const MAG = 9, MC = 22;
  const mag = h('canvas', { class: 'sl-mag', width: MAG * MC, height: MAG * MC, 'aria-hidden': 'true' });
  const mg = mag.getContext('2d')!;
  function drawMag(): void {
    mg.clearRect(0, 0, MAG * MC, MAG * MC);
    mg.font = '600 9px ui-monospace, Menlo, monospace'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
    for (let j = 0; j < MAG; j++) for (let i = 0; i < MAG; i++) {
      const x = cursor.x + i - 4, y = cursor.y + j - 4;
      const inside = x >= 0 && y >= 0 && x < N && y < N;
      const c = inside ? field.conc[y * N + x] : -1;
      let fill = '#0a0f1b';
      if (c < 0) fill = '#343c50'; else if (view === 'extent') fill = c >= threshold ? '#e8f4ff' : '#0a162c'; else { const [r, gg, b] = iceColour(c); fill = `rgb(${r | 0},${gg | 0},${b | 0})`; }
      mg.fillStyle = fill; mg.fillRect(i * MC, j * MC, MC - 1, MC - 1);
      if (c >= 0) { mg.fillStyle = (view === 'extent' ? c >= threshold : c > 55) ? '#0b1424' : '#e8eefc'; mg.fillText(String(Math.round(c)), i * MC + MC / 2, j * MC + MC / 2); }
    }
    mg.strokeStyle = '#ffb547'; mg.lineWidth = 2; mg.strokeRect(4 * MC + 1, 4 * MC + 1, MC - 3, MC - 3);
  }

  function readPixel(): void {
    const idx = cursor.y * N + cursor.x;
    const c = field.conc[idx];
    crossG.setAttribute('transform', `translate(${cursor.x + 0.5} ${cursor.y + 0.5}) scale(${SZ / (canvas.clientWidth || SZ)})`);
    const km = Math.hypot((cursor.x - (N - 1) / 2) * PIXEL_KM, (cursor.y - (N - 1) / 2) * PIXEL_KM);
    if (c < 0) {
      rTbH.set('–', 'muted'); rTbV.set('–', 'muted'); rConc.set('LAND', 'muted');
      counted.textContent = 'Antarctic continent and ice sheet: masked out of the sea-ice count.';
      marker.setAttribute('transform', 'translate(-50 0)');
      where.textContent = `${grp(km, 0)} km from the pole.`;
    } else if (sensor === 'opt' && (polarNight || (cloudy && cloudNoise[idx] > 0.52))) {
      rTbH.set('–', 'muted'); rTbV.set('–', 'muted'); rConc.set('NO DATA', 'bad');
      counted.textContent = polarNight ? 'An optical camera records nothing in the polar night.' : 'Cloud covers this pixel, so the camera cannot see the surface.';
      marker.setAttribute('transform', 'translate(-50 0)');
      where.textContent = `${grp(km, 0)} km from the pole.`;
    } else {
      const th = field.tbH[idx], tv = field.tbV[idx];
      const derived = concentrationFromTb(th) * 100;
      rTbH.set(fmt(th, 1)); rTbV.set(fmt(tv, 1));
      rConc.set(fmt(derived, 0), derived >= threshold ? 'ok' : '');
      counted.textContent = derived >= threshold ? `${fmt(derived, 0)}% is at least ${threshold}%: this pixel counts as ice-covered.` : `${fmt(derived, 0)}% is below ${threshold}%: this pixel is counted as open water.`;
      const mx = gx(clamp(th, 90, 260));
      marker.setAttribute('transform', `translate(${mx} 0)`);
      marker.querySelector('text')!.textContent = '';
      where.textContent = `${grp(km, 0)} km from the pole. Emissivity: ice emits strongly, open water weakly, so the same ground temperature looks very different in microwaves.`;
    }
    read.add(idx);
    drawMag();
    checkGoals();
  }

  // ------------------------------------------------------------------ extent card
  const slider = h('input', { type: 'range', min: 1, max: 100, step: 1, value: threshold, id: 'sl-mw-th', 'aria-describedby': 'sl-mw-thd' });
  const sLab = h('label', { for: 'sl-mw-th', class: 'sl-slab' }, 'Concentration threshold: a pixel counts as ice-covered at or above ', h('strong', { class: 'sl-mono' }, ''));
  const stdBtn = h('button', { type: 'button', class: 'sl-btn' }, 'Back to the standard 15%');
  const viewBtns = h('div', { class: 'sl-seg', role: 'group', 'aria-label': 'Map display' });
  const mkView = (v: 'conc' | 'extent', label: string) => {
    const b = h('button', { type: 'button', class: 'sl-segbtn', 'aria-pressed': String(v === view) }, label);
    b.addEventListener('click', () => { view = v; viewBtns.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); paint(); drawMag(); });
    return b;
  };
  viewBtns.append(mkView('conc', 'Concentration'), mkView('extent', 'Extent (counted pixels)'));
  const rCount = readout('Pixels counted', '');
  const rExt = readout('Sea-ice extent = pixels × 625 km²', 'million km²', 'lg');
  const rDiff = readout('Compared with the standard 15% rule', 'million km²');
  const rArea = readout('Ice area (concentration × pixel area), for comparison', 'million km²');
  const extNote = h('p', { class: 'sl-muted', id: 'sl-mw-thd', 'aria-live': 'polite' });

  const CW = 560, CH = 200, PL = 44, PR = 14, PT = 14, PB = 36;
  const ex = (t: number) => PL + (t / 100) * (CW - PL - PR);
  const ey = (v: number) => PT + (1 - v / 28) * (CH - PT - PB);
  const chart = s('svg', { class: 'sl-chart', viewBox: `0 0 ${CW} ${CH}`, role: 'img', 'aria-label': 'Sea-ice extent against concentration threshold. Extent falls as the threshold rises. The standard 15 percent is marked.' });
  const axs = s('g', { class: 'sl-axes' });
  for (const v of [0, 7, 14, 21, 28]) axs.append(s('path', { d: `M${PL} ${ey(v)}H${CW - PR}` }), s('text', { x: PL - 5, y: ey(v) + 3, 'text-anchor': 'end' }, String(v)));
  for (const v of [0, 25, 50, 75, 100]) axs.append(s('text', { x: ex(v), y: CH - PB + 12, 'text-anchor': 'middle' }, `${v}%`));
  axs.append(s('text', { x: (PL + CW - PR) / 2, y: CH - 4, 'text-anchor': 'middle', class: 'ttl' }, 'threshold'), s('text', { x: 4, y: 8, class: 'ttl' }, 'million km²'));
  const cpath = s('path', { class: 'sl-semeas', fill: 'none', d: curve.slice(1).map((v, i) => `${i ? 'L' : 'M'}${ex(i + 1).toFixed(1)} ${ey(v / 1e6).toFixed(1)}`).join('') });
  const stdLine = s('path', { class: 'sl-true', d: `M${ex(STANDARD_THRESHOLD)} ${PT}V${CH - PB}` });
  const stdTxt = s('text', { x: ex(STANDARD_THRESHOLD) + 4, y: PT + 9, class: 'sl-vtag n' }, 'standard 15%');
  const cur = s('circle', { r: 5, class: 'sl-sedot' });
  chart.append(axs, stdLine, stdTxt, cpath, cur);

  function updateExtent(): void {
    const ext = curve[threshold];
    const std = curve[STANDARD_THRESHOLD];
    const cnt = iceCount(field, threshold);
    (sLab.querySelector('strong') as HTMLElement).textContent = `${threshold}%`;
    slider.setAttribute('aria-valuetext', `${threshold} percent`);
    rCount.set(grp(cnt, 0));
    rExt.set(fmt(ext / 1e6, 2), threshold === STANDARD_THRESHOLD ? 'ok' : 'warn');
    const diff = (ext - std) / 1e6;
    rDiff.set(threshold === STANDARD_THRESHOLD ? '0.00 (the standard)' : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), 2)} (${diff > 0 ? '+' : '−'}${fmt(Math.abs(100 * diff * 1e6 / std), 1)}%)`, threshold === STANDARD_THRESHOLD ? '' : 'warn');
    rArea.set(fmt(iceAreaKm2(field) / 1e6, 2), 'muted');
    cur.setAttribute('cx', ex(threshold).toFixed(1)); cur.setAttribute('cy', ey(ext / 1e6).toFixed(1));
    extNote.textContent = threshold === STANDARD_THRESHOLD
      ? 'This is the rule the national snow and ice data centres use: count a pixel as ice-covered at 15% or more. Now try other values.'
      : `If a different rule were used, the same ice would give a different number: ${diff > 0 ? 'more' : 'less'} by ${fmt(Math.abs(diff), 1)} million km². That is why the rule must stay fixed from year to year.`;
    if (threshold !== STANDARD_THRESHOLD && !triedThreshold) { triedThreshold = true; state.flags.triedThreshold = true; env.save(); checkGoals(); }
    paint(); drawMag();
  }
  slider.addEventListener('input', () => { threshold = Number(slider.value); updateExtent(); readPixel(); });
  stdBtn.addEventListener('click', () => { threshold = STANDARD_THRESHOLD; slider.value = String(threshold); updateExtent(); readPixel(); });

  const extCard = h('div', { class: 'sl-card' },
    h('div', { class: 'sl-card-k' }, 'Concentration to extent'),
    h('p', { class: 'sl-muted', style: 'margin:6px 0 8px' }, 'Every pixel is 25 km by 25 km, which is 625 km². Extent is the area of all ocean pixels with at least the threshold concentration. The standard threshold is 15%.'),
    sLab, slider, h('div', { class: 'sl-actions', style: 'margin-top:6px' }, stdBtn), 
    h('div', { class: 'sl-ro-row' }, rCount.el, rExt.el, rDiff.el), extNote,
    h('figure', { class: 'sl-fig', style: 'margin-top:8px' }, chart, h('figcaption', null, 'Extent for every possible threshold in this illustrative grid. Moving the threshold moves the result by millions of km².')),
    dataTableToggle('Sea-ice extent of the illustrative grid for several thresholds', ['threshold %', 'pixels', 'extent million km²'], () => [5, 15, 30, 50, 75, 90].map((t) => [t, grp(curve[t] / PIXEL_AREA_KM2, 0), (curve[t] / 1e6).toFixed(2)])),
    h('p', { class: 'sl-sim' }, h('strong', null, 'Illustrative. '), 'This grid is a simulated map built for the lab (an Antarctic-sized ice pack with a soft edge and a few holes), not a real day. Real sea-ice maps from NSIDC use the same method on real brightness temperatures.'));

  // ------------------------------------------------------------------ sensor / cloud / night
  const sensorBtns = h('div', { class: 'sl-seg', role: 'group', 'aria-label': 'Sensor' });
  const mkSensor = (v: 'mw' | 'opt', label: string) => {
    const b = h('button', { type: 'button', class: 'sl-segbtn', 'aria-pressed': String(v === sensor) }, label);
    b.addEventListener('click', () => { sensor = v; sensorBtns.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); applySensor(); });
    return b;
  };
  sensorBtns.append(mkSensor('mw', 'Microwave radiometer'), mkSensor('opt', 'Optical camera'));
  const nightBox = h('input', { type: 'checkbox', id: 'sl-mw-night' });
  const cloudBox = h('input', { type: 'checkbox', id: 'sl-mw-cloud' });
  nightBox.addEventListener('change', () => { polarNight = nightBox.checked; applySensor(); });
  cloudBox.addEventListener('change', () => { cloudy = cloudBox.checked; applySensor(); });
  const sensorNote = h('p', { class: 'sl-muted', 'aria-live': 'polite' });
  function applySensor(): void {
    if (sensor === 'opt' && polarNight && !sawNight) { sawNight = true; state.flags.sawNight = true; env.save(); }
    const blocked = sensor === 'opt' && (polarNight || cloudy);
    overlay.hidden = !(sensor === 'opt' && polarNight);
    overlay.querySelector('span')!.textContent = 'Polar night: no sunlight for the camera';
    sensorNote.textContent = sensor === 'mw'
      ? (polarNight || cloudy ? 'The microwave map is unchanged. Microwaves pass through cloud, and the surface emits them day and night.' : 'Microwave radiometer: measures energy the surface emits. Try adding cloud and polar night.')
      : (blocked ? (polarNight ? 'The optical camera needs sunlight: in polar night it sees nothing at all.' : 'Cloud blocks the optical camera. The hatched pixels are lost.') : 'Optical camera with clear skies and daylight. Now add cloud or polar night.');
    paint(); readPixel(); checkGoals();
  }
  const sensorCard = h('div', { class: 'sl-card' },
    h('div', { class: 'sl-card-k' }, 'Why microwaves for the poles?'),
    h('div', { class: 'sl-actions', style: 'margin:8px 0' }, sensorBtns,
      h('label', { class: 'sl-toggle', for: 'sl-mw-night' }, nightBox, h('span', null, 'Polar night')),
      h('label', { class: 'sl-toggle', for: 'sl-mw-cloud' }, cloudBox, h('span', null, 'Cloud'))),
    sensorNote);

  // ------------------------------------------------------------------ goals
  const g1 = h('li', null, 'Read 3 pixels'), g2 = h('li', null, 'Try another threshold'), g3 = h('li', null, 'Put the camera in polar night');
  const goals = h('ul', { class: 'sl-checklist', 'aria-label': 'Goals' }, g1, g2, g3);
  function checkGoals(): void {
    g1.classList.toggle('on', read.size >= 3); g2.classList.toggle('on', triedThreshold); g3.classList.toggle('on', sawNight);
    if (read.size >= 3 && triedThreshold && sawNight) env.interactionDone();
  }

  // ------------------------------------------------------------------ pointer and keyboard
  const toPixel = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: clamp(Math.floor(((e.clientX - r.left) / r.width) * N), 0, N - 1), y: clamp(Math.floor(((e.clientY - r.top) / r.height) * N), 0, N - 1) };
  };
  let movePending = 0;
  canvas.addEventListener('pointermove', (e) => { cursor = toPixel(e); if (!movePending) movePending = requestAnimationFrame(() => { movePending = 0; readPixel(); }); });
  canvas.addEventListener('pointerdown', (e) => { cursor = toPixel(e); readPixel(); });
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    cursor = { x: clamp(cursor.x + v[0] * step, 0, N - 1), y: clamp(cursor.y + v[1] * step, 0, N - 1) };
    readPixel();
  });

  // ------------------------------------------------------------------ assemble
  const task = h('p', { class: 'sl-task' }, h('span', { class: 'sl-tag' }, 'Try it'), 'Move the pointer over the map (or focus it and use the arrow keys) to read single pixels. Then change the threshold, and try the optical camera in polar night.');
  const mapCard = h('div', { class: 'sl-card sl-ice-card' },
    h('div', { class: 'sl-ice-top' }, h('span', { class: 'sl-card-k' }, 'Antarctic sea ice, 25 km pixels (illustrative)'), viewBtns),
    h('div', { class: 'sl-ice-wrap' }, h('div', { class: 'sl-ice-mapcol' }, stage, overlay,
      h('div', { class: 'sl-cbar' },
        h('div', { class: 'sl-cbar-grad', style: `background:linear-gradient(90deg,${[0, 25, 50, 75, 100].map((c) => { const [r, gg, b] = iceColour(c); return `rgb(${r | 0},${gg | 0},${b | 0})`; }).join(',')})` }),
        h('div', { class: 'sl-cbar-ticks' }, ...['0%', '25%', '50%', '75%', '100%'].map((t) => h('span', null, t))),
        h('div', { class: 'sl-cbar-l' }, 'Sea-ice concentration (grey = Antarctic land and ice sheet)'))),
      h('div', { class: 'sl-ice-side' },
        h('div', { class: 'sl-card-k' }, 'Pixel under the cursor'), mag, rTbH.el, rTbV.el, rConc.el, counted, where, gauge)));
  host.append(task, goals, mapCard, extCard, sensorCard);

  const dbg = (globalThis as unknown as { __slDebug?: Record<string, unknown> }).__slDebug;
  if (dbg) dbg.microwave = {
    cursor(x: number, y: number) { cursor = { x, y }; readPixel(); }, threshold(v: number) { threshold = v; slider.value = String(v); updateExtent(); readPixel(); },
    sensor(v: 'mw' | 'opt', night: boolean, cloud: boolean) { sensor = v; polarNight = night; cloudy = cloud; nightBox.checked = night; cloudBox.checked = cloud; sensorBtns.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String((i === 0) === (v === 'mw')))); applySensor(); },
    view(v: 'conc' | 'extent') { view = v; paint(); drawMag(); },
  };

  const rng = mulberry32(1); void rng;
  updateExtent(); applySensor(); readPixel(); read.clear(); checkGoals();
  const sat = SATELLITES.amsr2;
  let first = true;
  return {
    enter() {
      if (first) { first = false; globe.setSimTime(4 * 3600); }
      globe.setSunDeclination(20); // June-like: the south pole is in polar night
      globe.setTimeScale(240);
      globe.add({ kind: 'swath', id: 'amsr', orbit: sat.orbit, t0: 0, t1: DAY_S, widthKm: sat.swathKm, stepS: 60, color: '#7cc4ff', opacity: 0.2 });
      globe.add({ kind: 'sat', id: 'amsr2', label: 'GCOM-W / AMSR2 · 700 km', orbit: sat.orbit, color: '#7cc4ff', model: 'microwave' });
      globe.add({ kind: 'region', id: 'ant', cap: { latDeg: ANTARCTIC_CAP_LAT }, color: '#ffb547', fillOpacity: 0.12, label: 'Antarctica and its sea-ice zone' });
      globe.focus(-78, 20, 4.4, true);
      env.setLegend([{ color: '#7cc4ff', label: 'One day of AMSR2 swaths (1450 km wide)', kind: 'area' }, { color: '#ffb547', label: 'Antarctic region', kind: 'area' }]);
      globe.setDescription('Wide microwave swaths cover the whole Antarctic region in a day, including the part in polar night.');
    },
    leave() { if (movePending) cancelAnimationFrame(movePending); movePending = 0; },
    dispose() { if (movePending) cancelAnimationFrame(movePending); },
  };
};
