/** Station 3: optical multispectral (Landsat 8/9) -> forest cover. */
import {
  SATELLITES, DAY_S, equatorCoverage, equatorCrossings, withPass,
} from '../../../globe';
import type { StationFactory } from '../station';
import {
  BANDS, SURFACES, TREE_NDVI_THRESHOLD, nbr, ndvi, surfaceById, surfaceNdvi, treeCover, trueColour, type SurfaceId,
} from '../physics';
import { cividisCss, dataTableToggle, fmt, h, readout, s } from '../ui';

const COLS = 14, ROWS = 9;
const LAYOUT = [
  'FFFFFFFFFFFCCF',
  'FFFFFFFFFFFCCC',
  'FFBBFFFFFFFFCF',
  'FFBBBFFFFFFFFF',
  'FFFBBFWWFFFFFF',
  'FFFFFWWFFFSSSF',
  'FFFFFWFFFSSSSF',
  'FFFFFFFFFSSSFF',
  'FFFFFFFFFFFFFF',
];
const CODE: Record<string, SurfaceId> = { F: 'forest', B: 'burnt', S: 'bare', C: 'cloud', W: 'water' };

export const createOpticalStation: StationFactory = (env) => {
  const { host, state, globe } = env;
  const grid: SurfaceId[] = LAYOUT.flatMap((r) => [...r].map((c) => CODE[c]));
  let sel = 3 * COLS + 5; // a forest pixel
  let night = false;
  let mode: 'colour' | 'ndvi' = 'colour';
  const viewed = new Set<SurfaceId>(String(state.flags.viewed ?? '').split(',').filter(Boolean) as SurfaceId[]);
  let sawNight = !!state.flags.sawNight;
  let days = 4;
  let both = false;

  // ------------------------------------------------------------------ pixel grid
  const cells: HTMLButtonElement[] = [];
  const gridEl = h('div', { class: 'sl-pgrid', role: 'grid', 'aria-label': 'Landsat scene, 14 by 9 pixels of 30 metres. Choose a pixel with the arrow keys.', style: `--cols:${COLS}` });
  for (let r = 0; r < ROWS; r++) {
    const row = h('div', { role: 'row', class: 'sl-prow' });
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const b = h('button', { type: 'button', class: 'sl-pix', role: 'gridcell', tabindex: i === sel ? 0 : -1, 'data-i': i });
      b.addEventListener('click', () => select(i));
      b.addEventListener('focus', () => { if (sel !== i) select(i, false); });
      b.addEventListener('keydown', (e) => {
        const d: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS };
        if (!(e.key in d)) return;
        e.preventDefault();
        let nx = i + d[e.key];
        if (e.key === 'ArrowLeft' && c === 0) nx = i;
        if (e.key === 'ArrowRight' && c === COLS - 1) nx = i;
        if (nx < 0 || nx >= COLS * ROWS) nx = i;
        select(nx);
        cells[nx].focus();
      });
      cells.push(b); row.append(b);
    }
    gridEl.append(row);
  }

  // ------------------------------------------------------------------ surface picker
  const picks = SURFACES.map((sf) => {
    const input = h('input', { type: 'radio', name: 'sl-opt-surf', id: `sl-opt-${sf.id}`, value: sf.id });
    const lab = h('label', { class: 'sl-surf', for: `sl-opt-${sf.id}`, style: `--c:${sf.color}` }, input, h('i', { style: `background:${trueColour(sf)}` }), h('span', null, sf.label));
    input.addEventListener('change', () => { if (input.checked) setSurface(sf.id); });
    return { sf, input, lab };
  });
  const picker = h('div', { class: 'sl-surfs', role: 'radiogroup', 'aria-label': 'Surface type of the chosen pixel' }, ...picks.map((p) => p.lab));
  const blurb = h('p', { class: 'sl-surf-blurb', 'aria-live': 'polite' });

  // ------------------------------------------------------------------ spectrum chart
  const CW = 340, CH = 250, PL = 36, PR = 10, PT = 14, PB = 40;
  const X0 = 0.4, X1 = 2.3, YMAX = 0.8;
  const px = (um: number) => PL + ((um - X0) / (X1 - X0)) * (CW - PL - PR);
  const py = (r: number) => PT + (1 - r / YMAX) * (CH - PT - PB);
  const chart = s('svg', { class: 'sl-chart sl-spec', viewBox: `0 0 ${CW} ${CH}`, role: 'img', 'aria-label': 'Reflectance spectrum of the chosen pixel across the Landsat bands.' });
  const ax = s('g', { class: 'sl-axes' });
  for (const v of [0, 0.2, 0.4, 0.6, 0.8]) ax.append(s('path', { d: `M${PL} ${py(v)}H${CW - PR}` }), s('text', { x: PL - 5, y: py(v) + 3, 'text-anchor': 'end' }, v.toFixed(1)));
  for (const v of [0.5, 1.0, 1.5, 2.0]) ax.append(s('text', { x: px(v), y: CH - PB + 28, 'text-anchor': 'middle' }, v.toFixed(1)));
  ax.append(s('text', { x: (PL + CW - PR) / 2, y: CH - 2, 'text-anchor': 'middle', class: 'ttl' }, 'wavelength, µm'), s('text', { x: 4, y: 9, class: 'ttl' }, 'reflectance'));
  // visible / NIR / SWIR zones
  const zones = s('g', { class: 'sl-zones' },
    s('rect', { x: px(0.4), y: PT, width: px(0.7) - px(0.4), height: CH - PT - PB, class: 'vis' }),
    s('text', { x: (px(0.4) + px(0.7)) / 2, y: PT + 10, 'text-anchor': 'middle' }, 'visible'),
    s('text', { x: (px(0.7) + px(1.3)) / 2, y: PT + 10, 'text-anchor': 'middle' }, 'near-infrared'),
    s('text', { x: (px(1.3) + px(2.3)) / 2, y: PT + 10, 'text-anchor': 'middle' }, 'shortwave infrared'));
  const bandG = s('g', { class: 'sl-bands' });
  const widths: Record<string, number> = { B1: 0.02, B2: 0.06, B3: 0.06, B4: 0.03, B5: 0.03, B6: 0.08, B7: 0.18 };
  BANDS.forEach((b) => {
    const w = (widths[b.id] ?? 0.04), x = px(b.um - w / 2), ww = Math.max(3, px(b.um + w / 2) - x);
    bandG.append(s('rect', { x, y: PT + 16, width: ww, height: CH - PT - PB - 16, class: `band band-${b.id}` }), s('text', { x: px(b.um), y: CH - PB + 11, 'text-anchor': 'middle' }, b.id));
  });
  const ghost = s('path', { class: 'sl-ghost', fill: 'none' });
  const curve = s('path', { class: 'sl-curve', fill: 'none' });
  const dotsG = s('g', { class: 'sl-curve-dots' });
  const redTag = s('g'), nirTag = s('g');
  chart.append(zones, bandG, ax, ghost, curve, dotsG, redTag, nirTag);

  // ------------------------------------------------------------------ readouts
  const rNdvi = readout('NDVI = (NIR − Red) ÷ (NIR + Red)', '', 'lg');
  const calc = h('p', { class: 'sl-calc sl-mono', 'aria-live': 'polite' });
  const verdict = h('p', { class: 'sl-verdict' });
  const rNbr = readout('Burn index NBR = (NIR − SWIR 2) ÷ (NIR + SWIR 2)', '');
  const rTree = readout('Tree cover of the scene', '%', 'lg');
  const treeNote = h('p', { class: 'sl-muted', 'aria-live': 'polite' });

  const nightBox = h('input', { type: 'checkbox', id: 'sl-opt-night' });
  const nightLab = h('label', { class: 'sl-toggle', for: 'sl-opt-night' }, nightBox, h('span', null, 'Night time (no Sun)'));
  nightBox.addEventListener('change', () => { night = nightBox.checked; if (night) { sawNight = true; state.flags.sawNight = true; env.save(); checkGoals(); } refresh(); });
  const modeSel = h('div', { class: 'sl-seg', role: 'group', 'aria-label': 'Scene display' });
  const mkMode = (m: 'colour' | 'ndvi', label: string) => {
    const b = h('button', { type: 'button', class: 'sl-segbtn', 'aria-pressed': String(m === mode) }, label);
    b.addEventListener('click', () => { mode = m; modeSel.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); refresh(); });
    return b;
  };
  modeSel.append(mkMode('colour', 'True colour'), mkMode('ndvi', 'NDVI map'));
  const sceneKey = h('div', { class: 'sl-scenekey', 'aria-hidden': 'true' },
    h('div', { class: 'sl-cbar-grad', style: `background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map((t) => cividisCss(t)).join(',')})` }),
    h('div', { class: 'sl-cbar-ticks' }, h('span', null, '−0.5'), h('span', null, '0'), h('span', null, `${TREE_NDVI_THRESHOLD} = tree`), h('span', null, '1.0')));

  // ------------------------------------------------------------------ logic
  const goal1 = h('li', null, 'Look at 4 different surfaces'), goal2 = h('li', null, 'Switch the scene to night');
  const goals = h('ul', { class: 'sl-checklist', 'aria-label': 'Goals' }, goal1, goal2);
  function checkGoals(): void {
    goal1.classList.toggle('on', viewed.size >= 4); goal2.classList.toggle('on', sawNight);
    if (viewed.size >= 4 && sawNight) env.interactionDone();
  }

  function select(i: number, focus = true): void {
    cells[sel].tabIndex = -1;
    sel = i;
    cells[sel].tabIndex = 0;
    if (focus && document.activeElement !== cells[sel] && host.contains(document.activeElement)) cells[sel].focus();
    noteViewed();
    refresh();
  }
  function setSurface(id: SurfaceId): void {
    grid[sel] = id;
    noteViewed();
    refresh();
  }
  function noteViewed(): void {
    const id = grid[sel];
    if (!viewed.has(id)) { viewed.add(id); state.flags.viewed = [...viewed].join(','); env.save(); checkGoals(); }
  }

  function refresh(): void {
    const id = grid[sel];
    const sf = surfaceById(id);
    // pixels
    cells.forEach((b, i) => {
      const sid = grid[i], sfi = surfaceById(sid);
      let bg: string, label: string;
      const nd = surfaceNdvi(sfi);
      if (night) { bg = '#04070d'; label = 'no data at night'; }
      else if (mode === 'ndvi') {
        if (sid === 'cloud') { bg = 'repeating-linear-gradient(135deg,#0d182c 0 4px,#33466b 4px 5px)'; label = 'cloud, no data'; }
        else { bg = cividisCss((nd + 0.5) / 1.5); label = `${sfi.label}, NDVI ${nd.toFixed(2)}`; }
      } else { bg = trueColour(sfi, 1 + ((i * 7919) % 13 - 6) / 90); label = sfi.label; }
      b.style.background = bg;
      b.classList.toggle('is-sel', i === sel);
      b.setAttribute('aria-label', `Row ${Math.floor(i / COLS) + 1}, column ${(i % COLS) + 1}: ${label}`);
      b.setAttribute('aria-selected', String(i === sel));
    });
    gridEl.classList.toggle('is-night', night);
    picks.forEach((p) => { p.input.checked = p.sf.id === id; p.lab.classList.toggle('on', p.sf.id === id); });
    blurb.textContent = sf.blurb;
    // spectrum
    const pts = sf.refl.map((r, k) => [px(BANDS[k].um), py(r)] as const);
    const line = (a: readonly (readonly [number, number])[]) => a.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    curve.setAttribute('d', night ? '' : line(pts));
    curve.style.stroke = sf.color;
    const fPts = surfaceById('forest').refl.map((r, k) => [px(BANDS[k].um), py(r)] as const);
    ghost.setAttribute('d', id === 'forest' || night ? '' : line(fPts));
    dotsG.replaceChildren(...(night ? [] : pts.map((p) => s('circle', { cx: p[0], cy: p[1], r: 3.6, fill: sf.color, stroke: '#0b1424', 'stroke-width': 1.5 }))));
    const red = sf.refl[3], nir = sf.refl[4];
    const tag = (x: number, y: number, label: string, v: number, cls: string) => [s('text', { x, y: y - 8, 'text-anchor': 'middle', class: `sl-vtag ${cls}` }, `${label} ${v.toFixed(2)}`)];
    redTag.replaceChildren(...(night ? [] : tag(px(0.655) + 4, py(red), 'Red', red, 'r')));
    nirTag.replaceChildren(...(night ? [] : tag(px(0.865) + 24, py(nir), 'NIR', nir, 'n')));
    chart.setAttribute('aria-label', night ? 'No spectrum: at night there is no reflected sunlight to measure.' : `Reflectance of ${sf.label}: red ${red.toFixed(2)}, near-infrared ${nir.toFixed(2)}.`);
    // NDVI readouts
    if (night) {
      rNdvi.set('NO DATA', 'bad'); calc.textContent = 'No sunlight means no reflected light for the sensor to record.';
      verdict.textContent = ''; rNbr.set('–', 'muted');
    } else {
      const v = ndvi(nir, red);
      rNdvi.set(fmt(v, 2), v >= TREE_NDVI_THRESHOLD ? 'ok' : id === 'cloud' ? 'muted' : 'warn');
      calc.textContent = `(${nir.toFixed(3)} − ${red.toFixed(3)}) ÷ (${nir.toFixed(3)} + ${red.toFixed(3)}) = ${v.toFixed(2)}`;
      verdict.textContent = id === 'cloud' ? 'Cloud: the sensor sees the cloud top, not the ground. This pixel is no data for tree cover.'
        : v >= TREE_NDVI_THRESHOLD ? `NDVI is at least ${TREE_NDVI_THRESHOLD}: counted as trees.` : `NDVI is below ${TREE_NDVI_THRESHOLD}: not counted as trees.`;
      const nb = nbr(sf.refl[4], sf.refl[6]);
      rNbr.set(fmt(nb, 2), nb < -0.1 ? 'warn' : '');
    }
    const tc = treeCover(grid, night);
    rTree.set(night ? 'NO DATA' : fmt(tc.percent, 0), night ? 'bad' : '');
    treeNote.textContent = night ? 'The whole scene is no data.'
      : `${tc.trees} of ${tc.valid} usable pixels are trees${tc.total - tc.valid ? `. ${tc.total - tc.valid} cloud pixels are left out, not counted as "not forest"` : ''}.`;
  }

  // ------------------------------------------------------------------ globe controls
  const daysSlider = h('input', { type: 'range', min: 1, max: 16, step: 1, value: days, id: 'sl-opt-days' });
  const bothBox = h('input', { type: 'checkbox', id: 'sl-opt-both' });
  const bothLab = h('label', { class: 'sl-toggle', for: 'sl-opt-both' }, bothBox, h('span', null, 'Add Landsat 9'));
  const rCov = readout('Equator covered by daytime swaths', '%', 'lg');
  const rDays = readout('Days of coverage drawn', 'days');
  const covNote = h('p', { class: 'sl-muted', 'aria-live': 'polite' });
  const t0 = 0;
  const l8 = withPass(SATELLITES.landsat8.orbit, t0 + 600, -34, false);
  const l9 = { ...l8, u0Deg: l8.u0Deg + 180 };
  const SUN_DEC = -12;
  let covPending = 0;
  function updateCoverage(): void {
    globe.add({ kind: 'swath', id: 'sw8', orbit: l8, t0, t1: t0 + days * DAY_S, widthKm: 185, stepS: 90, color: '#4cc38a', opacity: 0.42, dayOnly: { decDeg: SUN_DEC } });
    if (both) globe.add({ kind: 'swath', id: 'sw9', orbit: l9, t0, t1: t0 + days * DAY_S, widthKm: 185, stepS: 90, color: '#ffb547', opacity: 0.42, dayOnly: { decDeg: SUN_DEC } });
    else globe.remove('sw9');
    rDays.set(String(days));
    if (!covPending) covPending = requestAnimationFrame(() => {
      covPending = 0;
      const lons = [
        ...equatorCrossings(l8, t0, t0 + days * DAY_S, 'desc').map((c) => c.lon),
        ...(both ? equatorCrossings(l9, t0, t0 + days * DAY_S, 'desc').map((c) => c.lon) : []),
      ];
      const cov = equatorCoverage(lons, 185);
      rCov.set(fmt(cov * 100, 0), cov > 0.995 ? 'ok' : '');
      covNote.textContent = cov > 0.995
        ? `Every longitude has been imaged by a clear-sky-permitting pass. That takes ${days} days ${both ? 'with two satellites' : 'with one'}: 16 days for Landsat 8 alone, 8 days with Landsat 9.`
        : `${days} day${days > 1 ? 's' : ''} of daytime passes leave gaps between the strips. Only daylight passes count, and a cloudy pass is still wasted.`;
    });
  }
  daysSlider.addEventListener('input', () => { days = Number(daysSlider.value); updateCoverage(); });
  bothBox.addEventListener('change', () => { both = bothBox.checked; updateCoverage(); });
  const covCard = h('div', { class: 'sl-card' },
    h('div', { class: 'sl-card-k' }, 'How often does it come back?'),
    h('p', { class: 'sl-muted', style: 'margin:6px 0 8px' }, 'Each Landsat sweeps a 185 km strip, on the day side only. Drag the slider to add days of passes to the globe, then add Landsat 9.'),
    h('label', { for: 'sl-opt-days', class: 'sl-slab' }, 'Days of passes drawn on the globe'), daysSlider,
    h('div', { class: 'sl-actions', style: 'margin-top:6px' }, bothLab),
    h('div', { class: 'sl-ro-row' }, rDays.el, rCov.el), covNote);

  // ------------------------------------------------------------------ assemble
  const task = h('p', { class: 'sl-task' }, h('span', { class: 'sl-tag' }, 'Try it'), 'Pick a pixel in the scene (click or use the arrow keys), then change what is on the ground below it. Watch its spectrum and NDVI change. Then switch to night.');
  const left = h('div', { class: 'sl-opt-left' },
    h('div', { class: 'sl-card-k' }, 'Scene: 14 × 9 pixels of 30 m'), modeSel, gridEl, sceneKey,
    h('div', { class: 'sl-actions' }, nightLab),
    h('div', { class: 'sl-ro-row' }, rTree.el), treeNote);
  const right = h('div', { class: 'sl-opt-right sl-card' },
    h('div', { class: 'sl-card-k' }, 'Chosen pixel is…'), picker, blurb,
    h('figure', { class: 'sl-fig' }, chart, h('figcaption', null, 'Typical reflectance curves for each surface across Landsat bands B1 to B7 (approximate, textbook-style, not measured at this site). Dashed grey: healthy forest for comparison.')),
    dataTableToggle('Approximate reflectance of the chosen surface by Landsat band', ['band', 'name', 'µm', 'reflectance'], () => BANDS.map((b, k) => [b.id, b.name, b.um.toFixed(3), surfaceById(grid[sel]).refl[k].toFixed(3)])),
    rNdvi.el, calc, verdict, rNbr.el);
  host.append(task, goals, h('div', { class: 'sl-opt-grid' }, left, right), covCard);

  const dbg = (globalThis as unknown as { __slDebug?: Record<string, unknown> }).__slDebug;
  if (dbg) dbg.optical = { select, setSurface, night(v: boolean) { nightBox.checked = v; nightBox.dispatchEvent(new Event('change')); }, days(d: number, b = false) { days = d; daysSlider.value = String(d); both = b; bothBox.checked = b; updateCoverage(); }, mode(m: 'colour' | 'ndvi') { mode = m; refresh(); } };

  refresh(); checkGoals();
  let first = true;
  return {
    enter() {
      if (first) { first = false; globe.setSimTime(t0 + 600); }
      globe.setSunDeclination(SUN_DEC);
      globe.setTimeScale(120);
      globe.add({ kind: 'sat', id: 'l8', label: 'Landsat 8 · 705 km', orbit: l8, color: '#4cc38a', model: 'landsat' });
      globe.add({ kind: 'sat', id: 'l9', label: 'Landsat 9', orbit: l9, color: '#ffb547', model: 'landsat' });
      globe.add({ kind: 'marker', id: 'woon', lat: -34.36, lon: 150.92, label: 'Woonona', color: '#ffffff' });
      updateCoverage();
      globe.focus(-25, 150, 4.5, true);
      env.setLegend([{ color: '#4cc38a', label: 'Landsat 8 daytime swaths', kind: 'area' }, { color: '#ffb547', label: 'Landsat 9 (when added)', kind: 'area' }]);
      globe.setDescription('Narrow daytime swaths of Landsat 8 and 9 across the day side of the Earth; the night side has none.');
    },
    leave() { /* nothing running */ },
    dispose() { if (covPending) cancelAnimationFrame(covPending); },
  };
};
