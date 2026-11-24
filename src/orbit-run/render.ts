/** Orbit Run renderer: Canvas 2D, layered parallax. All art is authored in code (see textures.ts and sprites.ts). */
import { SENSORS, ZONES } from './content';
import type { SensorId, ZoneId } from './content';
import { BAND, COMBO_GRACE, MAX_SHIELDS, ORBIT_LEN, cloudAt, nightFactorAt } from './game';
import type { GameEvent, GameState, Junk } from './game';
import { CLOUD_LEN, CLOUD_UP, EDGE_W, GROUND_PAD, TILE, ZONE_FLAT, getTextures, runTextureJobs } from './textures';
import type { TexSet } from './textures';
import { JUNK_R, SAT_LENS_Y, SAT_NOZZLE, SKY_TILE, drawGlow, drawSprite, eyeImage, glow, makeJunk, makeMoon, makeSatellite, makeStars, preloadIcons } from './sprites';
import type { Sprite } from './sprites';

export { texturesBusy } from './textures';
export type Quality = 1 | 2 | 3;
type C2 = CanvasRenderingContext2D;
export interface View {
  w: number; h: number; dpr: number; scale: number; vw: number; vh: number; satX: number; gy0: number; groundH: number; bandBottom: number; R: number; narrow: boolean;
  /** device pixels per virtual unit */ px: number;
  strips: Map<number, Float32Array>;
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'spark' | 'smoke' | 'debris'; rot: number; vr: number; world: boolean }
interface Orb { t: number; dur: number; x0: number; y0: number; color: string; wob: number; done: boolean }
export interface Fx {
  time: number; particles: Particle[]; orbs: Orb[]; shake: number; flash: number; hitFlash: number; quality: Quality; reduced: boolean;
  satPulse: number; switchPulse: number; comboPop: number; comboPopText: string; banner: number; bannerText: string; thrustAcc: number; shieldRing: number;
  lowShieldFlash: number; scorePop: number; badT: number; ring: number;
}
export function createFx(reduced: boolean): Fx {
  preloadIcons();
  return { time: 0, particles: [], orbs: [], shake: 0, flash: 0, hitFlash: 0, quality: 3, reduced, satPulse: 0, switchPulse: 0, comboPop: 0, comboPopText: '', banner: 0, bannerText: '', thrustAcc: 0, shieldRing: 0, lowShieldFlash: 0, scorePop: 0, badT: 0, ring: 0 };
}

export function computeView(w: number, h: number, dpr: number): View {
  const scale = Math.min(h / 560, w / 460);
  const vw = w / scale, vh = h / scale;
  const groundH = 150 + Math.max(0, vh - 560) * 0.55;
  const gy0 = vh - groundH;
  return { w, h, dpr, scale, vw, vh, satX: vw * (vw > 700 ? 0.27 : 0.24), gy0, groundH, bandBottom: gy0 - 46, R: 3000, narrow: w < 600, px: scale * dpr, strips: new Map() };
}
const yOf = (v: View, a: number) => v.bandBottom - a * BAND;
const groundAt = (v: View, vx: number) => { const dx = vx - v.vw / 2; return v.gy0 + v.R - Math.sqrt(Math.max(1, v.R * v.R - dx * dx)); };
const SAT_SCALE = 1.22;
const FOOT = 11; // the beam lands this far below the limb line, on the surface

/* ---------- small helpers ---------- */
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
function rgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a: string, b: string, t: number): string { const A = rgb(a), B = rgb(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; }
function rr(c: C2, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const withAlpha = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const TOL: Record<Quality, number> = { 1: 2, 2: 1.2, 3: 0.7 };

/* ---------- curved blits: textures follow the limb in vertical strips ---------- */
function stripEdges(v: View, tol: number): Float32Array {
  let e = v.strips.get(tol);
  if (!e) {
    const out: number[] = [], m = EDGE_W + 8;
    let x = -m; out.push(x);
    while (x < v.vw + m) {
      let w = 96; // widest strip whose ends sit within `tol` of the true curve
      while (w > 2.5 && Math.abs(groundAt(v, x + w) - groundAt(v, x)) > tol) w *= 0.8;
      x = Math.round((x + w) * v.px) / v.px; out.push(x);
    }
    e = new Float32Array(out); v.strips.set(tol, e);
  }
  return e;
}
/** Draw texture columns [srcU, srcU + (b-a)*sx] (texture units) to screen x in [a, b], hanging from the limb. */
function blit(c: C2, v: View, tol: number, cv: HTMLCanvasElement, ppu: number, srcU: number, a: number, b: number, yOff: number, wrapU = 0, sx = 1) {
  const e = stripEdges(v, tol), hU = cv.height / ppu;
  for (let i = 0; i < e.length - 1; i++) {
    const xa = Math.max(a, e[i]), xb = Math.min(b, e[i + 1]);
    if (xb <= xa) { if (e[i] > b) break; continue; }
    const y = Math.round((groundAt(v, (e[i] + e[i + 1]) / 2) - yOff) * v.px) / v.px;
    let su = srcU + (xa - a) * sx; const sw = (xb - xa) * sx;
    if (wrapU) su = ((su % wrapU) + wrapU) % wrapU; // tiles carry a margin, so no split is needed
    c.drawImage(cv, su * ppu, 0, sw * ppu, cv.height, xa, y, xb - xa, hU);
  }
}

/* ---------- effects state ---------- */
const MAX_PARTICLES: Record<Quality, number> = { 1: 24, 2: 70, 3: 160 };
function addParticle(fx: Fx, p: Particle) { if (fx.particles.length < MAX_PARTICLES[fx.quality]) fx.particles.push(p); }
const satTilt = (s: GameState) => -Math.max(-0.32, Math.min(0.32, s.v * 0.34));
function lensPos(s: GameState, v: View): [number, number] { const th = satTilt(s), L = SAT_LENS_Y * SAT_SCALE; return [v.satX - Math.sin(th) * L, yOf(v, s.a) + Math.cos(th) * L]; }

export function fxEvents(fx: Fx, s: GameState, v: View, events: GameEvent[]) {
  const satY = yOf(v, s.a);
  const fy = groundAt(v, v.satX) + FOOT;
  for (const e of events) {
    if (e.type === 'collect') {
      const col = SENSORS[s.sensor].color;
      fx.orbs.push({ t: 0, dur: 0.46, x0: v.satX + (Math.random() - 0.5) * 30, y0: fy, color: col, wob: Math.random() * 6.28, done: false });
      if (fx.orbs.length > 14) fx.orbs.shift();
      fx.scorePop = 1; fx.ring = 1;
      const n = fx.quality === 1 ? 0 : fx.quality === 2 ? 1 : 2;
      for (let i = 0; i < n; i++) addParticle(fx, { x: v.satX + (Math.random() - 0.5) * 44, y: fy, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 70, life: 0.5, max: 0.5, size: 1.6 + Math.random() * 1.8, color: col, kind: 'spark', rot: 0, vr: 0, world: true });
    } else if (e.type === 'hit') {
      if (!fx.reduced) fx.shake = 1;
      fx.hitFlash = 1;
      fx.shieldRing = 1;
      const n = fx.quality === 1 ? 4 : fx.quality === 2 ? 8 : 16;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, sp = 60 + Math.random() * 190;
        addParticle(fx, { x: v.satX + 10, y: satY, vx: Math.cos(a) * sp + 50, vy: Math.sin(a) * sp, life: 0.9, max: 0.9, size: 1.6 + Math.random() * 3.4, color: i % 3 === 0 ? '#ffb547' : i % 3 === 1 ? '#c6d0e2' : '#6f7d9c', kind: 'debris', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, world: false });
      }
    } else if (e.type === 'edge') {
      if (!fx.reduced) fx.shake = Math.max(fx.shake, 0.45);
      fx.hitFlash = Math.max(fx.hitFlash, 0.4);
    } else if (e.type === 'combo') {
      fx.comboPop = 1; fx.comboPopText = `x${e.mult} combo`;
      if (!fx.reduced) for (let i = 0; i < (fx.quality === 1 ? 0 : 12); i++) {
        const a = (i / 12) * 6.28;
        addParticle(fx, { x: v.satX, y: satY, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, life: 0.55, max: 0.55, size: 2.6, color: '#ffb547', kind: 'spark', rot: 0, vr: 0, world: false });
      }
    } else if (e.type === 'switch') {
      fx.switchPulse = 1; fx.badT = 0;
    } else if (e.type === 'orbit') {
      fx.banner = 1; fx.bannerText = `Orbit ${e.orbit + 1}`;
    }
  }
}

export function fxUpdate(fx: Fx, s: GameState, v: View, dt: number, climbing: boolean) {
  fx.time += dt;
  fx.shake = Math.max(0, fx.shake - dt * 2.4);
  fx.hitFlash = Math.max(0, fx.hitFlash - dt * 2.2);
  fx.satPulse = Math.max(0, fx.satPulse - dt * 4);
  fx.switchPulse = Math.max(0, fx.switchPulse - dt * 2.5);
  fx.comboPop = Math.max(0, fx.comboPop - dt * 1.4);
  fx.banner = Math.max(0, fx.banner - dt * 0.7);
  fx.shieldRing = Math.max(0, fx.shieldRing - dt * 1.8);
  fx.scorePop = Math.max(0, fx.scorePop - dt * 5);
  fx.ring = Math.max(0, fx.ring - dt * 3.2);
  fx.badT = s.status === 'ok' || s.over ? 0 : fx.badT + dt;
  const [lx, ly] = lensPos(s, v);
  for (const o of fx.orbs) {
    o.t += dt;
    if (o.t >= o.dur && !o.done) {
      o.done = true;
      fx.satPulse = 1;
      if (fx.quality > 1) addParticle(fx, { x: lx, y: ly, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.3) * 60, life: 0.35, max: 0.35, size: 2.2, color: o.color, kind: 'spark', rot: 0, vr: 0, world: false });
    }
  }
  fx.orbs = fx.orbs.filter((o) => o.t < o.dur + 0.02);
  // thruster puffs while climbing
  if (climbing && !s.over && fx.quality > 1 && !fx.reduced) {
    fx.thrustAcc += dt * 34;
    const th = satTilt(s), nx = SAT_NOZZLE[0] * SAT_SCALE, ny = SAT_NOZZLE[1] * SAT_SCALE;
    const px = v.satX + nx * Math.cos(th) - ny * Math.sin(th), py = yOf(v, s.a) + nx * Math.sin(th) + ny * Math.cos(th);
    while (fx.thrustAcc >= 1) {
      fx.thrustAcc -= 1;
      addParticle(fx, { x: px - 8, y: py + 8 + (Math.random() - 0.5) * 4, vx: -70 - Math.random() * 40, vy: 55 + Math.random() * 35, life: 0.45, max: 0.45, size: 2.2 + Math.random() * 2, color: '#ffe2b0', kind: 'smoke', rot: 0, vr: 0, world: false });
    }
  }
  for (const p of fx.particles) {
    p.life -= dt;
    p.x += (p.vx - (p.world ? s.speed : 0)) * dt;
    p.y += p.vy * dt;
    if (p.kind === 'debris') p.vy += 200 * dt;
    p.rot += p.vr * dt;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
}

/* ---------- cached sprites ---------- */
interface Kit { key: string; sat: Sprite; junk: Sprite[]; moon: Sprite; stars: Sprite; starsRich: boolean }
let kit: Kit | null = null;
function getKit(v: View, q: Quality): Kit {
  const k = Math.round(Math.min(3, Math.max(1, v.px * 1.3)) * 2) / 2, rich = q > 1, skyH = Math.ceil((v.gy0 + 70) / 40) * 40;
  const key = `${k}:${skyH}`;
  if (!kit || kit.key !== key) kit = { key, sat: makeSatellite(k * SAT_SCALE), junk: makeJunk(k), moon: makeMoon(k), stars: makeStars(Math.min(2, k), skyH, rich), starsRich: rich };
  else if (kit.starsRich !== rich && !rich) { kit.stars = makeStars(Math.min(2, k), skyH, false); kit.starsRich = false; }
  return kit;
}
/** Night-tinted copies of the cloud sprites (made once each sprite is ready). */
const nightClouds = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function nightCloud(cv: HTMLCanvasElement): HTMLCanvasElement {
  let n = nightClouds.get(cv);
  if (!n) {
    n = document.createElement('canvas'); n.width = cv.width; n.height = cv.height;
    const g = n.getContext('2d')!; g.drawImage(cv, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#3a4772'; g.fillRect(0, 0, n.width, n.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(cv, 0, 0);
    nightClouds.set(cv, n);
  }
  return n;
}

/* ---------- sky ---------- */
const TWINKLE = Array.from({ length: 14 }, (_, i) => ({ x: hash(i * 3.7 + 1) * 1400, y: 0.04 + hash(i * 9.1 + 4) * 0.7, s: 3 + hash(i * 5.3) * 4, ph: hash(i + 0.5) * 6.28, warm: hash(i * 2.9) < 0.3 }));
function drawSky(c: C2, s: GameState, v: View, fx: Fx, K: Kit) {
  const nf = nightFactorAt(s.dist);
  const g = c.createLinearGradient(0, 0, 0, v.gy0 + 30);
  g.addColorStop(0, '#03060d'); g.addColorStop(0.5, mix('#081123', '#050a16', nf)); g.addColorStop(1, mix('#10244a', '#080f22', nf));
  c.fillStyle = g; c.fillRect(-20, -20, v.vw + 40, v.vh + 40);
  // starfield (two slow parallax passes of one tile)
  c.globalAlpha = 0.78 + 0.22 * nf;
  const off = (s.dist * 0.04) % SKY_TILE;
  for (let x = -off; x < v.vw + 20; x += SKY_TILE) c.drawImage(K.stars.canvas, x, 0, SKY_TILE, K.stars.h);
  c.globalAlpha = 1;
  if (fx.quality >= 2) {
    const tile = 1400, o2 = (s.dist * 0.09) % tile;
    for (const st of TWINKLE) {
      const x = ((st.x - o2) % tile + tile) % tile; if (x > v.vw + 10) continue;
      const tw = fx.reduced ? 0.8 : 0.6 + 0.4 * Math.sin(fx.time * 1.6 + st.ph);
      c.globalAlpha = tw * (0.7 + 0.3 * nf);
      drawGlow(c, glow(st.warm ? '#ffd9b0' : '#cfe0ff', true), x, st.y * v.gy0, st.s * (0.8 + 0.2 * tw));
    }
    c.globalAlpha = 1;
    const span = v.vw + 220, mx = ((v.vw * 0.78 - s.dist * 0.02) % span + span) % span - 110;
    c.save(); c.translate(mx, v.gy0 * 0.26); drawSprite(c, K.moon); c.restore();
  }
}

/* ---------- atmosphere ---------- */
function drawAtmosphere(c: C2, s: GameState, v: View, fx: Fx) {
  const cx = v.vw / 2, cy = v.gy0 + v.R;
  const ag = c.createRadialGradient(cx, cy, v.R - 2, cx, cy, v.R + 130);
  ag.addColorStop(0, 'rgba(150,215,255,.78)'); ag.addColorStop(0.07, 'rgba(96,176,255,.42)'); ag.addColorStop(0.3, 'rgba(60,128,255,.15)'); ag.addColorStop(1, 'rgba(50,100,255,0)');
  // dimmed on the night side, in device-pixel-aligned strips (no seams); flat runs are one rectangle
  const y = v.gy0 - 140, h = 200, sp = Math.max(4, Math.round(8 * v.px)), n = Math.ceil((v.vw * v.px) / sp);
  const fAt = (i: number) => nightFactorAt(s.dist + ((i + 0.5) * sp / v.px - v.satX));
  for (let i = 0; i < n; ) {
    const f = fAt(i); let j = i + 1;
    if (f < 0.002 || f > 0.998) while (j < n && Math.abs(fAt(j) - f) < 0.002) j++;
    c.globalAlpha = 1 - 0.74 * f; c.fillStyle = ag; c.fillRect((i * sp) / v.px, y, ((j - i) * sp) / v.px, h);
    i = j;
  }
  c.globalAlpha = 1;
  // sunset and sunrise: a warm glow on the limb where day meets night
  const orbit0 = Math.floor((s.dist - v.satX) / ORBIT_LEN);
  for (let k = orbit0; k <= orbit0 + 1; k++) for (const p of [0.58, 0.82]) {
    const x = v.satX + ((k + p) * ORBIT_LEN - s.dist);
    if (x < -220 || x > v.vw + 220) continue;
    const gy = groundAt(v, x);
    c.save(); if (fx.quality === 3) c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.75; drawGlow(c, glow('#ff7e45'), x, gy - 3, 210, 52);
    c.globalAlpha = 0.9; drawGlow(c, glow('#ffd49a', true), x, gy - 1, 70, 13);
    c.restore();
  }
}
function nightGradients(c: C2, s: GameState, v: View, alpha: number): { night: CanvasGradient; dusk: CanvasGradient; any: boolean } {
  const step = 20, night = c.createLinearGradient(0, 0, v.vw, 0), dusk = c.createLinearGradient(0, 0, v.vw, 0);
  let any = false;
  for (let sx = 0; sx <= v.vw + step; sx += step) {
    const f = nightFactorAt(s.dist + (sx - v.satX)), pos = Math.min(1, sx / v.vw);
    if (f > 0.001) any = true;
    night.addColorStop(pos, `rgba(3,8,26,${(f * alpha).toFixed(3)})`);
    dusk.addColorStop(pos, `rgba(255,140,80,${(0.26 * Math.sin(f * Math.PI)).toFixed(3)})`);
  }
  return { night, dusk, any };
}

/* ---------- terrain ---------- */
type Coast = 'soft' | 'sand' | 'foam';
function coastKind(a: ZoneId, b: ZoneId): Coast { return a === 'forest' || b === 'forest' ? 'sand' : a === 'ice' || b === 'ice' ? 'foam' : 'soft'; }
function drawGlint(c: C2, s: GameState, v: View, fx: Fx, a: number, b: number, warm: boolean) {
  const gx = v.vw * 0.63, rx = Math.min(190, v.vw * 0.3);
  if (b < gx - rx || a > gx + rx) return;
  const day = 1 - nightFactorAt(s.dist + (gx - v.satX));
  if (day < 0.03) return;
  const gy = groundAt(v, gx);
  c.save(); c.beginPath(); c.rect(a, v.gy0 - 10, b - a, v.vh); c.clip();
  if (fx.quality === 3) c.globalCompositeOperation = 'lighter';
  c.globalAlpha = day * (warm ? 0.5 : 0.24);
  drawGlow(c, glow(warm ? '#ffd890' : '#bcd6ff'), gx, gy + v.groundH * 0.5, rx, v.groundH * 0.46);
  const n = fx.quality === 3 ? 12 : 7, spark = glow(warm ? '#fff0c4' : '#e6f0ff', true);
  for (let i = 0; i < n; i++) {
    const hx = hash(i * 1.7 + 3), hy = hash(i * 3.1 + 2);
    const tw = fx.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(fx.time * (1.6 + hx * 2.6) + i * 2.1);
    if (tw < 0.18) continue;
    c.globalAlpha = day * tw * (warm ? 0.55 : 0.36);
    drawGlow(c, spark, gx + (hx - 0.5) * rx * 1.5 * (0.35 + hy), gy + 14 + hy * (v.groundH - 30), 10 + hy * 16, 1 + hy * 1.1);
  }
  c.restore();
}

function drawTerrain(c: C2, s: GameState, v: View, fx: Fx, T: TexSet) {
  const cx = v.vw / 2, cy = v.gy0 + v.R, tol = TOL[fx.quality], m = 30, half = EDGE_W / 2;
  const sxOf = (wx: number) => v.satX + (wx - s.dist);
  c.save();
  c.beginPath(); c.arc(cx, cy, v.R, 0, 6.283); c.clip();
  const segs = s.segments;
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    const a = Math.max(-m, sxOf(g.x0) + (i > 0 ? half : -half)), b = Math.min(v.vw + m, sxOf(g.x1) + half + 1);
    if (b <= a) continue;
    const tex = T.zones[g.zone];
    if (tex.ready) blit(c, v, tol, tex.canvas, tex.ppu, s.dist + (a - v.satX), a, b, GROUND_PAD, TILE);
    else { const fl = c.createLinearGradient(0, v.gy0, 0, v.vh); fl.addColorStop(0, ZONE_FLAT[g.zone][0]); fl.addColorStop(1, ZONE_FLAT[g.zone][1]); c.fillStyle = fl; c.fillRect(a, v.gy0 - 6, b - a, v.vh); }
  }
  // coasts: the next zone is laid over the last one through a ragged mask, then a line of sand or foam
  for (let i = 1; i < segs.length; i++) {
    const g = segs[i], bx = sxOf(g.x0);
    if (bx + half < -m || bx - half > v.vw + m) continue;
    const tex = T.zones[g.zone], kind = coastKind(segs[i - 1].zone, g.zone), mask = kind === 'soft' ? T.maskSoft : T.maskHard;
    if (!tex.ready || !mask.ready) continue;
    const t = T.tmp.getContext('2d')!, p = tex.ppu, wPx = T.tmp.width;
    t.globalCompositeOperation = 'copy';
    t.drawImage(tex.canvas, (((g.x0 - half) % TILE) + TILE) % TILE * p, 0, wPx, tex.canvas.height, 0, 0, wPx, tex.canvas.height);
    t.globalCompositeOperation = 'destination-in'; t.drawImage(mask.canvas, 0, 0, wPx, T.tmp.height);
    blit(c, v, tol, T.tmp, wPx / EDGE_W, 0, bx - half, bx + half, GROUND_PAD);
    const line = kind === 'sand' ? T.lineSand : kind === 'foam' ? T.lineFoam : null;
    if (line?.ready) blit(c, v, tol, line.canvas, line.canvas.width / EDGE_W, 0, bx - half, bx + half, GROUND_PAD);
  }
  // sunlight glinting off the water
  if (fx.quality > 1) for (const g of segs) {
    if (g.zone !== 'ocean' && g.zone !== 'sea') continue;
    const a = sxOf(g.x0), b = sxOf(g.x1);
    if (b > 0 && a < v.vw) drawGlint(c, s, v, fx, Math.max(a, -m), Math.min(b, v.vw + m), g.zone === 'ocean');
  }
  // night side: the surface goes dark, with a warm band along the terminator
  const ng = nightGradients(c, s, v, 0.7);
  if (ng.any) { c.fillStyle = ng.night; c.fillRect(0, v.gy0 - 10, v.vw, v.vh); c.fillStyle = ng.dusk; c.fillRect(0, v.gy0 - 10, v.vw, v.vh); }
  c.restore();
}

function drawLimb(c: C2, s: GameState, v: View, fx: Fx) {
  const cx = v.vw / 2, cy = v.gy0 + v.R;
  const col = c.createLinearGradient(0, 0, v.vw, 0);
  for (let i = 0; i <= 16; i++) {
    const f = nightFactorAt(s.dist + ((i / 16) * v.vw - v.satX)), d = Math.sin(f * Math.PI);
    col.addColorStop(i / 16, `rgb(${Math.round(lerp(lerp(190, 70, f), 255, d))},${Math.round(lerp(lerp(232, 120, f), 170, d))},${Math.round(lerp(255, 210, f) - 110 * d)})`);
  }
  c.save(); c.lineCap = 'round'; c.strokeStyle = col;
  const a0 = Math.PI * 1.5 - Math.asin(Math.min(1, (v.vw / 2 + 20) / v.R)), a1 = Math.PI * 3 - a0;
  for (const [w, a] of (fx.quality === 1 ? [[2, 0.6]] : [[7, 0.1], [3.4, 0.22], [1.5, 0.8]]) as [number, number][]) {
    c.globalAlpha = a; c.lineWidth = w; c.beginPath(); c.arc(cx, cy, v.R + 0.4, a0, a1); c.stroke();
  }
  c.restore();
}

/* ---------- clouds ---------- */
function drawClouds(c: C2, s: GameState, v: View, fx: Fx, T: TexSet) {
  const tol = TOL[fx.quality];
  for (const cl of s.clouds) {
    const x0 = v.satX + (cl.x0 - s.dist), x1 = v.satX + (cl.x1 - s.dist);
    if (x1 < -20 || x0 > v.vw + 20) continue;
    const tex = T.clouds[cl.seed % T.clouds.length], len = x1 - x0;
    const f0 = nightFactorAt(cl.x0), f1 = nightFactorAt(cl.x1), nf = (f0 + f1) / 2;
    if (!tex.ready) { // stand-in while the sprite is still being shaded
      c.fillStyle = mix('#e8f0fb', '#3a4a6c', nf); c.globalAlpha = 0.85;
      for (let x = x0 + 30; x < x1 - 30; x += 26) { c.beginPath(); c.ellipse(x, groundAt(v, x) + 6, 30, 16, 0, 0, 6.283); c.fill(); }
      c.globalAlpha = 1; continue;
    }
    const ppu = tex.canvas.width / CLOUD_LEN, sx = CLOUD_LEN / len;
    if (nf < 0.98) blit(c, v, tol, tex.canvas, ppu, 0, x0, x1, CLOUD_UP, 0, sx);
    if (nf > 0.02) { c.globalAlpha = nf < 0.98 ? nf : 1; blit(c, v, tol, nightCloud(tex.canvas), ppu, 0, x0, x1, CLOUD_UP, 0, sx); c.globalAlpha = 1; }
  }
}

/* ---------- zone names ---------- */
function pill(c: C2, x: number, y: number, w: number, h: number, stroke: string, fill = 'rgba(7,14,30,.8)') {
  c.fillStyle = fill; rr(c, x, y, w, h, h / 2); c.fill();
  c.strokeStyle = stroke; c.lineWidth = 1; c.stroke();
}
function drawZoneLabels(c: C2, s: GameState, v: View) {
  const fs = Math.max(13, 12.5 / v.scale);
  c.font = `700 ${fs}px ${FONT}`;
  c.textBaseline = 'middle'; c.textAlign = 'left';
  for (const g of s.segments) {
    const x0 = v.satX + (g.x0 - s.dist), x1 = v.satX + (g.x1 - s.dist);
    if (x1 < 0 || x0 > v.vw) continue;
    const label = ZONES[g.zone].label;
    const tw = c.measureText(label).width + fs * 1.5;
    let lx = Math.max(x0 + 12, 8);
    lx = Math.min(lx, x1 - tw - 8);
    if (lx + tw > v.vw - 6 && x0 + 12 > v.vw - tw) lx = v.vw - tw - 6;
    if (x1 - x0 < tw + 16) continue;
    const ly = v.vh - fs * 1.2 - 6;
    pill(c, lx, ly - fs * 0.9, tw, fs * 1.8, 'rgba(255,255,255,.22)');
    c.fillStyle = '#eef3ff'; c.fillText(label, lx + fs * 0.75, ly + 0.5);
  }
}
/** A flag on each coming coast: the next zone's name and, on the first orbit, the eye that reads it. */
function drawZoneFlags(c: C2, s: GameState, v: View) {
  const fs = Math.max(12, 12 / v.scale), teach = s.orbit === 1;
  c.font = `700 ${fs}px ${FONT}`; c.textBaseline = 'middle'; c.textAlign = 'left';
  for (let i = 1; i < s.segments.length; i++) {
    const g = s.segments[i];
    if (g.x0 <= s.dist + 24) continue;
    const bx = v.satX + (g.x0 - s.dist);
    if (bx > v.vw + 10) break;
    const z = ZONES[g.zone], sen = SENSORS[z.sensor], img = teach ? eyeImage(z.sensor) : null;
    const gy = groundAt(v, bx), h = fs * 1.9, ic = img ? h * 0.92 : 0;
    const keyW = img && !v.narrow ? fs * 1.5 : 0;
    const tw = c.measureText(z.label).width, w = fs * 0.8 + tw + (img ? ic + fs * 0.5 : 0) + keyW + fs * 0.8;
    const fade = clamp01((v.vw + 10 - bx) / 60) * clamp01((g.x0 - s.dist - 24) / 50);
    const px = Math.min(bx + 7, v.vw - w - 6), py = gy - 16 - h;
    c.globalAlpha = fade;
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.4; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(bx, gy + 4); c.lineTo(bx, py + h / 2); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(bx, gy + 4, 2.4, 0, 6.283); c.fill();
    pill(c, px, py, w, h, teach ? withAlpha(sen.color, 0.9) : 'rgba(255,255,255,.3)', 'rgba(7,14,30,.86)');
    c.fillStyle = '#eef3ff'; c.fillText(z.label, px + fs * 0.8, py + h / 2 + 0.5);
    if (img) {
      const ix = px + fs * 0.8 + tw + fs * 0.45;
      c.drawImage(img, ix, py + (h - ic) / 2, ic, ic);
      if (keyW) { c.fillStyle = sen.color; rr(c, ix + ic + fs * 0.3, py + h * 0.2, fs * 1.15, h * 0.6, 4); c.fill(); c.fillStyle = '#0b1424'; c.textAlign = 'center'; c.fillText(sen.key, ix + ic + fs * 0.3 + fs * 0.575, py + h / 2 + 0.5); c.textAlign = 'left'; }
    }
    c.globalAlpha = 1;
  }
}

/* ---------- beam ---------- */
const STATUS_TAG: Record<'wrong' | 'cloud' | 'night', string> = { wrong: 'Wrong eye', cloud: 'Blocked by cloud', night: 'Too dark' };
function drawBeam(c: C2, s: GameState, v: View, fx: Fx) {
  if (s.over) return;
  const sensor = SENSORS[s.sensor];
  const [sx, sy] = lensPos(s, v), fxm = v.satX;
  const gy = groundAt(v, fxm) + FOOT;
  const cloud = cloudAt(s, s.dist);
  const cloudy = !!cloud && sensor.blockedByCloud;
  const dark = s.status === 'night', ok = s.status === 'ok';
  const endY = cloudy ? gy - FOOT - 16 : gy;
  const full = endY - sy;
  if (full < 6) return;
  const len = dark ? full * 0.4 : full;
  const yE = sy + len;
  const wTop = 3.2, wBot = dark ? 13 : cloudy ? 24 : 31;
  const col = dark ? '#8a94ae' : sensor.color;
  const strength = ok ? 1 : dark ? 0.55 : cloudy ? 0.75 : 0.42;
  const t = fx.reduced ? 0 : fx.time;
  const xAt = (y: number) => lerp(sx, fxm, (y - sy) / Math.max(1, full));
  const cone = (k: number) => { c.beginPath(); c.moveTo(sx - wTop * k, sy); c.lineTo(xAt(yE) - wBot * k, yE); c.lineTo(xAt(yE) + wBot * k, yE); c.lineTo(sx + wTop * k, sy); c.closePath(); };
  c.save();
  if (fx.quality === 3) c.globalCompositeOperation = 'lighter';
  if (fx.quality > 1) { // soft outer cone
    const g0 = c.createLinearGradient(0, sy, 0, yE); g0.addColorStop(0, withAlpha(col, 0.22 * strength)); g0.addColorStop(1, withAlpha(col, dark ? 0 : 0.1 * strength));
    c.fillStyle = g0; cone(1.55); c.fill();
  }
  const g = c.createLinearGradient(0, sy, 0, yE);
  g.addColorStop(0, withAlpha(col, 0.78 * strength)); g.addColorStop(1, withAlpha(col, dark ? 0 : (ok ? 0.4 : 0.3) * strength));
  c.fillStyle = g; cone(1); c.fill();
  // pattern per sensor (what kind of signal it is)
  c.save(); cone(1); c.clip();
  const widthAt = (y: number) => lerp(wTop, wBot, (y - sy) / Math.max(1, yE - sy));
  if (!dark) {
    c.lineWidth = 1.5; c.globalAlpha = ok ? 1 : 0.5;
    if (s.sensor === 'heat') {
      c.strokeStyle = withAlpha('#ffd9b0', 0.6);
      for (let k = -2; k <= 2; k++) {
        c.beginPath();
        for (let y = sy; y <= yE; y += 8) { const x = xAt(y) + k * widthAt(y) * 0.38 + Math.sin(y * 0.09 - t * 6 + k) * 3; y === sy ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke();
      }
    } else if (s.sensor === 'colour') {
      const bands = ['#ff6b6b', '#7be07b', '#6bb8ff'];
      for (let k = 0; k < 3; k++) {
        c.fillStyle = withAlpha(bands[k], 0.3);
        c.beginPath(); c.moveTo(sx + (k - 1.5) * wTop * 0.66, sy); c.lineTo(xAt(yE) + (k - 1.5) * wBot * 0.66, yE); c.lineTo(xAt(yE) + (k - 0.5) * wBot * 0.66, yE); c.lineTo(sx + (k - 0.5) * wTop * 0.66, sy); c.closePath(); c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,.45)';
      const y = sy + ((t * 140) % (yE - sy)); c.beginPath(); c.moveTo(xAt(y) - widthAt(y), y); c.lineTo(xAt(y) + widthAt(y), y); c.stroke();
    } else if (s.sensor === 'radar') {
      c.strokeStyle = withAlpha('#d4f3ff', 0.85);
      const a0 = c.globalAlpha;
      for (let k = 0; k < 5; k++) {
        const y = sy + (((t * 170 + k * ((yE - sy) / 5)) % (yE - sy)));
        const w = widthAt(y); c.globalAlpha = a0 * (1 - (y - sy) / (yE - sy) * 0.6);
        c.beginPath(); c.ellipse(xAt(y), y, w, w * 0.22, 0, 0, Math.PI); c.stroke();
      }
    } else {
      c.strokeStyle = withAlpha('#eedcff', 0.75);
      for (let k = 0; k < 4; k++) {
        const y0 = sy + (((t * 110 + k * ((yE - sy) / 4)) % (yE - sy)));
        c.beginPath();
        for (let dx = -1; dx <= 1.01; dx += 0.1) { const w = widthAt(y0); const x = xAt(y0) + dx * w; const y = y0 + Math.sin(dx * 9 + t * 8) * 3.2; dx === -1 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
  c.restore();
  if (ok && fx.quality > 1) { c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(sx, sy); c.lineTo(fxm, yE); c.stroke(); }
  if (dark) { // ghost outline: the beam cannot reach the ground
    c.strokeStyle = 'rgba(170,184,214,.34)'; c.lineWidth = 1.3; c.setLineDash([4, 7]);
    c.beginPath(); c.moveTo(sx - wTop, sy); c.lineTo(fxm - 28, endY); c.moveTo(sx + wTop, sy); c.lineTo(fxm + 28, endY); c.stroke(); c.setLineDash([]);
  }
  // where the beam lands
  if (cloudy) {
    c.globalAlpha = 0.8; drawGlow(c, glow('#ffffff'), fxm, endY, 40, 9); c.globalAlpha = 1;
    const tick = Math.floor(fx.time * 12);
    c.strokeStyle = withAlpha('#ffffff', 0.55); c.lineWidth = 1.3; c.beginPath();
    for (let i = 0; i < (fx.quality === 1 ? 4 : 9); i++) {
      const a = Math.PI + (fx.reduced ? (i + 0.5) / 9 : hash(i * 3 + tick)) * Math.PI, r = 10 + hash(i + tick * 7) * 24;
      c.moveTo(fxm + Math.cos(a) * 6, endY + Math.sin(a) * 2); c.lineTo(fxm + Math.cos(a) * r * 1.5, endY + Math.sin(a) * r * 0.7);
    }
    c.stroke();
  } else if (!dark) {
    c.globalAlpha = ok ? 0.95 : 0.3; drawGlow(c, glow(sensor.color, ok), fxm, gy, ok ? 58 : 44, ok ? 17 : 12); c.globalAlpha = 1;
    if (ok) {
      c.strokeStyle = withAlpha('#ffffff', 0.9); c.lineWidth = 1.8; c.setLineDash([7, 6]); c.lineDashOffset = -t * 30;
      c.beginPath(); c.ellipse(fxm, gy, 31, 8.5, 0, 0, 6.283); c.stroke(); c.setLineDash([]);
      if (fx.ring > 0 && fx.quality > 1) { const k = 1 - fx.ring; c.globalAlpha = fx.ring * 0.7; c.strokeStyle = sensor.color; c.lineWidth = 2; c.beginPath(); c.ellipse(fxm, gy, 31 + k * 26, 8.5 + k * 7, 0, 0, 6.283); c.stroke(); c.globalAlpha = 1; }
    } else {
      c.strokeStyle = withAlpha('#c8d2e8', 0.6); c.lineWidth = 1.3; c.setLineDash([2, 5]);
      c.beginPath(); c.ellipse(fxm, gy, 31, 8.5, 0, 0, 6.283); c.stroke(); c.setLineDash([]);
    }
  }
  c.restore();
  // plain-words status beside the beam when nothing is being collected
  if (!ok && fx.badT > 0.3) {
    const kind = s.status as 'wrong' | 'cloud' | 'night', text = STATUS_TAG[kind];
    const fs = Math.max(12.5, 12.5 / v.scale), a = clamp01((fx.badT - 0.3) / 0.2);
    c.font = `700 ${fs}px ${FONT}`; c.textBaseline = 'middle'; c.textAlign = 'left';
    const tw = c.measureText(text).width, h = fs * 1.9, w = h + tw + fs * 0.7;
    const ty = (kind === 'cloud' ? endY - 26 : kind === 'night' ? yE + 22 : lerp(sy, gy, 0.6)) - h / 2;
    const tx = Math.min(v.vw - w - 6, fxm + (kind === 'night' ? 22 : 40));
    const accent = kind === 'wrong' ? '#c8d2e8' : '#ffb547';
    c.globalAlpha = a;
    pill(c, tx, ty, w, h, accent, 'rgba(7,14,30,.9)');
    const ix = tx + h / 2, iy = ty + h / 2, r = h * 0.27;
    c.strokeStyle = accent; c.lineWidth = 1.8; c.lineCap = 'round';
    c.beginPath(); c.arc(ix, iy, r, 0, 6.283); c.moveTo(ix - r * 0.7, iy + r * 0.7); c.lineTo(ix + r * 0.7, iy - r * 0.7); c.stroke(); c.lineCap = 'butt';
    c.fillStyle = '#eef3ff'; c.fillText(text, tx + h - fs * 0.1, iy + 0.5);
    c.globalAlpha = 1;
  }
}

function drawOrbs(c: C2, s: GameState, v: View, fx: Fx) {
  const [lx, ly] = lensPos(s, v);
  c.save();
  if (fx.quality === 3) c.globalCompositeOperation = 'lighter';
  for (const o of fx.orbs) {
    const k = Math.min(1, o.t / o.dur), e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
    const x = lerp(o.x0, lx, e) + Math.sin(o.wob + k * 8) * 5 * (1 - k), y = lerp(o.y0, ly, e);
    drawGlow(c, glow(o.color, true), x, y, 14 * (1 - k * 0.35));
  }
  c.restore();
}

/* ---------- satellite ---------- */
function drawSatellite(c: C2, s: GameState, v: View, fx: Fx, climbing: boolean, K: Kit) {
  if (s.over) return;
  const sx = v.satX, sy = yOf(v, s.a);
  const sensor = SENSORS[s.sensor];
  const blink = s.invuln > 0 && !fx.reduced && Math.floor(fx.time * 14) % 2 === 0;
  c.save();
  c.translate(sx, sy);
  c.rotate(satTilt(s));
  c.globalAlpha = blink ? 0.4 : 1;
  const sc = SAT_SCALE * (1 + fx.satPulse * 0.05);
  c.scale(sc, sc);
  if (climbing) { // thruster plume from the rear nozzle
    const fl = fx.reduced ? 20 : 17 + Math.random() * 8;
    c.save(); c.translate(SAT_NOZZLE[0], SAT_NOZZLE[1]); c.rotate(Math.PI * 0.76);
    if (fx.quality === 3) c.globalCompositeOperation = 'lighter';
    drawGlow(c, glow('#ff9a3c'), fl * 0.45, 0, fl * 0.75, 6.5);
    const fg = c.createLinearGradient(0, 0, fl, 0);
    fg.addColorStop(0, 'rgba(255,250,225,.98)'); fg.addColorStop(0.35, 'rgba(255,190,90,.85)'); fg.addColorStop(1, 'rgba(255,90,30,0)');
    c.fillStyle = fg; c.beginPath(); c.moveTo(0, -3); c.quadraticCurveTo(fl * 0.5, -3.6, fl, 0); c.quadraticCurveTo(fl * 0.5, 3.6, 0, 3); c.closePath(); c.fill();
    c.restore();
  }
  drawSprite(c, K.sat, 1);
  // sunlight sweeping across the solar wings
  if (fx.quality === 3 && !fx.reduced) {
    const gp = (fx.time % 4.6) / 0.8;
    if (gp < 1) {
      c.save(); c.beginPath(); c.rect(-75.5, -12, 53.5, 22); c.rect(22, -12, 53.5, 22); c.clip();
      const gx = -90 + gp * 190, sg = c.createLinearGradient(gx - 14, 0, gx + 14, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.5)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sg; c.transform(1, 0, -0.5, 1, 0, 0); c.fillRect(gx - 14, -14, 28, 28);
      c.restore();
    }
  }
  // status lights and the lens, in the colour of the active eye
  for (let k = 0; k < 3; k++) { c.fillStyle = k === 1 ? sensor.color : k === 0 && s.status === 'ok' ? '#9be89b' : '#3d5a8c'; c.beginPath(); c.arc(-8.6 + k * 3.4, -6.6, 0.95, 0, 6.283); c.fill(); }
  if (fx.reduced || Math.floor(fx.time * 2) % 2 === 0) { c.fillStyle = '#ff6b6b'; c.beginPath(); c.arc(-4.5, -25, 1.3, 0, 6.283); c.fill(); if (fx.quality > 1) { c.globalAlpha *= 0.6; drawGlow(c, glow('#ff6b6b'), -4.5, -25, 5); c.globalAlpha = blink ? 0.4 : 1; } }
  drawGlow(c, glow(sensor.color, true), 0, SAT_LENS_Y - 1, 8 + fx.switchPulse * 9 + fx.satPulse * 2);
  // shield bubble after a hit
  if (s.invuln > 0 || fx.shieldRing > 0) {
    c.globalAlpha = Math.min(1, fx.shieldRing + 0.3) * (blink ? 0.45 : 0.85);
    c.strokeStyle = '#8fd0ff'; c.lineWidth = 1.6 + fx.shieldRing * 3;
    c.beginPath(); c.ellipse(0, 0, 44 + (1 - fx.shieldRing) * 8, 30 + (1 - fx.shieldRing) * 6, 0, 0, 6.283); c.stroke();
    c.globalAlpha *= 0.16; c.fillStyle = '#8fd0ff'; c.fill();
  }
  c.restore();
}

/* ---------- junk ---------- */
const DANGER = '#ff5d5d';
function drawJunk(c: C2, j: Junk, x: number, y: number, fx: Fx, K: Kit) {
  const r = j.r, live = j.hitT === 0;
  c.save();
  c.translate(x, y);
  if (!live) { const k = j.hitT; c.translate(k * 130, -k * 70); c.globalAlpha = Math.max(0, 1 - k * 1.4); }
  const pulse = fx.reduced ? 0.7 : 0.55 + 0.45 * Math.sin(fx.time * 5 + j.id);
  if (live) { // danger read: red glow and a hazard ring at about the real hit size
    if (fx.quality > 1) { c.globalAlpha = 0.34 + 0.22 * pulse; drawGlow(c, glow(DANGER), 0, 0, r * 2.3); }
    c.globalAlpha = 0.5 + 0.4 * pulse; c.strokeStyle = DANGER; c.lineWidth = 1.5; c.setLineDash([5, 5]); c.lineDashOffset = fx.reduced ? 0 : -fx.time * 14;
    c.beginPath(); c.arc(0, 0, r * 1.22, 0, 6.283); c.stroke(); c.setLineDash([]);
    c.globalAlpha = 1;
  }
  c.rotate(j.rot);
  drawSprite(c, K.junk[j.kind % K.junk.length], r / JUNK_R);
  c.restore();
}
/** Arrows on the right edge for junk that is about to fly in (matters most on narrow screens). */
function drawJunkWarnings(c: C2, s: GameState, v: View, fx: Fx) {
  const ahead = Math.max(260, s.speed * 1.1);
  for (const j of s.junk) {
    const x = v.satX + (j.x - s.dist);
    if (j.hitT > 0 || x <= v.vw + j.r || x > v.vw + ahead) continue;
    const y = yOf(v, j.a), k = 1 - (x - v.vw) / ahead, blinkA = fx.reduced ? 1 : 0.55 + 0.45 * Math.sin(fx.time * 12);
    c.globalAlpha = (0.35 + 0.65 * k) * blinkA;
    drawGlow(c, glow(DANGER), v.vw - 6, y, 34, 26);
    c.fillStyle = DANGER; c.strokeStyle = '#1a0a10'; c.lineWidth = 1.2; c.lineJoin = 'round';
    const px = v.vw - 9, sz = 8 + k * 4;
    c.beginPath(); c.moveTo(px - sz * 1.1, y); c.lineTo(px, y - sz); c.lineTo(px, y + sz); c.closePath(); c.fill(); c.stroke();
    c.globalAlpha = 1;
  }
}

/* ---------- HUD (css px) ---------- */
function hintSensor(text: string): SensorId | null { for (const z of Object.values(ZONES)) if (z.hint === text) return z.sensor; return null; }
function shieldPath(c: C2, w: number, h: number) { c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w, h * 0.17); c.lineTo(w, h * 0.54); c.quadraticCurveTo(w, h * 0.85, w / 2, h); c.quadraticCurveTo(0, h * 0.85, 0, h * 0.54); c.lineTo(0, h * 0.17); c.closePath(); }
function drawHud(c: C2, s: GameState, v: View, fx: Fx, best: number) {
  c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  const narrow = v.narrow, pad = narrow ? 10 : 16;
  const font = (px: number, wt = 700) => `${wt} ${px}px ${FONT}`;
  const spacing = (em: string) => { if ('letterSpacing' in c) (c as C2 & { letterSpacing: string }).letterSpacing = em; };
  c.textBaseline = 'alphabetic';
  // score panel
  const pw = narrow ? 140 : 184, ph = narrow ? 66 : 82;
  const pg = c.createLinearGradient(0, pad, 0, pad + ph); pg.addColorStop(0, 'rgba(16,28,54,.78)'); pg.addColorStop(1, 'rgba(6,12,26,.78)');
  c.fillStyle = pg; rr(c, pad, pad, pw, ph, 14); c.fill();
  c.strokeStyle = 'rgba(140,168,224,.3)'; c.lineWidth = 1; c.stroke();
  c.textAlign = 'left';
  spacing('0.09em'); c.fillStyle = '#9fb0d4'; c.font = font(narrow ? 10 : 11, 700); c.fillText('SCORE', pad + 14, pad + (narrow ? 18 : 22)); spacing('0px');
  const pop = fx.reduced ? 0 : fx.scorePop;
  c.fillStyle = pop > 0.05 ? mix('#ffffff', SENSORS[s.sensor].color, pop * 0.7) : '#ffffff'; c.font = font((narrow ? 25 : 32) + pop * 2, 800); c.fillText(String(s.score), pad + 13, pad + (narrow ? 43 : 53));
  c.fillStyle = '#b4c2e0'; c.font = font(narrow ? 11 : 12.5, 600); c.fillText(`Orbit ${s.orbit}`, pad + 14, pad + (narrow ? 57 : 70));
  if (best > 0) { c.textAlign = 'right'; c.fillStyle = '#8697bd'; c.fillText(`Best ${best}`, pad + pw - 14, pad + (narrow ? 57 : 70)); c.textAlign = 'left'; }
  // where we are around the orbit: day, then the night side
  const bx = pad + 14, bw = pw - 28, by = pad + ph - (narrow ? 5.5 : 7), prog = ((s.dist / ORBIT_LEN) % 1 + 1) % 1;
  c.fillStyle = 'rgba(160,190,240,.35)'; rr(c, bx, by, bw, 2.5, 1.25); c.fill();
  c.fillStyle = '#39478f'; c.fillRect(bx + bw * 0.58, by, bw * 0.24, 2.5);
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(bx + bw * prog, by + 1.25, 3, 0, 6.283); c.fill();
  // shields
  const sx0 = pad + pw + 10, sy0 = pad + 4;
  for (let i = 0; i < MAX_SHIELDS; i++) {
    const frac = Math.max(0, Math.min(1, s.shields - i));
    const x = sx0 + i * (narrow ? 23 : 28), w = narrow ? 19 : 23, h = narrow ? 23 : 28;
    c.save(); c.translate(x, sy0);
    shieldPath(c, w, h); c.fillStyle = 'rgba(8,16,32,.7)'; c.fill();
    if (frac > 0) {
      c.save(); shieldPath(c, w, h); c.clip();
      const flash = s.shields <= 1 && !fx.reduced && Math.floor(fx.time * 4) % 2 === 0, low = s.shields <= 1;
      const sg = c.createLinearGradient(0, 0, w, h);
      if (flash || (low && fx.reduced)) { sg.addColorStop(0, '#ff9aa0'); sg.addColorStop(1, '#d9434d'); } else { sg.addColorStop(0, '#b6e2ff'); sg.addColorStop(1, '#4a9be6'); }
      c.fillStyle = sg; c.fillRect(0, h * (1 - frac), w, h * frac);
      c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(0, 0, w / 2, h);
      c.restore();
    }
    shieldPath(c, w, h); c.strokeStyle = frac > 0 ? '#e2f1ff' : 'rgba(124,150,204,.5)'; c.lineWidth = 1.5; c.stroke();
    c.restore();
  }
  // combo
  const cx = v.w / 2;
  if (s.combo >= 3) {
    const cp = fx.reduced ? 0 : fx.comboPop;
    const fsz = (narrow ? 15 : 18) + cp * 6;
    c.textAlign = 'center';
    const label = `${s.combo} in a row`;
    c.font = font(fsz, 800);
    const tw = c.measureText(label).width + (s.mult > 1 ? 74 : 30);
    const by2 = narrow ? pad + ph + 8 : pad;
    c.fillStyle = 'rgba(8,16,32,.72)'; rr(c, cx - tw / 2, by2, tw, narrow ? 34 : 38, 19); c.fill();
    c.strokeStyle = s.mult > 1 ? '#ffb547' : 'rgba(140,168,224,.3)'; c.lineWidth = 1.4; c.stroke();
    c.fillStyle = '#ffffff'; c.fillText(label, cx - (s.mult > 1 ? 19 : 0), by2 + (narrow ? 23 : 25));
    if (s.mult > 1) { c.fillStyle = '#ffb547'; c.font = font(fsz + 2, 800); c.fillText(`x${s.mult}`, cx + tw / 2 - 26, by2 + (narrow ? 23 : 25)); }
    if (s.status !== 'ok' && s.combo > 0) { // grace bar
      const k = Math.max(0, 1 - s.comboGap / COMBO_GRACE);
      c.fillStyle = 'rgba(255,181,71,.9)'; c.fillRect(cx - tw / 2 + 16, by2 + (narrow ? 29 : 32), (tw - 32) * k, 2.5);
    }
    c.textAlign = 'left';
  }
  // hint pill (with the eye to press, when the hint names one)
  if (s.hint && !s.over) {
    const h = s.hint, a = Math.min(1, h.t / 0.2, (h.dur - h.t) / 0.4);
    const sen = hintSensor(h.text), img = sen ? eyeImage(sen) : null;
    c.font = font(narrow ? 14 : 17, 700);
    const hh = narrow ? 36 : 42, icw = img ? hh - 8 : 0;
    const tw = Math.min(v.w - 24, c.measureText(h.text).width + 40 + (img ? icw + 4 : 0));
    const hy = (narrow ? pad + ph + 8 + (s.combo >= 3 ? 42 : 0) : pad + 52) + (1 - a) * -8;
    c.globalAlpha = Math.max(0, a);
    c.fillStyle = 'rgba(0,0,0,.35)'; rr(c, cx - tw / 2, hy + 3, tw, hh, hh / 2); c.fill();
    const hg = c.createLinearGradient(0, hy, 0, hy + hh); hg.addColorStop(0, '#ffcf7a'); hg.addColorStop(1, '#ffb040');
    c.fillStyle = hg; rr(c, cx - tw / 2, hy, tw, hh, hh / 2); c.fill();
    if (img && sen) {
      c.fillStyle = '#16213a'; c.beginPath(); c.arc(cx - tw / 2 + hh / 2, hy + hh / 2, hh / 2 - 3, 0, 6.283); c.fill();
      c.drawImage(img, cx - tw / 2 + 7, hy + 7, hh - 14, hh - 14);
    }
    c.fillStyle = '#16213a'; c.textAlign = 'center'; c.fillText(h.text, cx + (img ? icw / 2 : 0), hy + (narrow ? 23.5 : 27.5), tw - 24 - (img ? icw : 0));
    c.globalAlpha = 1; c.textAlign = 'left';
  }
  // orbit banner
  if (fx.banner > 0) {
    const a = Math.min(1, fx.banner * 2.4) * Math.min(1, (1 - (1 - fx.banner)) * 1.6);
    c.globalAlpha = Math.max(0, Math.min(1, a));
    c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.font = font(narrow ? 30 : 44, 800);
    c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 14;
    c.fillText(fx.bannerText, cx, v.h * 0.4 - (1 - fx.banner) * 20);
    c.font = font(narrow ? 13 : 17, 600); c.fillStyle = '#cfe0ff'; c.fillText('Faster now', cx, v.h * 0.4 + 26 - (1 - fx.banner) * 20);
    c.shadowBlur = 0; c.shadowColor = 'transparent';
    c.globalAlpha = 1; c.textAlign = 'left';
  }
  if (fx.hitFlash > 0) {
    const g = c.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.3, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    g.addColorStop(0, 'rgba(229,99,107,0)'); g.addColorStop(1, `rgba(229,99,107,${0.5 * fx.hitFlash})`);
    c.fillStyle = g; c.fillRect(0, 0, v.w, v.h);
  }
}

/* ---------- frame ---------- */
export function render(c: C2, s: GameState, v: View, fx: Fx, climbing: boolean, best: number, hud = true) {
  const K = getKit(v, fx.quality);
  const now = s.segments.find((g) => s.dist >= g.x0 && s.dist < g.x1)?.zone ?? 'ocean';
  const T = getTextures(Math.min(v.px, v.narrow ? 1.25 : 1.5), v.groundH, [now]);
  runTextureJobs(hud ? 7 : 12);
  c.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, 0, 0);
  let ox = 0, oy = 0;
  if (fx.shake > 0 && !fx.reduced) { ox = (Math.random() - 0.5) * 16 * fx.shake; oy = (Math.random() - 0.5) * 12 * fx.shake; }
  c.translate(ox, oy);
  drawSky(c, s, v, fx, K);
  drawAtmosphere(c, s, v, fx);
  drawTerrain(c, s, v, fx, T);
  drawClouds(c, s, v, fx, T);
  drawLimb(c, s, v, fx);
  drawZoneLabels(c, s, v);
  if (hud) drawZoneFlags(c, s, v);
  drawBeam(c, s, v, fx);
  for (const j of s.junk) {
    const x = v.satX + (j.x - s.dist);
    if (x < -70 || x > v.vw + 70) continue;
    drawJunk(c, j, x, yOf(v, j.a), fx, K);
  }
  drawSatellite(c, s, v, fx, climbing && !s.easy, K);
  drawOrbs(c, s, v, fx);
  // particles
  c.save();
  for (const p of fx.particles) {
    const k = p.life / p.max;
    if (p.kind === 'debris') {
      c.fillStyle = p.color; c.globalAlpha = k;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); c.restore();
    } else if (p.kind === 'smoke') {
      c.globalAlpha = k * 0.4; drawGlow(c, glow(p.color), p.x, p.y, p.size * (3.4 - k * 1.6));
    } else {
      c.globalAlpha = k; drawGlow(c, glow(p.color, true), p.x, p.y, p.size * (1.6 + k * 1.6));
    }
  }
  c.restore();
  c.globalAlpha = 1;
  if (hud) drawJunkWarnings(c, s, v, fx);
  if (hud) drawHud(c, s, v, fx, best);
}

export function eyeColor(id: SensorId) { return SENSORS[id].color; }
