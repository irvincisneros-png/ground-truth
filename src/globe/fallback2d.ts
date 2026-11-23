/**
 * SVG equirectangular fallback. Same API as the WebGL backend, same orbit maths (orbits.ts).
 * Used when WebGL is unavailable or the context is lost. The NASA Blue Marble image is used as an
 * underlay when it can be fetched; otherwise a plain graticule map remains.
 */
import {
  circlePolygon, D2R, groundTrack, isDaylit, R2D, splitAtAntimeridian, subSatellitePoint, subSolarPoint, swathEdges, wrapLon,
  type LatLon,
} from './orbits';
import type { Backend, GlobeOptions, Quality, SceneItem } from './types';

const NS = 'http://www.w3.org/2000/svg';
const W = 720, H = 360;
const X = (lon: number) => (lon + 180) * 2;
const Y = (lat: number) => (90 - lat) * 2;

const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** Make a ring of lat/lon continuous in longitude (no jumps larger than 180 deg). */
function unwrap(pts: LatLon[]): LatLon[] {
  const out: LatLon[] = [];
  let off = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const d = pts[i].lon + off - out[i - 1].lon;
      if (d > 180) off -= 360; else if (d < -180) off += 360;
    }
    out.push({ lat: pts[i].lat, lon: pts[i].lon + off });
  }
  return out;
}

const pathOf = (pts: LatLon[], close = false) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.lon).toFixed(2)} ${Y(p.lat).toFixed(2)}`).join('') + (close ? 'Z' : '');

interface Entry { g: SVGGElement; update?: (t: number) => void }

export class Fallback2DBackend implements Backend {
  readonly mode = '2d' as const;
  readonly ready: Promise<void>;
  onFail?: (reason: string) => void;
  onQualityHint?: (q: Quality, reason: string) => void;

  private host: HTMLElement;
  private svg: SVGSVGElement;
  private itemsLayer: SVGGElement;
  private night: SVGPathElement;
  private entries = new Map<string, Entry>();
  private cur: { lat: number; lon: number; z: number };
  private tgt: { lat: number; lon: number; z: number };
  private home: { lat: number; lon: number; z: number };
  private sunDec: number;
  private size = { w: 1, h: 1 };
  private desc: HTMLElement;
  private disposed = false;
  private drag: { x: number; y: number; id: number } | null = null;
  private handlers: [string, EventListener][] = [];

  constructor(host: HTMLElement, opts: GlobeOptions, baseUrl: string) {
    this.host = host;
    const v = opts.view ?? { lat: 8, lon: 135, dist: 3.4 };
    const z = Math.max(1, Math.min(8, 6.5 / v.dist));
    this.cur = { lat: v.lat, lon: v.lon, z };
    this.tgt = { ...this.cur };
    this.home = { ...this.cur };
    this.sunDec = opts.sunDecDeg ?? -12;

    this.svg = el('svg', { class: 'gt-globe__svg', role: 'application', tabindex: 0, preserveAspectRatio: 'xMidYMid slice' });
    this.svg.setAttribute('aria-label', opts.ariaLabel ?? 'Flat world map. Drag or use the arrow keys to move, plus and minus to zoom.');
    this.desc = document.createElement('p');
    this.desc.className = 'gt-sr-only';
    this.desc.id = `gt-map-desc-${Math.random().toString(36).slice(2, 8)}`;
    this.svg.setAttribute('aria-describedby', this.desc.id);

    const defs = el('defs');
    const clip = el('clipPath', { id: `gt-clip-${this.desc.id}` });
    clip.appendChild(el('rect', { x: 0, y: 0, width: W, height: H }));
    defs.appendChild(clip);
    this.svg.appendChild(defs);
    this.svg.appendChild(el('rect', { x: -W, y: -H, width: W * 3, height: H * 3, fill: '#050d1c' }));
    const world = el('g', { 'clip-path': `url(#gt-clip-${this.desc.id})` });
    const img = el('image', { href: baseUrl + 'assets/earth/day_2048.jpg', x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'none', opacity: 0, class: 'gt-globe__tex' });
    world.appendChild(img);
    world.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#0b1a33', opacity: 0.35, 'pointer-events': 'none' }));

    // graticule
    const grat = el('g', { class: 'gt-globe__grat', 'pointer-events': 'none' });
    for (let lon = -180; lon <= 180; lon += 30) grat.appendChild(el('path', { d: `M${X(lon)} 0V${H}`, 'vector-effect': 'non-scaling-stroke' }));
    for (let lat = -60; lat <= 60; lat += 30) grat.appendChild(el('path', { d: `M0 ${Y(lat)}H${W}`, 'vector-effect': 'non-scaling-stroke', class: lat === 0 ? 'is-eq' : '' }));
    world.appendChild(grat);
    this.night = el('path', { class: 'gt-globe__night', 'pointer-events': 'none' });
    world.appendChild(this.night);
    this.itemsLayer = el('g');
    world.appendChild(this.itemsLayer);
    this.svg.appendChild(world);
    host.append(this.svg, this.desc);

    this.ready = new Promise<void>((res) => {
      const probe = new Image();
      probe.onload = () => { img.setAttribute('opacity', '1'); res(); };
      probe.onerror = () => res(); // plain graticule map stays
      probe.src = baseUrl + 'assets/earth/day_2048.jpg';
    });

    const on = (type: string, fn: EventListener) => { this.svg.addEventListener(type, fn); this.handlers.push([type, fn]); };
    on('keydown', ((e: KeyboardEvent) => {
      const step = 10 / this.tgt.z;
      let used = true;
      if (e.key === 'ArrowLeft') this.tgt.lon -= step;
      else if (e.key === 'ArrowRight') this.tgt.lon += step;
      else if (e.key === 'ArrowUp') this.tgt.lat += step;
      else if (e.key === 'ArrowDown') this.tgt.lat -= step;
      else if (e.key === '+' || e.key === '=') this.zoomBy(0.8);
      else if (e.key === '-' || e.key === '_') this.zoomBy(1.25);
      else if (e.key === '0' || e.key === 'Home') this.resetView();
      else used = false;
      if (used) e.preventDefault();
    }) as EventListener);
    on('wheel', ((e: WheelEvent) => { e.preventDefault(); this.zoomBy(Math.exp(e.deltaY * 0.0014)); }) as EventListener);
    on('pointerdown', ((e: PointerEvent) => { this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; this.svg.setPointerCapture?.(e.pointerId); }) as EventListener);
    on('pointermove', ((e: PointerEvent) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const degPerPx = (360 / this.tgt.z) / this.size.w;
      this.tgt.lon -= (e.clientX - this.drag.x) * degPerPx;
      this.tgt.lat += (e.clientY - this.drag.y) * degPerPx;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    }) as EventListener);
    const up = (() => { this.drag = null; }) as EventListener;
    on('pointerup', up); on('pointercancel', up);
    this.resize();
  }

  add(item: SceneItem): void {
    this.remove(item.id);
    const g = el('g', { 'data-id': item.id });
    const entry: Entry = { g };
    const color = 'color' in item ? item.color : '#fff';
    g.style.setProperty('--c', color);

    switch (item.kind) {
      case 'sat': {
        const dot = el('g', { class: 'gt-2d-sat' });
        dot.appendChild(el('circle', { r: 11, fill: color, opacity: 0.18 }));
        // tiny spacecraft glyph: bus with two panels
        dot.appendChild(el('path', { d: 'M-9 -2h5v4h-5zM4 -2h5v4h-5zM-3 -3h6v6h-6z', fill: color, stroke: '#04101f', 'stroke-width': 0.6 }));
        const tx = el('text', { x: 13, y: 4, class: 'gt-2d-label' });
        tx.textContent = item.label;
        dot.appendChild(tx);
        g.appendChild(dot);
        entry.update = (t) => {
          const p = subSatellitePoint(item.orbit, t);
          const u = this.unit();
          dot.setAttribute('transform', `translate(${X(p.lon)} ${Y(p.lat)}) scale(${u})`);
        };
        break;
      }
      case 'track': {
        const all = groundTrack(item.orbit, item.t0, item.t1, item.stepS ?? 60);
        const runs: typeof all[] = [];
        let cur: typeof all = [];
        for (const p of all) {
          if (!item.dayOnly || isDaylit(p.lat, p.lon, p.t, item.dayOnly.decDeg)) cur.push(p); else if (cur.length) { runs.push(cur); cur = []; }
        }
        if (cur.length) runs.push(cur);
        const segs = runs.flatMap((r) => splitAtAntimeridian(r));
        const path = el('path', {
          d: segs.map((s) => pathOf(s)).join(''), fill: 'none', stroke: color, 'stroke-width': item.width ?? 1.4,
          'stroke-opacity': item.opacity ?? 0.95, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
        });
        g.appendChild(path);
        break;
      }
      case 'swath': {
        const e = swathEdges(item.orbit, item.t0, item.t1, item.widthKm, item.stepS ?? 60);
        let d = '';
        let start = 0;
        const step = item.stepS ?? 60;
        const lit = (i: number) => !item.dayOnly || isDaylit(e.centre[i].lat, e.centre[i].lon, item.t0 + i * step, item.dayOnly.decDeg);
        const brk = (i: number) => i > 0 && (Math.abs(e.left[i].lon - e.left[i - 1].lon) > 180 || Math.abs(e.right[i].lon - e.right[i - 1].lon) > 180 || lit(i) !== lit(i - 1));
        for (let i = 1; i <= e.left.length; i++) {
          if (i === e.left.length || brk(i)) {
            const L = e.left.slice(start, i), R = e.right.slice(start, i).reverse();
            if (L.length > 1 && lit(start)) d += pathOf(unwrap([...L, ...R]), true);
            start = i;
          }
        }
        g.appendChild(el('path', { d, fill: color, 'fill-opacity': item.opacity ?? 0.28, 'pointer-events': 'none' }));
        break;
      }
      case 'disc': {
        const ring = unwrap(circlePolygon({ lat: item.lat, lon: item.lon }, item.radiusDeg, 160));
        for (const off of [-360, 0, 360]) {
          const sh = ring.map((p) => ({ lat: p.lat, lon: p.lon + off }));
          g.appendChild(el('path', { d: pathOf(sh, true), fill: color, 'fill-opacity': item.opacity ?? 0.16, stroke: color, 'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
          if (item.innerRadiusDeg) {
            const inn = unwrap(circlePolygon({ lat: item.lat, lon: item.lon }, item.innerRadiusDeg, 120)).map((p) => ({ lat: p.lat, lon: p.lon + off }));
            g.appendChild(el('path', { d: pathOf(inn, true), fill: color, 'fill-opacity': (item.opacity ?? 0.16) * 1.1, 'pointer-events': 'none' }));
          }
        }
        if (item.label) g.appendChild(this.pinText(item.label, item.lon, item.lat));
        break;
      }
      case 'marker': {
        const m = el('g', { class: 'gt-2d-marker' });
        m.appendChild(el('circle', { r: 5, fill: 'none', stroke: color, 'stroke-width': 1.6 }));
        m.appendChild(el('circle', { r: 2, fill: color }));
        if (item.label) { const t = el('text', { x: 9, y: 4, class: 'gt-2d-label' }); t.textContent = item.label; m.appendChild(t); }
        g.appendChild(m);
        entry.update = () => m.setAttribute('transform', `translate(${X(item.lon)} ${Y(item.lat)}) scale(${this.unit()})`);
        break;
      }
      case 'pixels': {
        for (const c of item.cells) {
          const dLat = c.sizeKm / 2 / 111.19, dLon = dLat / Math.max(Math.cos(c.lat * D2R), 0.05);
          g.appendChild(el('rect', { x: X(c.lon - dLon), y: Y(c.lat + dLat), width: dLon * 4, height: dLat * 4, fill: c.color, 'fill-opacity': c.alpha ?? 0.85 }));
        }
        break;
      }
      case 'region': {
        if (item.cap) {
          const south = item.cap.latDeg < 0;
          const y0 = south ? Y(item.cap.latDeg) : 0, h = south ? H - y0 : Y(item.cap.latDeg);
          g.appendChild(el('rect', { x: 0, y: y0, width: W, height: h, fill: color, 'fill-opacity': item.fillOpacity ?? 0.16, stroke: color, 'vector-effect': 'non-scaling-stroke' }));
          if (item.label) g.appendChild(this.pinText(item.label, 0, item.cap.latDeg + (south ? -6 : 6)));
        } else if (item.ring) {
          const ring = item.ring.map(([lat, lon]) => ({ lat, lon }));
          g.appendChild(el('path', { d: pathOf(ring, true), fill: color, 'fill-opacity': item.fillOpacity ?? 0.16, stroke: color, 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke' }));
          if (item.label) {
            const cl = ring.reduce((s, p) => s + p.lat, 0) / ring.length, co = ring.reduce((s, p) => s + p.lon, 0) / ring.length;
            g.appendChild(this.pinText(item.label, co, cl));
          }
        }
        break;
      }
      case 'latline': {
        g.appendChild(el('path', { d: `M0 ${Y(item.latDeg)}H${W}`, stroke: color, 'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke', fill: 'none', 'pointer-events': 'none' }));
        if (item.label) g.appendChild(this.pinText(item.label, wrapLon(-170), item.latDeg + 3));
        break;
      }
    }
    this.itemsLayer.appendChild(g);
    this.entries.set(item.id, entry);
  }

  private pinText(text: string, lon: number, lat: number): SVGGElement {
    const g = el('g');
    const t = el('text', { class: 'gt-2d-label gt-2d-pin' });
    t.textContent = text;
    g.appendChild(t);
    const place = () => g.setAttribute('transform', `translate(${X(lon)} ${Y(lat)}) scale(${this.unit()})`);
    place();
    (g as unknown as { _place: () => void })._place = place;
    this.pins.add(g);
    return g;
  }
  private pins = new Set<SVGGElement>();

  remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.g.querySelectorAll('g').forEach((n) => this.pins.delete(n as SVGGElement));
    this.pins.delete(e.g);
    e.g.remove();
    this.entries.delete(id);
  }
  clear(): void { for (const id of [...this.entries.keys()]) this.remove(id); }

  /** viewBox units per CSS pixel: keeps labels and glyphs a constant size on screen. */
  private unit(): number { return (W / this.cur.z) / this.size.w; }

  focus(lat: number, lon: number, dist: number | undefined, animate: boolean): void {
    this.tgt.lat = Math.max(-85, Math.min(85, lat));
    this.tgt.lon = this.cur.lon + wrapLon(lon - this.cur.lon);
    if (dist !== undefined) this.tgt.z = Math.max(1, Math.min(8, 6.5 / dist));
    if (!animate) this.cur = { ...this.tgt };
  }
  zoomBy(f: number): void { this.tgt.z = Math.max(1, Math.min(8, this.tgt.z / f)); }
  resetView(): void { this.tgt = { ...this.home }; }
  setDescription(text: string): void { this.desc.textContent = text; }
  setSun(decDeg: number): void { this.sunDec = decDeg; }
  setQuality(): void { /* nothing to degrade */ }

  resize(): void {
    this.size = { w: Math.max(1, this.host.clientWidth), h: Math.max(1, this.host.clientHeight) };
  }

  render(t: number, dt: number): void {
    if (this.disposed) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
    this.cur.lon += wrapLon(this.tgt.lon - this.cur.lon) * k;
    this.cur.lat += (this.tgt.lat - this.cur.lat) * k;
    this.cur.z += (this.tgt.z - this.cur.z) * k;
    // viewBox follows the container aspect ratio with 'slice' semantics handled manually
    const aspect = this.size.w / this.size.h;
    let vw = W / this.cur.z, vh = vw / aspect;
    if (vh > H) { vh = H; vw = vh * aspect; }
    const cx = Math.max(vw / 2, Math.min(W - vw / 2, X(this.cur.lon))), cy = Math.max(vh / 2, Math.min(H - vh / 2, Y(this.cur.lat)));
    this.svg.setAttribute('viewBox', `${(cx - vw / 2).toFixed(2)} ${(cy - vh / 2).toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    for (const e of this.entries.values()) e.update?.(t);
    this.pins.forEach((p) => (p as unknown as { _place: () => void })._place?.());
    this.drawNight(t);
  }

  private drawNight(t: number): void {
    const ss = subSolarPoint(t, this.sunDec);
    const dec = Math.abs(this.sunDec) < 0.3 ? 0.3 : this.sunDec;
    const pts: string[] = [];
    for (let lon = -180; lon <= 180; lon += 3) {
      const lat = Math.atan(-Math.cos((lon - ss.lon) * D2R) / Math.tan(dec * D2R)) * R2D;
      pts.push(`${X(lon).toFixed(1)} ${Y(lat).toFixed(1)}`);
    }
    const edge = dec > 0 ? H : 0;
    this.night.setAttribute('d', `M${pts.join('L')}L${W} ${edge}L0 ${edge}Z`);
  }

  dispose(): void {
    this.disposed = true;
    this.handlers.forEach(([t, f]) => this.svg.removeEventListener(t, f));
    this.svg.remove(); this.desc.remove();
  }
}
