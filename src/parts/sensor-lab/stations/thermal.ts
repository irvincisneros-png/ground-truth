/** Station 1: thermal infrared -> sea-surface skin temperature. */
import { footprintRadiusDeg, SATELLITES, withPass, GBR_RING } from '../../../globe';
import type { StationFactory } from '../station';
import {
  BAND_11_UM, brightnessTemperature, cToK, kToC, mulberry32, planckRadiance, simulateThermalPixel, thermalQualityFlag, gaussian, type QualityFlag,
} from '../physics';
import { cividis, cividisCss, clamp, fmt, h, makeDraggable, readout, s } from '../ui';

const W = 480, H = 320; // canvas pixels
const SCENE_KM = { w: 60, h: 40 };
const PX_PER_KM = W / SCENE_KM.w;
const REEF_C = { x: 34, y: 21 };
const REEF_POLY: [number, number][] = [[27, 19], [30, 17.2], [35, 17.6], [39, 19.5], [41, 22], [38, 24.2], [33, 24.8], [29, 23.5]];
const SST_MIN = 27.5, SST_MAX = 30.5;
const TRUE_REEF_C = 29.1;
const WV_K = 2.0;

type Platform = 'himawari' | 'viirs';
const PLATFORMS: Record<Platform, { name: string; short: string; nx: number; ny: number; km: number; color: string; facts: [string, string][] }> = {
  himawari: {
    name: 'Himawari-9', short: 'geostationary', nx: 30, ny: 20, km: 2, color: '#4cc38a',
    facts: [['Height', '35 786 km'], ['Pixel', '2 km'], ['Looks', 'every 10 min']],
  },
  viirs: {
    name: 'VIIRS on NOAA-20', short: 'polar, sun-synchronous', nx: 80, ny: 53, km: 0.75, color: '#7cc4ff',
    facts: [['Height', '824 km'], ['Pixel', '750 m'], ['Looks', '~2 times a day']],
  },
};

/** Smooth background skin-temperature field (deg C), pinned to 29.1 at the reef centre. */
function fieldC(x: number, y: number): number {
  const f = (a: number, b: number) => 0.55 * Math.sin(a / 11 + 0.7) * Math.cos(b / 9) + 0.25 * Math.sin((a + b) / 6.5) - 0.014 * (b - 20) + 0.01 * (a - 30);
  return TRUE_REEF_C + f(x, y) - f(REEF_C.x, REEF_C.y);
}

function inPoly(x: number, y: number, poly: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

interface Blob { dx: number; dy: number; rx: number; ry: number }
const BLOBS: Blob[] = [
  { dx: 0, dy: 0, rx: 9, ry: 6 }, { dx: -7.5, dy: 2, rx: 6, ry: 4.6 }, { dx: 6.5, dy: -2, rx: 7, ry: 5 },
  { dx: -1, dy: -5, rx: 5.5, ry: 3.6 }, { dx: 2, dy: 5, rx: 6.5, ry: 3.6 },
];
const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function cloudOpacity(x: number, y: number, cx: number, cy: number): number {
  let o = 0;
  for (const b of BLOBS) {
    const d = Math.hypot((x - cx - b.dx) / b.rx, (y - cy - b.dy) / b.ry);
    o = Math.max(o, 1 - smooth(0.78, 1.22, d));
  }
  return o;
}

const FLAG_TEXT: Record<QualityFlag, { code: string; label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  0: { code: 'QF 0', label: 'Clear: good quality', tone: 'ok' },
  1: { code: 'QF 1', label: 'Possible thin cloud: low quality', tone: 'warn' },
  3: { code: 'QF 3', label: 'Cloud: no retrieval', tone: 'bad' },
};

export const createThermalStation: StationFactory = (env) => {
  const { host, state, globe } = env;
  let platform: Platform = 'himawari';
  let cloud = { x: 12, y: 9 };
  let scan = 0; // scans since start
  let blend = false;
  let covered = !!state.flags.covered;
  let rafPending = 0;
  const log: { t: string; text: string; tone: string }[] = [];
  const rng = mulberry32(2024);
  const noiseCache = new Map<string, Float32Array>();

  // ---------------------------------------------------------------- DOM
  const radios = (Object.keys(PLATFORMS) as Platform[]).map((p) => {
    const d = PLATFORMS[p];
    const input = h('input', { type: 'radio', name: 'sl-th-plat', value: p, id: `sl-th-${p}`, checked: p === platform });
    const lab = h('label', { class: 'sl-pcard', for: `sl-th-${p}`, style: `--c:${d.color}` },
      input,
      h('span', { class: 'sl-pcard-n' }, d.name, h('span', { class: 'sl-pcard-s' }, d.short)),
      h('span', { class: 'sl-pcard-f' }, ...d.facts.map(([k, v]) => h('span', null, h('em', null, k), v))));
    input.addEventListener('change', () => { if (input.checked) setPlatform(p); });
    return lab;
  });
  const seg = h('div', { class: 'sl-pcards', role: 'radiogroup', 'aria-label': 'Choose a satellite' }, ...radios);

  const canvas = h('canvas', { class: 'sl-scene-canvas', width: W, height: H, role: 'img', 'aria-label': 'Map of sea-surface temperature around a reef, as the satellite sees it.' });
  const g2 = canvas.getContext('2d')!;
  const svg = s('svg', { class: 'sl-scene-svg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'false' });
  const defs = s('defs', null,
    s('filter', { id: 'sl-blur', x: '-20%', y: '-30%', width: '140%', height: '160%' }, s('feGaussianBlur', { stdDeviation: 7 })));
  const reefPath = s('path', { d: REEF_POLY.map((p, i) => `${i ? 'L' : 'M'}${p[0] * PX_PER_KM} ${p[1] * PX_PER_KM}`).join('') + 'Z', class: 'sl-reef' });
  const reefLabel = s('text', { x: REEF_C.x * PX_PER_KM, y: 17.6 * PX_PER_KM - 18, class: 'sl-svg-label', 'text-anchor': 'middle' }, 'REEF');
  const pixBox = s('rect', { class: 'sl-pixbox' });
  const cloudG = s('g', { class: 'sl-cloud', tabindex: 0, role: 'button', 'aria-label': 'Cloud. Drag it, or press the arrow keys, to move it over the reef.' });
  const cloudShape = s('g', { filter: 'url(#sl-blur)' }, ...BLOBS.map((b) => s('ellipse', { cx: b.dx * PX_PER_KM, cy: b.dy * PX_PER_KM, rx: b.rx * PX_PER_KM * 0.92, ry: b.ry * PX_PER_KM * 0.92 })));
  const cloudHint = s('text', { x: 0, y: 4, class: 'sl-svg-label sl-cloud-label', 'text-anchor': 'middle' }, 'CLOUD');
  cloudG.append(cloudShape, cloudHint);
  const scale = s('g', { class: 'sl-scalebar' }, s('path', { d: `M14 ${H - 14}h${10 * PX_PER_KM}M14 ${H - 19}v10M${14 + 10 * PX_PER_KM} ${H - 19}v10` }), s('text', { x: 14, y: H - 24 }, '10 km'));
  svg.append(defs, reefPath, reefLabel, pixBox, cloudG, scale);
  const stage = h('div', { class: 'sl-scene-stage' }, canvas, svg);

  const bar = h('div', { class: 'sl-cbar' },
    h('div', { class: 'sl-cbar-grad', style: `background:linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1].map((t) => cividisCss(t)).join(',')})` }),
    h('div', { class: 'sl-cbar-ticks' }, ...[27.5, 28.0, 28.5, 29.0, 29.5, 30.0, 30.5].map((t) => h('span', null, t.toFixed(1)))),
    h('div', { class: 'sl-cbar-l' }, 'Skin sea-surface temperature, °C'));
  const key = h('ul', { class: 'sl-skey' },
    h('li', null, h('i', { class: 'sl-sw sl-sw--nodata' }), 'No data (cloud, QF 3)'),
    h('li', null, h('i', { class: 'sl-sw sl-sw--lowq' }), 'Low quality (cloud edge, QF 1)'),
    h('li', null, h('i', { class: 'sl-sw sl-sw--reef' }), 'Reef (outline)'));
  const sceneFig = h('figure', { class: 'sl-scene' }, stage, bar, key,
    h('figcaption', { class: 'sl-muted' }, 'Scene: 60 km by 40 km around a reef. Illustrative sea temperatures, not a real image.'));

  // inspector
  const platTitle = h('div', { class: 'sl-ins-plat' });
  const flagChip = h('span', { class: 'sl-chip' });
  const rL = readout('1  Radiance at 10.8 µm', 'W·m⁻²·sr⁻¹·µm⁻¹');
  const rBT = readout('2  Brightness temperature', 'K');
  const rSST = readout('3  Skin temperature (corrected)', '°C', 'lg');
  const note = h('p', { class: 'sl-ins-note', 'aria-live': 'polite' });
  const inspector = h('div', { class: 'sl-card sl-ins' },
    h('div', { class: 'sl-ins-head' }, h('span', { class: 'sl-card-k' }, 'Reef pixel'), flagChip),
    platTitle, rL.el, rBT.el, rSST.el, note);

  const nextBtn = h('button', { type: 'button', class: 'sl-btn' }, 'Next scan');
  const blendBtn = h('button', { type: 'button', class: 'sl-btn sl-btn--accent', disabled: true, 'aria-describedby': 'sl-th-blendnote' }, 'Show gap-filled product');
  const blendNote = h('p', { class: 'sl-muted', id: 'sl-th-blendnote' }, 'Cover the reef with cloud first.');
  const logBox = h('ol', { class: 'sl-log', 'aria-label': 'Observation log' });
  const logWrap = h('div', { class: 'sl-card' }, h('div', { class: 'sl-card-k' }, 'Observation log'), logBox);
  const blendInfo = h('div', { class: 'sl-card sl-blendinfo', hidden: true },
    h('strong', null, 'NOAA CoralTemp, 5 km, gap-filled'),
    h('p', null, 'This is a blended, night-time product. It uses clear-sky readings from several satellites, plus nearby pixels, to fill the holes. It is more complete than any one pass, but the reef value is an estimate, not a direct reading.'));
  const side = h('div', { class: 'sl-th-side' }, inspector, h('div', { class: 'sl-actions' }, nextBtn, blendBtn, blendNote), blendInfo, logWrap);

  const tip = h('p', { class: 'sl-task' }, h('span', { class: 'sl-tag' }, 'Try it'), 'Drag the cloud over the reef (or focus it and use the arrow keys, Shift for bigger steps). Then step to the next observation.');
  host.append(seg, tip, h('div', { class: 'sl-th-grid' }, sceneFig, side));

  // ---------------------------------------------------------------- rendering
  const cfg = () => PLATFORMS[platform];

  function pixelNoise(): Float32Array {
    let n = noiseCache.get(platform);
    if (!n) {
      const r = mulberry32(platform === 'viirs' ? 77 : 33);
      n = Float32Array.from({ length: cfg().nx * cfg().ny }, () => gaussian(r) * 0.12);
      noiseCache.set(platform, n);
    }
    return n;
  }

  const hatch = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const x = c.getContext('2d')!;
    x.strokeStyle = 'rgba(159,176,212,0.5)'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(-2, 10); x.lineTo(10, -2); x.moveTo(-2, 6); x.lineTo(6, -2); x.moveTo(2, 10); x.lineTo(10, 2); x.stroke();
    return g2.createPattern(c, 'repeat')!;
  })();

  interface PixelInfo { flag: QualityFlag; sstC: number; bt11K: number; radiance: number; cloudO: number }
  function reefPixelIndex(c = cfg()): { ix: number; iy: number } {
    return { ix: Math.floor(REEF_C.x / c.km), iy: Math.floor(REEF_C.y / c.km) };
  }

  function pixel(ix: number, iy: number): PixelInfo {
    const c = cfg();
    const xk = (ix + 0.5) * c.km, yk = (iy + 0.5) * c.km;
    const o = cloudOpacity(xk, yk, cloud.x, cloud.y);
    const flag = thermalQualityFlag(o);
    const truthC = fieldC(xk, yk) + pixelNoise()[iy * c.nx + ix];
    const p = simulateThermalPixel(cToK(truthC), WV_K);
    return { flag, sstC: kToC(p.sstK), bt11K: p.bt11, radiance: p.radiance11, cloudO: o };
  }

  function draw(): void {
    rafPending = 0;
    const c = cfg();
    const pw = c.km * PX_PER_KM, ph = c.km * PX_PER_KM;
    g2.clearRect(0, 0, W, H);
    g2.fillStyle = '#0a1426';
    g2.fillRect(0, 0, W, H);
    let coveredNow = false;
    const { ix: rx, iy: ry } = reefPixelIndex(c);
    let reefValid = 0, reefTotal = 0;
    for (let iy = 0; iy < c.ny; iy++) {
      for (let ix = 0; ix < c.nx; ix++) {
        const p = pixel(ix, iy);
        const x = ix * pw, y = iy * ph;
        const xk = (ix + 0.5) * c.km, yk = (iy + 0.5) * c.km;
        if (inPoly(xk, yk, REEF_POLY)) { reefTotal++; if (p.flag === 0) reefValid++; }
        if (p.flag === 3) {
          g2.fillStyle = '#0d182c'; g2.fillRect(x, y, pw, ph);
          g2.fillStyle = hatch; g2.fillRect(x, y, pw, ph);
        } else {
          const [r, g, b] = cividis((p.sstC - SST_MIN) / (SST_MAX - SST_MIN));
          g2.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
          g2.fillRect(x, y, pw + 0.5, ph + 0.5);
          if (p.flag === 1) { g2.fillStyle = 'rgba(242,169,59,0.34)'; g2.fillRect(x, y, pw, ph); }
        }
        if (ix === rx && iy === ry && p.flag === 3) coveredNow = true;
      }
    }
    if (c.km >= 1) { // pixel edges are readable for the 2 km sensor
      g2.strokeStyle = 'rgba(255,255,255,0.09)'; g2.lineWidth = 1; g2.beginPath();
      for (let ix = 0; ix <= c.nx; ix++) { g2.moveTo(ix * pw + 0.5, 0); g2.lineTo(ix * pw + 0.5, H); }
      for (let iy = 0; iy <= c.ny; iy++) { g2.moveTo(0, iy * ph + 0.5); g2.lineTo(W, iy * ph + 0.5); }
      g2.stroke();
    }
    if (blend) drawBlend();
    pixBox.setAttribute('x', String(rx * pw)); pixBox.setAttribute('y', String(ry * ph));
    pixBox.setAttribute('width', String(Math.max(pw, 5))); pixBox.setAttribute('height', String(Math.max(ph, 5)));
    cloudG.setAttribute('transform', `translate(${cloud.x * PX_PER_KM} ${cloud.y * PX_PER_KM})`);
    cloudG.style.opacity = blend ? '0.25' : '1';

    if (coveredNow && !covered) {
      covered = true; state.flags.covered = true; env.save();
      blendBtn.disabled = false; blendNote.textContent = 'Now reveal the blended product that fills the hole.';
      env.announce('The reef pixel now has no data. Quality flag 3: cloud.');
    }
    updateInspector(reefValid, reefTotal);
  }

  function drawBlend(): void {
    const k = 5 * PX_PER_KM;
    g2.globalAlpha = 1;
    for (let iy = 0; iy < 8; iy++) for (let ix = 0; ix < 12; ix++) {
      const v = fieldC((ix + 0.5) * 5, (iy + 0.5) * 5);
      const [r, g, b] = cividis((v - SST_MIN) / (SST_MAX - SST_MIN));
      g2.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      g2.fillRect(ix * k, iy * k, k + 0.5, k + 0.5);
    }
    g2.strokeStyle = 'rgba(255,255,255,0.14)'; g2.lineWidth = 1; g2.beginPath();
    for (let ix = 0; ix <= 12; ix++) { g2.moveTo(ix * k + 0.5, 0); g2.lineTo(ix * k + 0.5, H); }
    for (let iy = 0; iy <= 8; iy++) { g2.moveTo(0, iy * k + 0.5); g2.lineTo(W, iy * k + 0.5); }
    g2.stroke();
    const ix = Math.floor(REEF_C.x / 5), iy = Math.floor(REEF_C.y / 5);
    g2.setLineDash([5, 4]); g2.strokeStyle = '#ffb547'; g2.lineWidth = 2;
    g2.strokeRect(ix * k + 1, iy * k + 1, k - 2, k - 2); g2.setLineDash([]);
    g2.fillStyle = 'rgba(11,20,36,0.8)'; g2.fillRect(ix * k + 4, iy * k + k - 20, k - 8, 16);
    g2.fillStyle = '#ffb547'; g2.font = '600 10px ui-monospace, Menlo, monospace'; g2.textAlign = 'center';
    g2.fillText('ESTIMATE', ix * k + k / 2, iy * k + k - 8);
  }

  function updateInspector(reefValid: number, reefTotal: number): void {
    const c = cfg();
    platTitle.textContent = `${c.name}: ${c.km >= 1 ? c.km + ' km' : c.km * 1000 + ' m'} pixels. Reef covers ${reefTotal} pixels, ${reefValid} usable.`;
    if (blend) {
      const v = fieldC(REEF_C.x, REEF_C.y);
      flagChip.className = 'sl-chip sl-chip--est';
      flagChip.textContent = 'ESTIMATE';
      rL.set('–', 'muted'); rBT.set('–', 'muted'); rSST.set(fmt(v, 1), 'warn');
      note.textContent = 'Not a direct reading. CoralTemp blends earlier clear-sky observations from several satellites with nearby pixels on a 5 km grid (night-time, daily).';
      return;
    }
    const { ix, iy } = reefPixelIndex(c);
    const p = pixel(ix, iy);
    const f = FLAG_TEXT[p.flag];
    flagChip.className = `sl-chip sl-chip--${f.tone}`;
    flagChip.textContent = `${f.code} · ${f.label}`;
    if (p.flag === 3) {
      // what the sensor actually recorded: the cold cloud top
      const cloudBt = 255;
      const L = planckRadiance(BAND_11_UM, cloudBt);
      rL.set(fmt(L, 2), 'bad');
      rBT.set(fmt(brightnessTemperature(BAND_11_UM, L), 1), 'bad');
      rSST.set('NO DATA', 'bad'); rSST.unit('');
      note.textContent = `The sensor saw the cloud top (about ${fmt(kToC(cloudBt), 0)} °C), not the sea. Fed into the formula it would "measure" ${fmt(kToC(cloudBt), 0)} °C, so the pixel is flagged and thrown away.`;
    } else {
      rL.set(fmt(p.radiance, 2), p.flag === 1 ? 'warn' : '');
      rBT.set(fmt(p.bt11K, 1), p.flag === 1 ? 'warn' : '');
      rSST.set(fmt(p.sstC, 1), p.flag === 1 ? 'warn' : 'ok'); rSST.unit('\u00b0C');
      rBT.unit(`K  (${fmt(kToC(p.bt11K), 1)} °C)`);
      note.textContent = p.flag === 1
        ? 'Thin cloud at the edge may leak into the pixel and bias it cold, so it is flagged low quality.'
        : 'Water vapour in the air absorbs some infrared, so the brightness temperature reads colder than the sea. Comparing two infrared bands corrects for that.';
    }
    if (p.flag !== 3) rBT.unit(`K  (${fmt(kToC(p.bt11K), 1)} °C)`); else rBT.unit('K  (cloud top)');
  }

  function schedule(): void { if (!rafPending) rafPending = requestAnimationFrame(draw); }

  // ---------------------------------------------------------------- interaction
  const cloudScale = () => SCENE_KM.w / (canvas.clientWidth || W);
  const disposeDrag = makeDraggable(
    cloudG as unknown as SVGElement,
    () => ({ x: cloud.x, y: cloud.y }),
    (x, y) => { cloud = { x: clamp(x, -4, SCENE_KM.w + 4), y: clamp(y, -3, SCENE_KM.h + 3) }; if (blend) setBlend(false); schedule(); },
    cloudScale,
    10,
  );

  function stamp(t: string, text: string, tone: string): void {
    log.unshift({ t, text, tone });
    log.length = Math.min(log.length, 6);
    logBox.replaceChildren(...log.map((e) => h('li', { class: `is-${e.tone}` }, h('time', null, e.t), h('span', null, e.text))));
  }

  const clock = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} UTC`;

  nextBtn.addEventListener('click', () => {
    // record what the current observation gave, then advance time
    const { ix, iy } = reefPixelIndex();
    const p = pixel(ix, iy);
    const when = platform === 'himawari' ? 120 + scan * 10 : (scan % 2 === 0 ? 3 * 60 + 30 : 15 * 60 + 30);
    const label = platform === 'himawari' ? 'scan' : (scan % 2 === 0 ? 'day pass' : 'night pass');
    stamp(clock(when), `${cfg().name} ${label}: ${p.flag === 3 ? 'NO DATA (cloud)' : p.flag === 1 ? `${fmt(p.sstC, 1)} °C (low quality)` : `${fmt(p.sstC, 1)} °C`}`, p.flag === 3 ? 'bad' : p.flag === 1 ? 'warn' : 'ok');
    scan++;
    if (platform === 'himawari') {
      cloud = { x: cloud.x + 3.6, y: cloud.y - 0.8 }; // about 6 m/s of drift in 10 minutes
      globe.setSimTime(globe.getSimTime() + 600);
    } else {
      cloud = { x: 8 + rng() * 44, y: 6 + rng() * 28 }; // twelve hours later: a different sky
      globe.setSimTime(globe.getSimTime() + 12 * 3600);
    }
    if (blend) setBlend(false);
    setNextLabel();
    schedule();
  });

  function setBlend(on: boolean): void {
    blend = on;
    blendBtn.textContent = on ? 'Hide gap-filled product' : 'Show gap-filled product';
    blendBtn.setAttribute('aria-pressed', String(on));
    blendInfo.hidden = !on;
    stage.classList.toggle('is-blend', on);
    canvas.setAttribute('aria-label', on ? 'Map of the gap-filled CoralTemp product on a 5 km grid. The reef cell is an estimate.' : 'Map of sea-surface temperature around a reef, as the satellite sees it.');
    schedule();
  }
  blendBtn.addEventListener('click', () => {
    setBlend(!blend);
    if (blend) env.interactionDone();
  });

  function setNextLabel(): void {
    nextBtn.textContent = platform === 'himawari' ? 'Next scan (+10 min)' : 'Next pass (+12 h)';
  }

  function setPlatform(p: Platform): void {
    platform = p;
    scan = 0;
    log.length = 0; logBox.replaceChildren();
    cloud = { x: 12, y: 9 };
    if (blend) setBlend(false);
    setNextLabel();
    buildGlobe();
    schedule();
  }

  // ---------------------------------------------------------------- globe
  function buildGlobe(): void {
    globe.clear();
    const hima = SATELLITES.himawari9.orbit;
    const t0 = 2.5 * 3600;
    if (platform === 'himawari') {
      globe.add({ kind: 'disc', id: 'hdisc', lat: 0, lon: 140.7, radiusDeg: footprintRadiusDeg(35786, 10), innerRadiusDeg: footprintRadiusDeg(35786, 45), color: '#4cc38a', opacity: 0.13 });
      globe.add({ kind: 'sat', id: 'him', label: 'Himawari-9 · 35 786 km', orbit: hima, color: '#4cc38a', model: 'geo', showOrbit: true, size: 1.1 });
      globe.focus(5, 132, 12.5, true);
      env.setCaption('Himawari-9 sits 35 786 km up and turns with the Earth, so it stares at the same disc. Clear view near the middle, a slanted and stretched one near the edge.');
      env.setLegend([{ color: '#4cc38a', label: 'Himawari-9 and its view', kind: 'area' }, { color: '#ff7a59', label: 'Great Barrier Reef', kind: 'area' }]);
    } else {
      const orb = withPass(SATELLITES.noaa20.orbit, 3.5 * 3600, -17, true);
      globe.add({ kind: 'swath', id: 'vsw', orbit: orb, t0: t0 - 3600, t1: t0 + 86400 - 3600, widthKm: 3060, stepS: 60, color: '#7cc4ff', opacity: 0.1 });
      globe.add({ kind: 'sat', id: 'viirs', label: 'NOAA-20 · 824 km', orbit: orb, color: '#7cc4ff', model: 'polar', size: 1.5 });
      globe.focus(-18, 148, 3.3, true);
      env.setCaption('NOAA-20 circles pole to pole 14 times a day while the Earth turns beneath it. Its 3060 km swath overlaps, so a reef gets a day pass and a night pass.');
      env.setLegend([{ color: '#7cc4ff', label: 'One day of VIIRS swaths', kind: 'area' }, { color: '#ff7a59', label: 'Great Barrier Reef', kind: 'area' }]);
    }
    globe.add({ kind: 'region', id: 'gbr', ring: GBR_RING, color: '#ff7a59', fillOpacity: 0.35, label: 'Great Barrier Reef' });
    globe.setDescription(platform === 'himawari'
      ? 'Himawari-9 is in a fixed position 35,786 kilometres above the equator at 140.7 degrees east, viewing the western Pacific.'
      : 'NOAA-20 is in a polar orbit 824 kilometres up, passing over Australia twice a day.');
  }

  // dev/test hook: inert unless the dev page defines window.__slDebug
  const dbg = (globalThis as unknown as { __slDebug?: Record<string, unknown> }).__slDebug;
  if (dbg) dbg.thermal = { setCloud(x: number, y: number) { cloud = { x, y }; schedule(); }, next: () => nextBtn.click(), blend: () => blendBtn.click(), plat: (p: Platform) => setPlatform(p) };

  // ---------------------------------------------------------------- lifecycle
  let first = true;
  setNextLabel();
  if (covered) { blendBtn.disabled = false; blendNote.textContent = 'Now reveal the blended product that fills the hole.'; }
  draw();
  return {
    enter() {
      if (first) { first = false; globe.setSimTime(2.5 * 3600); globe.setSunDeclination(-12); globe.setTimeScale(300); }
      buildGlobe();
      schedule();
    },
    leave() { if (rafPending) cancelAnimationFrame(rafPending); rafPending = 0; },
    dispose() { disposeDrag(); if (rafPending) cancelAnimationFrame(rafPending); },
  };
};
