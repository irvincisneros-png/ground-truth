/** Orbit Run sprites: satellite, space junk, moon, starfield and glows, drawn once in code onto offscreen canvases. */
import { EYE_ICON } from './icons';
import { SENSORS, SENSOR_ORDER } from './content';
import type { SensorId } from './content';
import { fbm } from './textures';

type C2 = CanvasRenderingContext2D;
export interface Sprite { canvas: HTMLCanvasElement; w: number; h: number; ox: number; oy: number }
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
/** A sprite covering [-ox, w-ox] x [-oy, h-oy] units, painted at `k` pixels per unit. */
function sprite(w: number, h: number, ox: number, oy: number, k: number, paint: (c: C2) => void): Sprite {
  const canvas = mk(w * k, h * k), c = canvas.getContext('2d')!;
  c.scale(k, k); c.translate(ox, oy); c.lineJoin = 'round'; c.lineCap = 'round';
  paint(c);
  return { canvas, w, h, ox, oy };
}
export function drawSprite(c: C2, s: Sprite, scale = 1) { c.drawImage(s.canvas, -s.ox * scale, -s.oy * scale, s.w * scale, s.h * scale); }
const rnd = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function poly(c: C2, pts: number[]) { c.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? c.lineTo(pts[i], pts[i + 1]) : c.moveTo(pts[i], pts[i + 1]); c.closePath(); }
function rrect(c: C2, x: number, y: number, w: number, h: number, r: number) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const lin = (c: C2, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };
const rad = (c: C2, x: number, y: number, r0: number, r1: number, stops: [number, string][]) => { const g = c.createRadialGradient(x, y, r0, x, y, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };

/* ---------- solar panel (shared by the satellite and the junk) ---------- */
function solarPanel(c: C2, x: number, y: number, w: number, h: number, cols: number, rows: number, dead = false) {
  c.fillStyle = lin(c, x, y, x, y + h, dead ? [[0, '#34496f'], [1, '#1a2540']] : [[0, '#2f6fd8'], [0.5, '#1c48a4'], [1, '#0e2763']]);
  c.fillRect(x, y, w, h);
  // cells: every second one a touch lighter, like real strings of cells
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if ((i + j) % 2 === 0) { c.fillStyle = 'rgba(140,190,255,.09)'; c.fillRect(x + (w / cols) * i, y + (h / rows) * j, w / cols, h / rows); }
  c.strokeStyle = dead ? 'rgba(150,170,205,.4)' : 'rgba(170,210,255,.5)'; c.lineWidth = 0.45; c.beginPath();
  for (let i = 1; i < cols; i++) { c.moveTo(x + (w / cols) * i, y); c.lineTo(x + (w / cols) * i, y + h); }
  for (let j = 1; j < rows; j++) { c.moveTo(x, y + (h / rows) * j); c.lineTo(x + w, y + (h / rows) * j); }
  c.stroke();
  if (!dead) { c.fillStyle = lin(c, x, y + h, x + w, y, [[0.25, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,.2)'], [0.62, 'rgba(255,255,255,0)']]); c.fillRect(x, y, w, h); }
  c.lineWidth = 1.1; c.strokeStyle = dead ? '#7b889f' : '#c4cfe3'; c.strokeRect(x, y, w, h);
  c.lineWidth = 0.5; c.strokeStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(x + 0.4, y + h - 0.4); c.lineTo(x + 0.4, y + 0.4); c.lineTo(x + w - 0.4, y + 0.4); c.stroke();
}
function foil(c: C2, x: number, y: number, w: number, h: number, r: number, seed: number, cols: [string, string, string]) {
  c.save(); rrect(c, x, y, w, h, r); c.fillStyle = lin(c, x, y, x + w * 0.25, y + h, [[0, cols[0]], [0.5, cols[1]], [1, cols[2]]]); c.fill(); c.clip();
  const R = rnd(seed); // crinkled foil facets
  for (let i = 0; i < 16; i++) {
    const px = x + R() * w, py = y + R() * h, s = 3 + R() * 6;
    c.fillStyle = i % 2 ? 'rgba(255,250,220,.2)' : 'rgba(80,40,0,.16)';
    poly(c, [px, py, px + (R() - 0.5) * s * 2, py + (R() - 0.5) * s * 2, px + (R() - 0.5) * s * 2, py + (R() - 0.5) * s * 2]); c.fill();
  }
  c.fillStyle = lin(c, x, y, x, y + h, [[0, 'rgba(255,255,255,.4)'], [0.2, 'rgba(255,255,255,0)'], [0.75, 'rgba(0,0,0,0)'], [1, 'rgba(40,16,0,.4)']]); c.fillRect(x, y, w, h);
  c.restore();
}

/* ---------- the player's satellite (origin = centre of the bus; the sensor looks straight down) ---------- */
export const SAT_LENS_Y = 19;       // lens position under the bus, in sprite units
export const SAT_NOZZLE: [number, number] = [-19.5, 12.5];
export function makeSatellite(k: number): Sprite {
  return sprite(160, 62, 80, 30, k, (c) => {
    // wing spar and yokes
    c.strokeStyle = '#8f9bb5'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-74, -1); c.lineTo(74, -1); c.stroke();
    c.strokeStyle = '#c4cfe3'; c.lineWidth = 1; c.beginPath();
    for (const s of [-1, 1]) { c.moveTo(s * 14, -6); c.lineTo(s * 22, -1); c.lineTo(s * 14, 4); }
    c.stroke();
    for (const s of [-1, 1]) for (let p = 0; p < 2; p++) { const x = s > 0 ? 22 + p * 27 : -22 - (p + 1) * 27 + 1.5; solarPanel(c, x, -12, 25.5, 22, 4, 3); }
    // thruster nozzle (lower rear)
    c.fillStyle = lin(c, -20, 9, -14, 15, [[0, '#6b7790'], [1, '#262f45']]); poly(c, [-13, 6, -15.5, 4.8, -21.5, 10.5, -17.5, 14.5, -11, 9]); c.fill();
    c.strokeStyle = '#aab6cf'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-21.5, 10.5); c.lineTo(-17.5, 14.5); c.stroke();
    // instrument deck under the bus, with the lens barrel
    c.fillStyle = lin(c, -9, 0, 9, 0, [[0, '#3b4866'], [0.35, '#55648a'], [1, '#161e33']]); poly(c, [-9.5, 10, 9.5, 10, 7, 17.5, -7, 17.5]); c.fill();
    c.fillStyle = '#0a101e'; c.beginPath(); c.ellipse(0, 17.6, 7, 2.5, 0, 0, 6.283); c.fill();
    c.strokeStyle = '#9fb0d4'; c.lineWidth = 0.8; c.beginPath(); c.ellipse(0, 17.6, 7, 2.5, 0, 0, 6.283); c.stroke();
    // bus: gold thermal foil
    foil(c, -15, -13, 30, 24, 3.2, 7, ['#ffe7a8', '#f3ae45', '#9a5c12']);
    rrect(c, -15, -13, 30, 24, 3.2); c.strokeStyle = '#3d2608'; c.lineWidth = 0.9; c.stroke();
    // silver radiator on the leading face
    c.fillStyle = lin(c, 8, 0, 14, 0, [[0, '#eef3fb'], [1, '#93a1bd']]); rrect(c, 8, -10, 5.2, 18, 1); c.fill();
    c.strokeStyle = 'rgba(40,55,90,.55)'; c.lineWidth = 0.5; c.beginPath(); for (let i = 0; i < 6; i++) { c.moveTo(8.6, -8 + i * 3); c.lineTo(12.6, -8 + i * 3); } c.stroke();
    // dark avionics window (status lights are drawn live on top)
    c.fillStyle = '#131d36'; rrect(c, -11.5, -8.6, 12.5, 4, 1.4); c.fill();
    c.strokeStyle = 'rgba(255,240,200,.5)'; c.lineWidth = 0.4; c.stroke();
    // access hatch and seams in the foil
    c.strokeStyle = 'rgba(70,36,4,.5)'; c.lineWidth = 0.5; rrect(c, -10.5, -1.5, 9, 8, 1); c.stroke();
    c.beginPath(); c.moveTo(1.5, -12); c.lineTo(1.5, 10); c.stroke();
    c.fillStyle = 'rgba(70,36,4,.6)'; for (const [bx, by] of [[-9.3, -0.4], [-2.7, -0.4], [-9.3, 5.4], [-2.7, 5.4]]) { c.beginPath(); c.arc(bx, by, 0.5, 0, 6.283); c.fill(); }
    // star tracker and whip antenna
    c.fillStyle = lin(c, -12, -17, -7, -17, [[0, '#d5deee'], [1, '#6f7c98']]); c.fillRect(-12, -16.5, 5, 4);
    c.fillStyle = '#0a101e'; c.fillRect(-12, -17.3, 5, 1.2);
    c.strokeStyle = '#c4cfe3'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-3, -13); c.lineTo(-4.5, -25); c.stroke();
    // dish antenna
    c.strokeStyle = '#aab6cf'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(6, -13); c.lineTo(7.5, -18.5); c.stroke();
    c.save(); c.translate(8.2, -20.5); c.rotate(-0.42);
    c.fillStyle = lin(c, -7.5, 0, 7.5, 0, [[0, '#ffffff'], [0.6, '#cbd6ea'], [1, '#7c8aa8']]);
    c.beginPath(); c.moveTo(-7.5, -2.6); c.quadraticCurveTo(0, 5.6, 7.5, -2.6); c.quadraticCurveTo(0, -0.4, -7.5, -2.6); c.fill();
    c.strokeStyle = '#3a4764'; c.lineWidth = 0.5; c.stroke();
    c.strokeStyle = '#dfe7f5'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-4, 0.2); c.lineTo(0, -6.5); c.lineTo(4, 0.2); c.stroke();
    c.fillStyle = '#ffb547'; c.beginPath(); c.arc(0, -6.5, 1.1, 0, 6.283); c.fill();
    c.restore();
  });
}

/* ---------- space junk: four kinds, all drawn for radius 27 and scaled ---------- */
export const JUNK_R = 27;
function metal(c: C2, x0: number, y0: number, x1: number, y1: number) { return lin(c, x0, y0, x1, y1, [[0, '#dfe6f3'], [0.35, '#a9b6cf'], [0.6, '#6f7d9c'], [1, '#39445f']]); }
export function makeJunk(k: number): Sprite[] {
  const r = JUNK_R, S = (paint: (c: C2) => void) => sprite(r * 3.4, r * 3.4, r * 1.7, r * 1.7, k, (c) => { c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 5 * k; c.shadowOffsetY = 2 * k; paint(c); });
  const edge = (c: C2) => { c.strokeStyle = '#0c1322'; c.lineWidth = 1.5; c.stroke(); };
  return [
    S((c) => { // torn solar panel with a bent strut
      c.strokeStyle = '#9aa7c0'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-r * 0.9, r * 0.05); c.lineTo(-r * 1.35, r * 0.5); c.lineTo(-r * 1.2, r * 0.85); c.stroke();
      c.save();
      poly(c, [-r * 1.0, -r * 0.55, r * 0.62, -r * 0.72, r * 0.86, -r * 0.4, r * 1.1, -r * 0.3, r * 0.82, r * 0.02, r * 1.02, r * 0.2, r * 0.56, r * 0.3, r * 0.42, r * 0.66, r * 0.05, r * 0.42, -r * 0.3, r * 0.5, -r * 0.92, r * 0.56]);
      c.fillStyle = '#1a2540'; c.fill(); c.shadowColor = 'transparent'; c.clip();
      c.rotate(-0.07); solarPanel(c, -r * 1.2, -r * 0.8, r * 2.5, r * 1.5, 7, 4, true);
      c.fillStyle = 'rgba(8,12,24,.55)'; c.beginPath(); c.arc(r * 0.2, -r * 0.1, r * 0.22, 0, 6.283); c.fill(); // impact hole
      c.strokeStyle = 'rgba(8,12,24,.7)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(r * 0.2, -r * 0.1); c.lineTo(r * 0.7, -r * 0.5); c.moveTo(r * 0.2, -r * 0.1); c.lineTo(-r * 0.3, r * 0.35); c.moveTo(r * 0.2, -r * 0.1); c.lineTo(r * 0.6, r * 0.25); c.stroke();
      c.restore();
      poly(c, [-r * 1.0, -r * 0.55, r * 0.62, -r * 0.72, r * 0.86, -r * 0.4, r * 1.1, -r * 0.3, r * 0.82, r * 0.02, r * 1.02, r * 0.2, r * 0.56, r * 0.3, r * 0.42, r * 0.66, r * 0.05, r * 0.42, -r * 0.3, r * 0.5, -r * 0.92, r * 0.56]);
      c.shadowColor = 'transparent'; edge(c);
    }),
    S((c) => { // spent rocket stage
      c.fillStyle = lin(c, r * 1.05, 0, r * 1.5, 0, [[0, '#2a3248'], [1, '#0c1322']]); poly(c, [r * 1.05, -r * 0.24, r * 1.52, -r * 0.48, r * 1.52, r * 0.48, r * 1.05, r * 0.24]); c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = '#8492ad'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(r * 1.52, -r * 0.48); c.lineTo(r * 1.52, r * 0.48); c.stroke();
      rrect(c, -r * 1.2, -r * 0.44, r * 2.3, r * 0.88, r * 0.12); c.fillStyle = lin(c, 0, -r * 0.44, 0, r * 0.44, [[0, '#f2f5fb'], [0.25, '#c6d0e2'], [0.6, '#7d8aa6'], [1, '#353f58']]); c.fill();
      c.save(); c.clip();
      c.fillStyle = lin(c, 0, -r * 0.44, 0, r * 0.44, [[0, '#ffd27a'], [0.5, '#e09a2c'], [1, '#7a4c0c']]); c.fillRect(-r * 0.2, -r, r * 0.3, r * 2);
      c.fillStyle = 'rgba(12,19,34,.55)'; c.fillRect(-r * 0.78, -r, r * 0.07, r * 2); c.fillRect(r * 0.55, -r, r * 0.07, r * 2);
      c.fillStyle = lin(c, r * 0.6, 0, r * 1.1, 0, [[0, 'rgba(20,14,10,0)'], [1, 'rgba(20,14,10,.6)']]); c.fillRect(r * 0.6, -r, r * 0.6, r * 2); // scorch
      c.fillStyle = 'rgba(12,19,34,.75)'; poly(c, [-r * 1.2, -r * 0.5, -r * 0.92, -r * 0.5, -r * 1.04, -r * 0.12, -r * 0.95, r * 0.1, -r * 1.1, r * 0.5, -r * 1.2, r * 0.5]); c.fill(); // torn end
      c.restore();
      rrect(c, -r * 1.2, -r * 0.44, r * 2.3, r * 0.88, r * 0.12); edge(c);
    }),
    S((c) => { // dead satellite: dull foil bus, one snapped wing, bent antenna
      c.strokeStyle = '#8f9bb5'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(r * 0.5, -r * 0.2); c.lineTo(r * 0.95, -r * 0.55); c.lineTo(r * 1.25, -r * 0.35); c.stroke();
      c.save(); poly(c, [-r * 0.55, -r * 0.42, -r * 1.4, -r * 0.62, -r * 1.22, -r * 0.2, -r * 1.42, r * 0.02, -r * 0.55, r * 0.12]); c.fillStyle = '#1a2540'; c.fill(); c.shadowColor = 'transparent'; c.clip(); c.rotate(0.14); solarPanel(c, -r * 1.6, -r * 0.7, r * 1.2, r * 0.9, 4, 3, true); c.restore();
      c.shadowColor = 'transparent';
      poly(c, [-r * 0.55, -r * 0.42, -r * 1.4, -r * 0.62, -r * 1.22, -r * 0.2, -r * 1.42, r * 0.02, -r * 0.55, r * 0.12]); edge(c);
      foil(c, -r * 0.58, -r * 0.6, r * 1.16, r * 1.2, r * 0.12, 23, ['#d8b87a', '#9c7636', '#4a3312']);
      rrect(c, -r * 0.58, -r * 0.6, r * 1.16, r * 1.2, r * 0.12); edge(c);
      c.fillStyle = '#10182c'; rrect(c, -r * 0.34, -r * 0.3, r * 0.62, r * 0.5, 2); c.fill();
      c.fillStyle = metal(c, -r * 0.3, r * 0.6, r * 0.3, r * 0.9); poly(c, [-r * 0.3, r * 0.6, r * 0.3, r * 0.6, r * 0.2, r * 0.92, -r * 0.2, r * 0.92]); c.fill(); edge(c);
      c.fillStyle = metal(c, -r * 0.3, -r, r * 0.3, -r * 0.6); c.beginPath(); c.moveTo(-r * 0.36, -r * 0.98); c.quadraticCurveTo(0, -r * 0.44, r * 0.36, -r * 0.98); c.quadraticCurveTo(0, -r * 0.8, -r * 0.36, -r * 0.98); c.fill(); edge(c);
    }),
    S((c) => { // a tumbling cluster of torn metal shards
      const R = rnd(91);
      for (const [dx, dy, s, a] of [[-0.55, -0.35, 0.62, 0.3], [0.5, -0.42, 0.5, 1.6], [0.12, 0.52, 0.66, 2.7], [-0.7, 0.55, 0.3, 0.9], [0.92, 0.3, 0.28, 2.1]] as const) {
        c.save(); c.translate(dx * r, dy * r); c.rotate(a);
        const pts: number[] = []; const n = 5 + Math.floor(R() * 3);
        for (let i = 0; i < n; i++) { const an = (i / n) * 6.283, rr = r * s * (0.55 + R() * 0.5); pts.push(Math.cos(an) * rr, Math.sin(an) * rr * 0.72); }
        poly(c, pts); c.fillStyle = s === 0.5 ? lin(c, -r * s, -r * s, r * s, r * s, [[0, '#ffd98a'], [0.5, '#d6902a'], [1, '#6a430c']]) : metal(c, -r * s, -r * s, r * s, r * s); c.fill();
        c.save(); c.shadowColor = 'transparent'; edge(c);
        c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(pts[0] * 0.8, pts[1] * 0.8); c.lineTo(pts[2] * 0.75, pts[3] * 0.75); c.stroke(); c.restore();
        c.restore();
      }
    }),
  ];
}

/* ---------- glows ---------- */
const glowCache = new Map<string, HTMLCanvasElement>();
/** A soft round glow, cached per colour. `hot` adds a white core (data points, lens). */
export function glow(color: string, hot = false): HTMLCanvasElement {
  const key = color + (hot ? '!' : '');
  let g = glowCache.get(key);
  if (!g) {
    g = mk(64, 64); const c = g.getContext('2d')!, n = parseInt(color.slice(1), 16), rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    c.fillStyle = rad(c, 32, 32, 0, 32, hot ? [[0, 'rgba(255,255,255,1)'], [0.22, `rgba(${rgb},.9)`], [0.55, `rgba(${rgb},.28)`], [1, `rgba(${rgb},0)`]] : [[0, `rgba(${rgb},.85)`], [0.45, `rgba(${rgb},.32)`], [1, `rgba(${rgb},0)`]]);
    c.fillRect(0, 0, 64, 64); glowCache.set(key, g);
  }
  return g;
}
export function drawGlow(c: C2, g: HTMLCanvasElement, x: number, y: number, rx: number, ry = rx) { c.drawImage(g, x - rx, y - ry, rx * 2, ry * 2); }

/* ---------- moon ---------- */
export function makeMoon(k: number): Sprite {
  const r = 26;
  return sprite(r * 2 + 28, r * 2 + 28, r + 14, r + 14, k, (c) => {
    c.fillStyle = rad(c, 0, 0, r, r + 14, [[0, 'rgba(190,210,255,.16)'], [1, 'rgba(190,210,255,0)']]); c.beginPath(); c.arc(0, 0, r + 14, 0, 6.283); c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.clip();
    c.fillStyle = rad(c, -8, -9, 2, r * 1.5, [[0, '#f1f4fa'], [0.6, '#c3cbdb'], [1, '#8792ab']]); c.fillRect(-r, -r, r * 2, r * 2);
    const R = rnd(5);
    c.fillStyle = 'rgba(104,116,146,.28)'; // maria
    for (const [x, y, rx, ry] of [[-7, -6, 9, 7], [5, 2, 8, 10], [-10, 9, 6, 5], [9, -11, 5, 4]]) { c.beginPath(); c.ellipse(x, y, rx, ry, 0.4, 0, 6.283); c.fill(); }
    for (let i = 0; i < 16; i++) { // craters: dark bowl, lit far rim
      const a = R() * 6.283, d = Math.sqrt(R()) * r * 0.9, x = Math.cos(a) * d, y = Math.sin(a) * d, cr = 0.8 + R() * R() * 3.6;
      c.fillStyle = 'rgba(84,96,128,.4)'; c.beginPath(); c.arc(x, y, cr, 0, 6.283); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 0.5; c.beginPath(); c.arc(x, y, cr, 0.3, 2.2); c.stroke();
    }
    // shaded limb
    c.fillStyle = lin(c, -r, -r, r, r, [[0.45, 'rgba(5,9,20,0)'], [0.95, 'rgba(5,9,20,.85)']]); c.fillRect(-r, -r, r * 2, r * 2);
    c.restore();
  });
}

/* ---------- starfield (tiles horizontally) ---------- */
export const SKY_TILE = 1100;
export function makeStars(k: number, hU: number, rich: boolean): Sprite {
  return sprite(SKY_TILE, hU, 0, 0, k, (c) => {
    const R = rnd(1977);
    if (rich) { // a faint band of the Milky Way, shaded per pixel at low resolution (with dither, so it never bands)
      const w = 352, h = 96, m = mk(w, h), g = m.getContext('2d')!, img = g.createImageData(w, h), d = img.data;
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const X = x / w, Y = y / h, dd = (Y - (0.3 + 0.13 * Math.sin(X * 6.2832 + 0.6))) / 0.2;
        const n = fbm(X * 6, Y * 2.4, 6, 4, 151), lane = 1 - Math.abs(2 * fbm(X * 10, Y * 5, 10, 3, 157) - 1);
        const a = Math.max(0, Math.exp(-dd * dd) * (0.15 + 1.5 * (n - 0.3)) * (1 - 0.55 * lane * lane)) * 0.3 + 0.012 * n, warm = fbm(X * 4, Y * 2, 4, 2, 163);
        d[i++] = 96 + 90 * warm; d[i++] = 112 + 30 * warm; d[i++] = 205 - 40 * warm; d[i++] = Math.min(255, a * 255 + R() * 1.6);
      }
      g.putImageData(img, 0, 0);
      c.imageSmoothingQuality = 'high'; c.drawImage(m, 0, 0, SKY_TILE, hU);
    }
    const n = rich ? 380 : 170;
    for (let i = 0; i < n; i++) {
      const x = R() * SKY_TILE, y = R() * hU, m = R() * R(), s = 0.45 + m * 1.1, tint = R();
      const col = tint < 0.12 ? '255,217,176' : tint < 0.3 ? '188,208,255' : '238,243,255';
      if (rich && m > 0.5) { c.fillStyle = rad(c, x, y, 0, s * 3.2, [[0, `rgba(${col},.3)`], [1, `rgba(${col},0)`]]); c.beginPath(); c.arc(x, y, s * 3.2, 0, 6.283); c.fill(); }
      c.fillStyle = `rgba(${col},${(0.3 + m * 0.7).toFixed(2)})`;
      c.beginPath(); c.arc(x, y, s * 0.62, 0, 6.283); c.fill();
    }
    c.globalAlpha = 1;
  });
}

/* ---------- sensor icons as images (the same authored SVG the buttons use) ---------- */
const iconCache = new Map<SensorId, HTMLImageElement>();
export function eyeImage(id: SensorId): HTMLImageElement | null {
  let img = iconCache.get(id);
  if (!img) {
    img = new Image();
    const inner = EYE_ICON[id].replace(/currentColor/g, '#eaf0fc').replace(/var\(--ic, #ffb547\)/g, SENSORS[id].color);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">${inner}</svg>`);
    iconCache.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
export function preloadIcons() { for (const id of SENSOR_ORDER) eyeImage(id); }
