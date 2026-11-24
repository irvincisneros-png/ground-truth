/**
 * Orbit Run textures: every surface is authored in code. Zone ground tiles, cloud banks and coast masks are
 * shaded per pixel from seeded noise (once, time-sliced), then blitted each frame. No image files.
 */
import type { ZoneId } from './content';

export const TILE = 1024;       // world units per ground tile (tiles wrap horizontally)
export const GROUND_PAD = 2;    // units of texture above the limb line (hidden by the limb clip)
export const CLOUD_LEN = 720;   // world units of a cloud sprite (stretched to each bank's length)
export const CLOUD_UP = 46;     // units a cloud bank rises above the limb
export const EDGE_W = 96;
export const TILE_MARGIN = 104;  // extra columns after each tile (>= the widest strip)       // width of a coast transition patch

export interface Tex { canvas: HTMLCanvasElement; ready: boolean; ppu: number; hU: number }

/* ---------- seeded lattice noise (periodic in x so tiles wrap) ---------- */
const PERM = new Uint8Array(512);
(() => {
  let s = 20260417;
  const r = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();
const H = (i: number, j: number, k: number) => PERM[(PERM[(PERM[i & 255] + j) & 255] + k) & 255] / 255;
const sst = (a: number, b: number, x: number) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
const wrap = (i: number, p: number) => ((i % p) + p) % p;

function vn(x: number, y: number, px: number, k: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const i0 = wrap(xi, px), i1 = wrap(xi + 1, px);
  const a = H(i0, yi, k), b = H(i1, yi, k), c = H(i0, yi + 1, k), d = H(i1, yi + 1, k);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, px: number, oct: number, k: number): number {
  let s = 0, a = 0.5, n = 0;
  for (let o = 0; o < oct; o++) { s += a * vn(x, y, px, k + o * 17); n += a; a *= 0.5; x *= 2; y *= 2; px *= 2; }
  return s / n;
}
// cellular noise: nearest and second-nearest feature point (results in module vars to avoid allocation)
let cF1 = 0, cF2 = 0, cId = 0, cDx = 0, cDy = 0;
function cell(x: number, y: number, px: number, k: number): void {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, dx = 0, dy = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const ci = xi + i, cj = yi + j, wi = wrap(ci, px);
    const ox = ci + 0.12 + 0.76 * H(wi, cj, k) - x, oy = cj + 0.12 + 0.76 * H(wi, cj, k + 31) - y;
    const d = ox * ox + oy * oy;
    if (d < f1) { f2 = f1; f1 = d; id = H(wi, cj, k + 57); dx = -ox; dy = -oy; } else if (d < f2) f2 = d;
  }
  cF1 = Math.sqrt(f1); cF2 = Math.sqrt(f2); cId = id; cDx = dx; cDy = dy;
}

/* ---------- zone shaders: (u world x, v foreshortened depth, y units below limb, t 0..1 depth) -> rgb ---------- */
type Shader = (u: number, v: number, y: number, t: number, o: Float32Array) => void;
const mixTo = (o: Float32Array, r: number, g: number, b: number, k: number) => { o[0] += (r - o[0]) * k; o[1] += (g - o[1]) * k; o[2] += (b - o[2]) * k; };

/** Warm ocean: calm, bright azure with pale teal current filaments. */
const shOcean: Shader = (u, v, _y, t, o) => {
  const X = u / TILE;
  const big = fbm(X * 4, v / 150, 4, 4, 11);
  const fl = 1 - Math.abs(2 * fbm(X * 6 + big * 1.5, v / 90 + big * 2, 6, 3, 23) - 1);
  const fil = sst(0.78, 0.97, fl);
  const fine = fbm(X * 64, v / 6, 64, 2, 5);
  const k = (0.86 + 0.26 * big) * (0.95 + 0.1 * fine);
  o[0] = (36 + (14 - 36) * t) * k; o[1] = (132 + (88 - 132) * t) * k; o[2] = (204 + (170 - 204) * t) * k;
  mixTo(o, 96, 208, 214, fil * 0.34);
};
/** Open sea: deep navy with long rolling swell lines and whitecaps (sea height is what the radar measures). */
const shSea: Shader = (u, v, y, t, o) => {
  const X = u / TILE;
  const w = fbm(X * 6, v / 90, 6, 3, 41);
  const amp = (0.3 + 1.0 * fbm(X * 10, v / 50, 10, 2, 45)) * sst(1, 30, y); // waves come in groups; flatten into haze at the limb
  const s = Math.sin(6.2832 * 4 * X + v * 0.2 + w * 7), crest = s > 0 ? s * s * s * amp : 0;
  const chop = fbm(X * 100, v / 8, 100, 2, 43);
  const k = 0.86 + 0.17 * s * amp + 0.12 * (chop - 0.5);
  o[0] = (34 + (12 - 34) * t) * k + crest * 26; o[1] = (80 + (40 - 80) * t) * k + crest * 46; o[2] = (138 + (96 - 138) * t) * k + crest * 58;
  const wc = sst(0.84, 0.98, s) * amp * sst(0.58, 0.72, fbm(X * 64, v / 9, 64, 2, 47));
  mixTo(o, 228, 240, 250, Math.min(1, wc) * 0.8);
};
/** Reef: turquoise platforms with sandy lagoons and coral patches seen through shallow water, cut by deep channels. */
const shReef: Shader = (u, v, _y, t, o) => {
  const X = u / TILE;
  const m = fbm(X * 5, v / 130, 5, 4, 61) + 0.08 * (fbm(X * 40, v / 20, 40, 2, 63) - 0.5);
  // deep channel, lightening as the reef slope rises
  o[0] = 22 + (12 - 22) * t; o[1] = 104 + (74 - 104) * t; o[2] = 172 + (142 - 172) * t;
  mixTo(o, 30, 152, 192, sst(0.31, 0.405, m));
  const p = sst(0.4, 0.45, m);
  if (p > 0) {
    const sand = sst(0.53, 0.68, m);
    let r = 44 + (158 - 44) * sand, g = 198 + (234 - 198) * sand, b = 190 + (206 - 190) * sand;
    const grass = sst(0.58, 0.72, fbm(X * 20, v / 45, 20, 3, 73)) * 0.34;
    r += (24 - r) * grass; g += (132 - g) * grass; b += (140 - b) * grass;
    // coral grows in patches (bommies): mottled browns, ochres and dusky pinks under the water
    const patch = sst(0.46, 0.6, fbm(X * 14, v / 60, 14, 3, 77)) * (1 - sand * 0.7);
    if (patch > 0.01) {
      cell(X * 76, v / 22, 76, 71);
      const spot = (1 - sst(0.25, 0.52, cF1)) * 0.74 * patch, id = cId;
      const cr = id < 0.45 ? 116 : id < 0.75 ? 178 : 196, cg = id < 0.45 ? 104 : id < 0.75 ? 144 : 122, cb = id < 0.45 ? 88 : id < 0.75 ? 96 : 124;
      r += (cr - r) * spot; g += (cg - g) * spot; b += (cb - b) * spot;
    }
    const ca = 1 - Math.abs(2 * fbm(X * 100, v / 8, 100, 2, 75) - 1);
    const lift = 1 + 0.1 * sst(0.7, 0.95, ca);
    mixTo(o, r * lift, g * lift, b * lift, p);
    const foam = sst(0.4, 0.425, m) * (1 - sst(0.435, 0.47, m));
    mixTo(o, 238, 251, 246, foam * 0.75);
  }
};
/** Forest: a canopy of lit crowns with shadowed gaps, darker gullies and bright emergent trees. */
const shForest: Shader = (u, v, _y, t, o) => {
  const X = u / TILE;
  const big = fbm(X * 5, v / 140, 5, 3, 81);
  cell(X * 85, v / 15, 85, 83);
  let d = cF1 / 0.62, nx = cDx / 0.62, ny = cDy / 0.62, id = cId, hgt = 1 - d * d;
  cell(X * 46 + 0.37, v / 27 + 0.61, 46, 87); // taller emergent crowns stand over the small ones
  const d2 = cF1 / 0.6, h2 = cId < 0.4 ? -9 : (1 - d2 * d2) * 1.15 - 0.08;
  if (h2 > hgt) { hgt = h2; d = d2; nx = cDx / 0.6; ny = cDy / 0.6; id = cId; }
  const nz = Math.sqrt(Math.max(0.05, 1 - d * d));
  const lam = Math.max(0, -0.45 * nx - 0.55 * ny + 0.7 * nz);
  const gap = sst(-0.3, 0.3, hgt);
  const leaf = fbm(X * 200, v / 4, 200, 2, 85);
  const b = (0.36 + 0.78 * lam) * (0.46 + 0.54 * gap) * (0.66 + 0.46 * big) * (0.88 + 0.24 * leaf);
  const hi = lam * lam * lam * lam * lam * lam;
  if (id < 0.45) { o[0] = 28 * b; o[1] = 88 * b; o[2] = 48 * b; }
  else if (id < 0.75) { o[0] = 36 * b; o[1] = 104 * b; o[2] = 54 * b; }
  else if (id < 0.93) { o[0] = 50 * b; o[1] = 120 * b; o[2] = 56 * b; }
  else { o[0] = 82 * b; o[1] = 138 * b; o[2] = 60 * b; }
  o[0] += hi * 34; o[1] += hi * 44; o[2] += hi * 18;
  mixTo(o, 14, 56, 50, (1 - sst(0.28, 0.5, big)) * 0.42);
  // a muddy river winding through, with a darker gallery of trees along its banks
  const a = 6.2832 * X, dr = Math.abs(t - (0.52 + 0.2 * Math.sin(a + 1) + 0.07 * Math.sin(3 * a + 2) + 0.025 * Math.sin(9 * a))) * 160;
  const wR = 1.1 + 2.2 * t;
  if (dr < wR + 5) {
    mixTo(o, 12, 50, 38, (1 - sst(wR, wR + 5, dr)) * 0.45);
    mixTo(o, 176, 160, 104, (1 - sst(wR - 0.2, wR + 0.9, dr)) * 0.8);
    mixTo(o, 84 + 30 * leaf, 126 + 20 * leaf, 122, 1 - sst(wR - 1.1, wR - 0.2, dr));
  }
};
/** Sea ice: white floes split by dark leads, with thin cracks, blue meltwater ponds and grey new ice. */
const shIce: Shader = (u, v, _y, t, o) => {
  const X = u / TILE;
  const open = fbm(X * 4, v / 160, 4, 3, 91);
  const wx = fbm(X * 24, v / 30, 24, 2, 93) - 0.5, wy = fbm(X * 24, v / 30, 24, 2, 95) - 0.5;
  cell(X * 18 + wx * 0.35, v / 40 + wy * 0.35, 18, 97);
  const e = cF2 - cF1, id = cId, side = (cDx * 0.6 + cDy * 0.8) / (cF1 + 0.001);
  const lead = 0.035 + 0.2 * sst(0.5, 0.8, open);
  const f = sst(lead - 0.012, lead + 0.012, e);
  let r: number, g: number, b: number;
  if (id < 0.18) { r = 176; g = 206; b = 230; } else { r = 228 + 22 * id; g = 240 + 13 * id; b = 250 + 5 * id; }
  const sh = (1 - sst(lead + 0.02, lead + 0.17, e)) * side;
  if (sh > 0) { r *= 1 - 0.13 * sh; g *= 1 - 0.09 * sh; b *= 1 - 0.04 * sh; }
  const rim = 1 - sst(lead, lead + 0.05, e);
  r += (146 - r) * rim * 0.7; g += (206 - g) * rim * 0.7; b += (234 - b) * rim * 0.7;
  if (id >= 0.18) {
    const pond = sst(0.63, 0.71, fbm(X * 36, v / 22, 36, 3, 101)) * sst(lead + 0.08, lead + 0.2, e) * 0.72;
    r += (112 - r) * pond; g += (198 - g) * pond; b += (232 - b) * pond;
  }
  cell(X * 56 + wx, v / 14 + wy, 56, 99);
  const ck = (1 - sst(0, 0.05, cF2 - cF1)) * 0.42;
  r += (150 - r) * ck; g += (190 - g) * ck; b += (222 - b) * ck;
  const snow = 0.96 + 0.06 * fbm(X * 120, v / 7, 120, 2, 103);
  o[0] = 12 + 8 * (1 - t); o[1] = 44 + 16 * (1 - t); o[2] = 88 + 22 * (1 - t);
  mixTo(o, r * snow, g * snow, b * snow, f);
};
const ZONE_SHADER: Record<ZoneId, Shader> = { ocean: shOcean, sea: shSea, reef: shReef, forest: shForest, ice: shIce };
/** Flat stand-in colours (used on the first frames, before a tile has been shaded). */
export const ZONE_FLAT: Record<ZoneId, [string, string]> = {
  ocean: ['#2b86cc', '#0f5aa8'], reef: ['#2fc4bc', '#1596a8'], forest: ['#2c7a46', '#184e2e'], ice: ['#e4f0fa', '#b9d2e8'], sea: ['#234f88', '#0d2c62'],
};

/* ---------- time-sliced jobs ---------- */
interface Job { tex: Tex; img: ImageData; row: number; rowFn: (job: Job, r: number) => void; done?: (job: Job) => void }
const jobs: Job[] = [];
const mk = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
function addJob(tex: Tex, rowFn: Job['rowFn'], done?: Job['done'], front = false): void {
  const g = tex.canvas.getContext('2d')!;
  const job: Job = { tex, img: g.createImageData(tex.canvas.width, tex.canvas.height), row: 0, rowFn, done };
  if (front) jobs.unshift(job); else jobs.push(job);
}
export const texturesBusy = () => jobs.length > 0;
/** Shade queued textures for up to `budgetMs`. Call once per frame. */
export function runTextureJobs(budgetMs: number): void {
  if (!jobs.length) return;
  const t0 = performance.now();
  while (jobs.length) {
    const job = jobs[0], h = job.tex.canvas.height;
    while (job.row < h) {
      job.rowFn(job, job.row++);
      if ((job.row & 3) === 0 && performance.now() - t0 > budgetMs) return;
    }
    job.done?.(job);
    job.tex.canvas.getContext('2d')!.putImageData(job.img, 0, 0);
    job.tex.ready = true;
    jobs.shift();
  }
}

/** Depth coordinate: rows near the limb are squashed (we look across the curve of the Earth there). */
const depthV = (y: number, hU: number) => { const t = Math.min(1, Math.max(0, y / hU)); return 1.6 * y + hU * (1 - (1 - t) * (1 - t) * (1 - t)); };

export interface TexSet { key: string; ppu: number; hU: number; zones: Record<ZoneId, Tex>; clouds: Tex[]; maskHard: Tex; maskSoft: Tex; lineSand: Tex; lineFoam: Tex; tmp: HTMLCanvasElement }
let current: TexSet | null = null;

function groundJob(zone: ZoneId, ppu: number, hU: number, front: boolean): Tex {
  // the tile is followed by a copy of its first columns, so a strip never has to straddle the wrap
  const w = Math.round(TILE * ppu), wAll = w + Math.ceil(TILE_MARGIN * ppu), tex: Tex = { canvas: mk(wAll, Math.ceil(hU * ppu)), ready: false, ppu: w / TILE, hU };
  const sh = ZONE_SHADER[zone], o = new Float32Array(3), p = tex.ppu;
  addJob(tex, (job, r) => {
    const y = Math.max(0, (r + 0.5) / p - GROUND_PAD), t = Math.min(1, y / hU), v = depthV(y, hU);
    const haze = Math.exp(-y / 7) * 0.5, vig = 1.04 - 0.14 * t, d = job.img.data;
    const i0 = r * wAll * 4; let i = i0;
    for (let x = 0; x < w; x++) {
      sh((x + 0.5) / p, v, y, t, o);
      d[i++] = (o[0] + (172 - o[0]) * haze) * vig; d[i++] = (o[1] + (216 - o[1]) * haze) * vig; d[i++] = (o[2] + (255 - o[2]) * haze) * vig; d[i++] = 255;
    }
    d.copyWithin(i, i0, i0 + (wAll - w) * 4);
  }, undefined, front);
  return tex;
}
function cloudJob(seed: number, ppu: number, hU: number): Tex {
  const w = Math.round(CLOUD_LEN * ppu), hTot = hU + CLOUD_UP, tex: Tex = { canvas: mk(w, Math.ceil(hTot * ppu)), ready: false, ppu, hU: hTot };
  const dens = (u: number, vy: number, y: number) => {
    const n = fbm(u / 70, vy / 55, 256, 5, seed) + 0.1 * (1 - Math.abs(2 * fbm(u / 22, vy / 18, 256, 3, seed + 7) - 1)) - 0.05;
    // ragged ends lower down, but true to the game's edge along the limb (where the beam lands)
    const rag = y > 8 ? sst(8, 50, y) * 80 : 0;
    const taper = sst(0, 64, u - rag * vn(vy / 38, 3.7, 256, seed + 3)) * sst(0, 64, CLOUD_LEN - u - rag * vn(vy / 38, 9.1, 256, seed + 5));
    let th = 0.74 - 0.5 * taper; // a solid deck in the middle (the beam is blocked there)
    if (y < 0) th += Math.pow(-y / CLOUD_UP, 1.15) * 0.62;
    return n - th;
  };
  addJob(tex, (job, r) => {
    const y = (r + 0.5) / ppu - CLOUD_UP, vy = y < 0 ? y * 1.5 : depthV(y, hU), d = job.img.data;
    const vyL = y - 5 < 0 ? (y - 5) * 1.5 : depthV(y - 5, hU);
    let i = r * w * 4;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / ppu, n = dens(u, vy, y), a = sst(0, 0.1, n);
      if (a <= 0.003) { d[i + 3] = 0; i += 4; continue; }
      const lit = Math.min(1, Math.max(0, 0.62 + (n - dens(u - 8, vyL, y - 5)) * 4.4 + (y < 0 ? 0.16 : 0)));
      d[i++] = 118 + 137 * lit; d[i++] = 144 + 111 * lit; d[i++] = 192 + 63 * lit; d[i++] = a * 247;
    }
  }, (job) => { // soft shadow thrown down-right onto the ground under the bank
    const d = job.img.data, h = tex.canvas.height, ox = Math.round(13 * ppu), oy = Math.round(8 * ppu), y0 = Math.ceil(CLOUD_UP * ppu);
    for (let r = h - 1; r >= y0 + oy; r--) for (let x = w - 1; x >= ox; x--) {
      const i = (r * w + x) * 4, a = d[i + 3];
      if (a > 250) continue;
      const sa = d[((r - oy) * w + (x - ox)) * 4 + 3] * 0.42;
      if (sa < 2) continue;
      const k = a / 255, outA = a + sa * (1 - k);
      d[i] = (d[i] * a + 6 * sa * (1 - k)) / outA; d[i + 1] = (d[i + 1] * a + 16 * sa * (1 - k)) / outA; d[i + 2] = (d[i + 2] * a + 40 * sa * (1 - k)) / outA; d[i + 3] = outA;
    }
  });
  return tex;
}
function edgeJob(kind: 'hard' | 'soft' | 'sand' | 'foam', ppu: number, hU: number): Tex {
  const w = Math.round(EDGE_W * ppu), tex: Tex = { canvas: mk(w, Math.ceil(hU * ppu)), ready: false, ppu, hU };
  addJob(tex, (job, r) => {
    const y = Math.max(0, (r + 0.5) / ppu - GROUND_PAD), d = job.img.data;
    const wob = (fbm(y / 26, 3.3, 256, 3, 131) - 0.5) * 2, xc = EDGE_W / 2 + Math.min(34, y * 0.55) * wob * 1.6;
    let i = r * w * 4;
    for (let x = 0; x < w; x++) {
      const sd = (x + 0.5) / ppu - xc;
      let a: number, cr = 255, cg = 255, cb = 255;
      if (kind === 'hard') a = sst(-0.8, 0.8, sd);
      else if (kind === 'soft') a = sst(-30, 30, (x + 0.5) / ppu - EDGE_W / 2 + wob * 9);
      else if (kind === 'sand') { a = Math.exp(-Math.abs(sd) / 3.2) * 0.95; const f = Math.exp(-Math.abs(sd + 3.4) / 1.1); cr = 236 + 19 * f; cg = 220 + 32 * f; cb = 170 + 80 * f; }
      else { a = Math.exp(-Math.abs(sd) / 2.4) * 0.85; cr = 236; cg = 248; }
      d[i++] = cr; d[i++] = cg; d[i++] = cb; d[i++] = a * 255;
    }
  });
  return tex;
}

/** Get (and lazily build) the texture set for a view. `first` is shaded before the others. */
export function getTextures(ppuWanted: number, groundH: number, first: ZoneId[]): TexSet {
  const ppu = Math.round(Math.min(1.5, Math.max(0.75, ppuWanted)) * 4) / 4, hU = Math.ceil((groundH + GROUND_PAD + 4) / 16) * 16;
  const key = `${ppu}:${hU}`;
  // keep what we have unless the ground got taller or the resolution is far off (a rebuild costs a second or two)
  if (current && (current.key === key || (current.hU === hU && current.ppu >= ppu * 0.55 && current.ppu <= ppu * 2.2))) return current;
  jobs.length = 0;
  const order = [...new Set<ZoneId>([...first, 'ocean', 'forest', 'sea', 'reef', 'ice'])];
  const zones = {} as Record<ZoneId, Tex>;
  for (const z of order) zones[z] = groundJob(z, ppu, hU, false);
  const maskHard = edgeJob('hard', ppu, hU), maskSoft = edgeJob('soft', ppu, hU), lineSand = edgeJob('sand', ppu, hU), lineFoam = edgeJob('foam', ppu, hU);
  const cp = ppu * 0.6;
  const clouds = [211, 223, 239].map((s) => cloudJob(s, cp, hU));
  current = { key, ppu, hU, zones, clouds, maskHard, maskSoft, lineSand, lineFoam, tmp: mk(EDGE_W * ppu, Math.ceil(hU * ppu)) };
  return current;
}
