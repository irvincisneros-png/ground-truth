/**
 * Globe facade: picks the 3D (three.js) or 2D (SVG) renderer, owns the sim clock, the transport controls
 * and the render loop, and keeps the scene so the renderer can be swapped if WebGL fails.
 */
import './globe.css';
import { WebGLBackend } from './webgl';
import { Fallback2DBackend } from './fallback2d';
import type { Backend, GlobeApi, GlobeOptions, Quality, SceneItem } from './types';

export * from './types';
export * from './orbits';
export { GBR_RING, ANTARCTIC_CAP_LAT } from './regions';

const SPEEDS: { label: string; v: number }[] = [
  { label: '1 min/s', v: 60 },
  { label: '5 min/s', v: 300 },
  { label: '30 min/s', v: 1800 },
];

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

const base = (): string => (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export function createGlobe(container: HTMLElement, opts: GlobeOptions = {}): GlobeApi {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.className = 'gt-globe';
  const stage = document.createElement('div');
  stage.className = 'gt-globe__stage';
  root.appendChild(stage);
  container.appendChild(root);

  const items = new Map<string, SceneItem>();
  let simT = 0;
  let scale = opts.timeScale ?? 300;
  let playing = (opts.startPlaying ?? true) && !reduced;
  let sunDec = opts.sunDecDeg ?? -12;
  let desc = '';
  let backend: Backend;
  let disposed = false;
  let visible = true;
  let quality: Quality = 'high';
  const listeners = new Set<(q: Quality, reason: string) => void>();

  const makeBackend = (force2d: boolean): Backend => {
    let b: Backend;
    if (!force2d && webglOk()) {
      try { b = new WebGLBackend(stage, opts, base()); } catch { b = new Fallback2DBackend(stage, opts, base()); }
    } else {
      b = new Fallback2DBackend(stage, opts, base());
    }
    b.onFail = (reason) => swapTo2D(reason);
    b.onQualityHint = (q, reason) => { quality = q; listeners.forEach((f) => f(q, reason)); };
    return b;
  };

  const swapTo2D = (reason: string) => {
    if (backend.mode === '2d' || disposed) return;
    const prev = backend;
    prev.dispose();
    backend = makeBackend(true);
    backend.setSun(sunDec);
    backend.setDescription(desc);
    items.forEach((it) => backend.add(it));
    syncModeBadge();
    quality = 'low';
    listeners.forEach((f) => f('low', reason));
  };

  backend = makeBackend(!!opts.force2d);
  backend.setSun(sunDec);
  if (opts.quality === 'low') { backend.setQuality('low'); quality = 'low'; }

  // ---------------------------------------------------------- controls overlay
  const showControls = opts.controls !== false;
  const readout = document.createElement('div');
  readout.className = 'gt-globe__clock';
  readout.setAttribute('aria-hidden', 'true');
  const badge = document.createElement('span');
  badge.className = 'gt-globe__badge';
  readout.appendChild(badge);
  const clockText = document.createElement('span');
  readout.prepend(clockText);

  const bar = document.createElement('div');
  bar.className = 'gt-globe__bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Globe controls');
  const mkBtn = (text: string, label: string, onClick: () => void, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `gt-globe__btn ${cls}`.trim();
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', onClick);
    return b;
  };
  const playBtn = mkBtn('', 'Pause time', () => { playing ? api.pause() : api.play(); });
  const speedBtns = SPEEDS.map((s) => mkBtn(s.label, `Time speed: ${s.label.replace('/s', ' of orbit per second')}`, () => { api.setTimeScale(s.v); updateUi(); }, 'is-speed'));
  const zoomIn = mkBtn('+', 'Zoom in', () => backend.zoomBy(0.8));
  const zoomOut = mkBtn('−', 'Zoom out', () => backend.zoomBy(1.25));
  const reset = mkBtn('Reset view', 'Reset the view', () => backend.resetView(), 'is-wide');
  bar.append(playBtn, ...speedBtns, zoomOut, zoomIn, reset);
  const credit = document.createElement('div');
  credit.className = 'gt-globe__credit';
  credit.textContent = 'Earth imagery: NASA Earth Observatory';
  if (showControls) root.append(readout, bar);
  root.appendChild(credit);

  const syncModeBadge = () => {
    badge.textContent = backend.mode === '3d' ? '3D' : 'FLAT MAP';
    root.dataset.mode = backend.mode;
  };
  syncModeBadge();

  const fmtClock = () => {
    const day = Math.floor(simT / 86400);
    const s = ((simT % 86400) + 86400) % 86400;
    const hh = String(Math.floor(s / 3600)).padStart(2, '0'), mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return `UTC ${hh}:${mm}  ·  day ${day}`;
  };
  const updateUi = () => {
    playBtn.textContent = playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', playing ? 'Pause time' : 'Play time');
    playBtn.setAttribute('aria-pressed', String(playing));
    speedBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(SPEEDS[i].v === scale)));
    clockText.textContent = fmtClock();
  };
  updateUi();

  // ---------------------------------------------------------- loop
  let raf = 0;
  let last = performance.now();
  let clockAcc = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible || document.hidden) return;
    if (playing) simT += dt * scale;
    clockAcc += dt;
    if (clockAcc > 0.25) { clockAcc = 0; clockText.textContent = fmtClock(); }
    backend.render(simT, dt);
  };
  raf = requestAnimationFrame(frame);

  const ro = new ResizeObserver(() => backend.resize());
  ro.observe(stage);
  const io = new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); });
  io.observe(root);

  const api: GlobeApi = {
    get mode() { return backend.mode; },
    element: root,
    get ready() { return backend.ready; },
    add(item) { items.set(item.id, item); backend.add(item); },
    remove(id) { items.delete(id); backend.remove(id); },
    clear() { items.clear(); backend.clear(); },
    setSimTime(t) { simT = t; clockText.textContent = fmtClock(); },
    getSimTime() { return simT; },
    setTimeScale(s) { scale = s; updateUi(); },
    play() { playing = true; updateUi(); },
    pause() { playing = false; updateUi(); },
    isPlaying() { return playing; },
    setSunDeclination(d) { sunDec = d; backend.setSun(d); },
    focus(lat, lon, dist, animate = true, aim) { backend.focus(lat, lon, dist, animate && !reduced, aim); },
    quality() { return quality; },
    onQualityChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    setDescription(text) { desc = text; backend.setDescription(text); },
    resize() { backend.resize(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      backend.dispose();
      root.remove();
      items.clear(); listeners.clear();
    },
  };
  return api;
}
