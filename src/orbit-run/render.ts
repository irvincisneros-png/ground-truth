/** Orbit Run renderer: Canvas 2D, authored vector art, layered parallax. No images. */
import { SENSORS, ZONES } from './content';
import type { SensorId, ZoneId } from './content';
import { BAND, MAX_SHIELDS, cloudAt, nightFactorAt } from './game';
import type { GameEvent, GameState, Junk } from './game';

export type Quality = 1 | 2 | 3;
export interface View { w: number; h: number; dpr: number; scale: number; vw: number; vh: number; satX: number; gy0: number; bandBottom: number; R: number; narrow: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'spark' | 'smoke' | 'debris'; rot: number; vr: number; world: boolean }
interface Orb { t: number; dur: number; x0: number; y0: number; color: string; wob: number }
export interface Fx {
  time: number; particles: Particle[]; orbs: Orb[]; shake: number; flash: number; hitFlash: number; quality: Quality; reduced: boolean;
  satPulse: number; switchPulse: number; comboPop: number; comboPopText: string; banner: number; bannerText: string; thrustAcc: number; shieldRing: number;
  lowShieldFlash: number;
}
export function createFx(reduced: boolean): Fx {
  return { time: 0, particles: [], orbs: [], shake: 0, flash: 0, hitFlash: 0, quality: 3, reduced, satPulse: 0, switchPulse: 0, comboPop: 0, comboPopText: '', banner: 0, bannerText: '', thrustAcc: 0, shieldRing: 0, lowShieldFlash: 0 };
}

export function computeView(w: number, h: number, dpr: number): View {
  const scale = Math.min(h / 560, w / 460);
  const vw = w / scale, vh = h / scale;
  const groundH = 130 + Math.max(0, vh - 560) * 0.55;
  const gy0 = vh - groundH;
  return { w, h, dpr, scale, vw, vh, satX: vw * (vw > 700 ? 0.27 : 0.24), gy0, bandBottom: gy0 - 62, R: 3000, narrow: w < 600 };
}
const yOf = (v: View, a: number) => v.bandBottom - a * BAND;
const groundAt = (v: View, vx: number) => { const dx = vx - v.vw / 2; return v.gy0 + v.R - Math.sqrt(v.R * v.R - dx * dx); };

/* ---------- small helpers ---------- */
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function rgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a: string, b: string, t: number): string { const A = rgb(a), B = rgb(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; }
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const withAlpha = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

/* ---------- effects state ---------- */
const MAX_PARTICLES: Record<Quality, number> = { 1: 24, 2: 70, 3: 160 };
function addParticle(fx: Fx, p: Particle) { if (fx.particles.length < MAX_PARTICLES[fx.quality]) fx.particles.push(p); }

export function fxEvents(fx: Fx, s: GameState, v: View, events: GameEvent[]) {
  const satY = yOf(v, s.a);
  const fy = groundAt(v, v.satX);
  for (const e of events) {
    if (e.type === 'collect') {
      const col = SENSORS[s.sensor].color;
      fx.orbs.push({ t: 0, dur: 0.42, x0: v.satX + (Math.random() - 0.5) * 26, y0: fy + 2, color: col, wob: Math.random() * 6.28 });
      if (fx.orbs.length > 14) fx.orbs.shift();
      const n = fx.quality === 1 ? 0 : fx.quality === 2 ? 1 : 2;
      for (let i = 0; i < n; i++) addParticle(fx, { x: v.satX + (Math.random() - 0.5) * 40, y: fy, vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 70, life: 0.5, max: 0.5, size: 2 + Math.random() * 2, color: col, kind: 'spark', rot: 0, vr: 0, world: true });
    } else if (e.type === 'hit') {
      if (!fx.reduced) fx.shake = 1;
      fx.hitFlash = 1;
      fx.shieldRing = 1;
      const n = fx.quality === 1 ? 4 : fx.quality === 2 ? 8 : 14;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, sp = 60 + Math.random() * 190;
        addParticle(fx, { x: v.satX + 10, y: satY, vx: Math.cos(a) * sp + 50, vy: Math.sin(a) * sp, life: 0.9, max: 0.9, size: 2 + Math.random() * 4, color: i % 3 === 0 ? '#ffb547' : '#9fb0d4', kind: 'debris', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, world: false });
      }
    } else if (e.type === 'edge') {
      if (!fx.reduced) fx.shake = Math.max(fx.shake, 0.45);
      fx.hitFlash = Math.max(fx.hitFlash, 0.4);
    } else if (e.type === 'combo') {
      fx.comboPop = 1; fx.comboPopText = `x${e.mult} combo`;
      if (!fx.reduced) for (let i = 0; i < (fx.quality === 1 ? 0 : 10); i++) {
        const a = (i / 10) * 6.28;
        addParticle(fx, { x: v.satX, y: satY, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, life: 0.55, max: 0.55, size: 3, color: '#ffb547', kind: 'spark', rot: 0, vr: 0, world: false });
      }
    } else if (e.type === 'switch') {
      fx.switchPulse = 1;
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
  const satY = yOf(v, s.a);
  for (const o of fx.orbs) {
    o.t += dt;
    if (o.t >= o.dur && !(o as Orb & { done?: boolean }).done) {
      (o as Orb & { done?: boolean }).done = true;
      fx.satPulse = 1;
      if (fx.quality > 1) addParticle(fx, { x: v.satX, y: satY + 10, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.3) * 60, life: 0.35, max: 0.35, size: 2.5, color: o.color, kind: 'spark', rot: 0, vr: 0, world: false });
    }
  }
  fx.orbs = fx.orbs.filter((o) => o.t < o.dur + 0.02);
  // thruster puffs while climbing
  if (climbing && !s.over && fx.quality > 1 && !fx.reduced) {
    fx.thrustAcc += dt * 40;
    while (fx.thrustAcc >= 1) {
      fx.thrustAcc -= 1;
      addParticle(fx, { x: v.satX - 30, y: satY + 4 + (Math.random() - 0.5) * 5, vx: -60 - Math.random() * 40, vy: 25 + Math.random() * 30, life: 0.5, max: 0.5, size: 2.5 + Math.random() * 2, color: '#ffd9a0', kind: 'smoke', rot: 0, vr: 0, world: false });
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

/* ---------- background ---------- */
interface Star { x: number; y: number; s: number; a: number; ph: number }
const starLayers: Star[][] = [0, 1, 2].map((L) => Array.from({ length: [70, 50, 34][L] }, (_, i) => ({ x: hash(i * 3.1 + L * 91) * 1400, y: hash(i * 7.7 + L * 13 + 5), s: [1, 1.4, 2][L], a: [0.45, 0.65, 0.95][L], ph: hash(i + L * 5) * 6.28 })));
const STAR_PARALLAX = [0.04, 0.1, 0.2];

function drawSky(c: CanvasRenderingContext2D, s: GameState, v: View, fx: Fx) {
  const g = c.createLinearGradient(0, 0, 0, v.gy0);
  g.addColorStop(0, '#04080f'); g.addColorStop(0.55, '#0a1426'); g.addColorStop(1, '#142a52');
  c.fillStyle = g; c.fillRect(-20, -20, v.vw + 40, v.vh + 40);
  if (fx.quality >= 2) {
    const n1 = c.createRadialGradient(v.vw * 0.7 - (s.dist * 0.03) % (v.vw * 1.6), v.gy0 * 0.35, 0, v.vw * 0.7 - (s.dist * 0.03) % (v.vw * 1.6), v.gy0 * 0.35, v.vw * 0.5);
    n1.addColorStop(0, 'rgba(110,80,200,.13)'); n1.addColorStop(1, 'rgba(110,80,200,0)');
    c.fillStyle = n1; c.fillRect(0, 0, v.vw, v.gy0);
    const n2 = c.createRadialGradient(v.vw * 0.2, v.gy0 * 0.55, 0, v.vw * 0.2, v.gy0 * 0.55, v.vw * 0.45);
    n2.addColorStop(0, 'rgba(40,120,210,.12)'); n2.addColorStop(1, 'rgba(40,120,210,0)');
    c.fillStyle = n2; c.fillRect(0, 0, v.vw, v.gy0);
  }
  const layers = fx.quality === 1 ? 1 : 3;
  for (let L = 0; L < layers; L++) {
    const tile = 1400, off = (s.dist * STAR_PARALLAX[L]) % tile;
    for (const st of starLayers[L]) {
      const tw = fx.reduced ? 1 : 0.75 + 0.25 * Math.sin(fx.time * 1.7 + st.ph);
      c.globalAlpha = st.a * tw;
      c.fillStyle = L === 2 ? '#dbe8ff' : '#aac4f0';
      for (let rep = 0; rep < 2; rep++) {
        const x = ((st.x - off) % tile + tile) % tile - (rep ? tile : 0);
        if (x > -4 && x < v.vw + 4) c.fillRect(x, st.y * (v.gy0 - 10), st.s, st.s);
      }
    }
  }
  c.globalAlpha = 1;
  if (fx.quality >= 2) { // a distant moon
    const mx = ((v.vw * 0.78 - s.dist * 0.05) % (v.vw + 260) + (v.vw + 260)) % (v.vw + 260) - 130, my = v.gy0 * 0.28, r = 34;
    const mg = c.createRadialGradient(mx - 10, my - 10, 4, mx, my, r);
    mg.addColorStop(0, '#e6ecf8'); mg.addColorStop(1, '#6d7ca0');
    c.fillStyle = mg; c.beginPath(); c.arc(mx, my, r, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(70,85,120,.35)';
    for (const [dx, dy, cr] of [[-9, 6, 7], [10, -8, 5], [8, 12, 4]]) { c.beginPath(); c.arc(mx + dx, my + dy, cr, 0, 6.283); c.fill(); }
    const sh = c.createRadialGradient(mx + 22, my + 8, 6, mx + 22, my + 8, r * 1.5);
    sh.addColorStop(0, 'rgba(4,8,15,0)'); sh.addColorStop(1, 'rgba(4,8,15,.55)');
    c.fillStyle = sh; c.beginPath(); c.arc(mx, my, r, 0, 6.283); c.fill();
  }
}

/* ---------- terrain ---------- */
const ZONE_BASE: Record<ZoneId, [string, string]> = {
  ocean: ['#1a72b8', '#0d4380'], reef: ['#22cfc0', '#0a86a2'], forest: ['#2a8447', '#15552f'], ice: ['#eaf5fd', '#b2d0ea'], sea: ['#3495df', '#1b63aa'],
};
function drawZone(c: CanvasRenderingContext2D, zone: ZoneId, x0: number, x1: number, v: View, s: GameState, fx: Fx) {
  const top = v.gy0 - 6, bot = v.vh + 4;
  const g = c.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, ZONE_BASE[zone][0]); g.addColorStop(1, ZONE_BASE[zone][1]);
  c.fillStyle = g; c.fillRect(x0, top, x1 - x0, bot - top);
  const cell = zone === 'forest' ? 26 : 32;
  const wx0 = s.dist + (x0 - v.satX), first = Math.floor(wx0 / cell) - 1, last = Math.ceil((s.dist + (x1 - v.satX)) / cell) + 1;
  const rows = fx.quality === 1 ? 3 : 5;
  const rowH = (bot - v.gy0) / rows;
  for (let i = first; i <= last; i++) {
    for (let r = 0; r < rows; r++) {
      const hsh = hash(i * 13.37 + r * 71.1 + (zone.length * 5));
      const hs2 = hash(i * 5.1 + r * 3.3 + 9);
      const depth = 0.55 + (r / rows) * 0.9; // nearer rows are bigger
      const px = v.satX + (i * cell + hsh * cell - s.dist), py = v.gy0 + 8 + r * rowH + hs2 * rowH * 0.7;
      if (px < x0 - 20 || px > x1 + 20) continue;
      if (zone === 'forest') {
        const rad = (9 + hsh * 7) * depth;
        c.fillStyle = hs2 < 0.3 ? '#16542f' : hs2 < 0.6 ? '#237a42' : hs2 < 0.85 ? '#2d9150' : '#195f35';
        c.beginPath(); c.arc(px, py, rad, 0, 6.283); c.fill();
        c.fillStyle = 'rgba(190,255,190,.22)'; c.beginPath(); c.arc(px - rad * 0.3, py - rad * 0.35, rad * 0.5, 0, 6.283); c.fill();
      } else if (zone === 'reef') {
        if (hsh < 0.38) { // sand patch
          c.fillStyle = 'rgba(240,226,170,.38)'; c.beginPath(); c.ellipse(px, py, 22 * depth, 7 * depth, 0, 0, 6.283); c.fill();
        } else {
          const cols = ['#ff7a8a', '#ffb547', '#e5639e', '#ffd36b'];
          const col = cols[Math.floor(hs2 * 4)];
          const rad = 3.2 * depth;
          c.fillStyle = 'rgba(5,60,80,.35)'; c.beginPath(); c.ellipse(px, py + 5 * depth, 10 * depth, 3.4 * depth, 0, 0, 6.283); c.fill();
          c.fillStyle = col;
          for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(px + (k - 1.5) * 4.5 * depth, py - Math.abs(k - 1.5) * 2.2 * depth, rad, 0, 6.283); c.fill(); }
        }
      } else if (zone === 'ice') {
        const w = (17 + hsh * 20) * depth, h = w * 0.5;
        c.fillStyle = '#12456f'; c.beginPath(); c.ellipse(px + 3, py + 3, w * 1.05, h * 1.05, 0.2, 0, 6.283); c.fill();
        c.fillStyle = hs2 < 0.5 ? '#f6fcff' : '#dcecf8';
        c.beginPath();
        for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.283 + hsh * 3, rad = 0.78 + hash(i * 7 + r * 3 + k) * 0.4; const X = px + Math.cos(a) * w * rad, Y = py + Math.sin(a) * h * rad; k ? c.lineTo(X, Y) : c.moveTo(X, Y); }
        c.closePath(); c.fill();
        c.strokeStyle = 'rgba(120,160,200,.55)'; c.lineWidth = 1; c.stroke();
      } else if (zone === 'sea') {
        if (hsh < 0.7) {
          c.strokeStyle = `rgba(230,244,255,${0.18 + hs2 * 0.3})`; c.lineWidth = 1.6 * depth;
          const w = (18 + hsh * 22) * depth;
          c.beginPath(); c.moveTo(px - w, py); c.quadraticCurveTo(px - w / 2, py - 5 * depth, px, py); c.quadraticCurveTo(px + w / 2, py + 5 * depth, px + w, py); c.stroke();
        }
      } else { // warm ocean
        if (hsh < 0.5) { c.strokeStyle = `rgba(190,225,255,${0.1 + hs2 * 0.16})`; c.lineWidth = 1.2 * depth; c.beginPath(); c.moveTo(px - 10 * depth, py); c.lineTo(px + 10 * depth, py); c.stroke(); }
      }
    }
  }
  if (zone === 'ocean') { // a warm cast and drifting warm plumes: reads as "heat"
    const w = c.createLinearGradient(0, top, 0, bot); w.addColorStop(0, 'rgba(255,120,60,0)'); w.addColorStop(1, 'rgba(255,120,60,.22)');
    c.fillStyle = w; c.fillRect(x0, top, x1 - x0, bot - top);
    if (fx.quality > 1) for (let k = Math.floor(wx0 / 190) - 1; k <= Math.ceil((s.dist + (x1 - v.satX)) / 190); k++) {
      const hh = hash(k * 2.3 + 1), px = v.satX + k * 190 + hh * 120 - s.dist, py = v.gy0 + 30 + hash(k + 7) * (bot - v.gy0 - 50);
      const ph = Math.sin(fx.time * 0.6 + k) * 0.5 + 0.5;
      c.fillStyle = `rgba(255,165,100,${0.07 + ph * 0.06})`; c.beginPath(); c.ellipse(px, py, 80 + hh * 40, 22, 0, 0, 6.283); c.fill();
      c.fillStyle = `rgba(255,200,140,${0.05 + ph * 0.04})`; c.beginPath(); c.ellipse(px, py, 40 + hh * 20, 11, 0, 0, 6.283); c.fill();
    }
  }
  if (zone === 'sea') { // broad swell bands
    c.fillStyle = 'rgba(255,255,255,.05)';
    for (let k = Math.floor(wx0 / 160) - 1; k <= Math.ceil((s.dist + (x1 - v.satX)) / 160); k++) c.fillRect(v.satX + k * 160 - s.dist, top, 54, bot - top);
  }
}

function drawTerrain(c: CanvasRenderingContext2D, s: GameState, v: View, fx: Fx) {
  // atmosphere glow behind the limb
  const cx = v.vw / 2, cy = v.gy0 + v.R;
  const ag = c.createRadialGradient(cx, cy, v.R - 2, cx, cy, v.R + 120);
  ag.addColorStop(0, 'rgba(120,200,255,.6)'); ag.addColorStop(0.12, 'rgba(80,160,255,.28)'); ag.addColorStop(1, 'rgba(60,120,255,0)');
  c.fillStyle = ag; c.fillRect(0, v.gy0 - 140, v.vw, 180);
  c.save();
  c.beginPath(); c.arc(cx, cy, v.R, 0, 6.283); c.clip();
  const margin = 40;
  for (const g of s.segments) {
    const x0 = v.satX + (g.x0 - s.dist), x1 = v.satX + (g.x1 - s.dist);
    if (x1 < -margin || x0 > v.vw + margin) continue;
    c.save(); c.beginPath(); c.rect(Math.max(x0, -margin), 0, Math.min(x1, v.vw + margin) - Math.max(x0, -margin) + 0.5, v.vh + 10); c.clip();
    drawZone(c, g.zone, Math.max(x0, -margin), Math.min(x1, v.vw + margin), v, s, fx);
    c.restore();
    if (x0 > -margin && x0 < v.vw + margin) { // coast line
      const sg = c.createLinearGradient(x0 - 12, 0, x0 + 12, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.5, 'rgba(0,10,30,.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg; c.fillRect(x0 - 12, v.gy0 - 8, 24, v.vh);
      c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x0 - 1, v.gy0 - 8, 2, v.vh);
    }
  }
  // depth shading: hazy at the horizon, brighter close in
  const sh = c.createLinearGradient(0, v.gy0 - 8, 0, v.vh);
  sh.addColorStop(0, 'rgba(120,180,255,.28)'); sh.addColorStop(0.2, 'rgba(120,180,255,.03)'); sh.addColorStop(1, 'rgba(0,0,0,.12)');
  c.fillStyle = sh; c.fillRect(0, v.gy0 - 8, v.vw, v.vh);
  // night side
  const step = 20, ng = c.createLinearGradient(0, 0, v.vw, 0), dg = c.createLinearGradient(0, 0, v.vw, 0);
  let anyNight = false;
  for (let sx = 0; sx <= v.vw + step; sx += step) {
    const f = nightFactorAt(s.dist + (sx - v.satX)), pos = Math.min(1, sx / v.vw);
    if (f > 0.001) anyNight = true;
    ng.addColorStop(pos, `rgba(2,6,22,${(f * 0.58).toFixed(3)})`);
    dg.addColorStop(pos, `rgba(255,150,90,${(0.2 * Math.sin(f * Math.PI)).toFixed(3)})`);
  }
  if (anyNight) { c.fillStyle = ng; c.fillRect(0, v.gy0 - 10, v.vw, v.vh); c.fillStyle = dg; c.fillRect(0, v.gy0 - 10, v.vw, v.vh); }
  // lights on the night side
  if (fx.quality > 1) {
    for (const g of s.segments) {
      if (g.zone !== 'forest') continue;
      const first = Math.floor(g.x0 / 70), last = Math.floor(g.x1 / 70);
      for (let i = first; i <= last; i++) {
        const wx = i * 70 + hash(i) * 50; if (wx < g.x0 || wx > g.x1 || hash(i * 3 + 1) > 0.3) continue;
        const f = nightFactorAt(wx); if (f < 0.3) continue;
        const sx = v.satX + (wx - s.dist), sy = v.gy0 + 26 + hash(i * 7) * (v.vh - v.gy0 - 36);
        c.fillStyle = `rgba(255,214,120,${f * 0.9})`; c.fillRect(sx, sy, 2.2, 2.2);
        c.fillStyle = `rgba(255,214,120,${f * 0.18})`; c.beginPath(); c.arc(sx + 1, sy + 1, 5, 0, 6.283); c.fill();
      }
    }
  }
  c.restore();
  // bright rim of the atmosphere over the limb
  c.save();
  c.lineCap = 'round';
  const rimNight = nightFactorAt(s.dist);
  for (const [w, a] of [[9, 0.07], [5, 0.14], [2.2, 0.5]] as const) {
    c.strokeStyle = `rgba(${Math.round(lerp(150, 90, rimNight))},${Math.round(lerp(215, 140, rimNight))},255,${a})`;
    c.lineWidth = w; c.beginPath(); c.arc(cx, cy, v.R + 0.5, Math.PI * 1.35, Math.PI * 1.65); c.stroke();
  }
  c.restore();
}

function drawZoneLabels(c: CanvasRenderingContext2D, s: GameState, v: View) {
  const fs = Math.max(13, 14 / v.scale * 0.9);
  c.font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.textBaseline = 'middle';
  for (const g of s.segments) {
    const x0 = v.satX + (g.x0 - s.dist), x1 = v.satX + (g.x1 - s.dist);
    if (x1 < 0 || x0 > v.vw) continue;
    const label = ZONES[g.zone].label;
    const tw = c.measureText(label).width + 20;
    let lx = Math.max(x0 + 10, 8);
    lx = Math.min(lx, x1 - tw - 8);
    if (lx + tw > v.vw - 6 && x0 + 10 > v.vw - tw) lx = v.vw - tw - 6;
    if (x1 - x0 < tw + 16) continue;
    const ly = v.vh - fs * 1.15 - 6;
    c.fillStyle = 'rgba(8,16,32,.72)'; rr(c, lx, ly - fs * 0.85, tw, fs * 1.7, fs * 0.85); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#e8eefc'; c.textAlign = 'left'; c.fillText(label, lx + 10, ly + 1);
  }
}

/* ---------- clouds ---------- */
function drawClouds(c: CanvasRenderingContext2D, s: GameState, v: View, fx: Fx) {
  for (const cl of s.clouds) {
    const x0 = v.satX + (cl.x0 - s.dist), x1 = v.satX + (cl.x1 - s.dist);
    if (x1 < -60 || x0 > v.vw + 60) continue;
    const len = cl.x1 - cl.x0, n = Math.round(len / 34);
    for (let pass = 0; pass < (fx.quality === 1 ? 1 : 3); pass++) {
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const edge = Math.pow(Math.sin(t * Math.PI), 0.55);
        const px = x0 + t * (x1 - x0), gy = groundAt(v, px);
        const rad = (14 + hash(cl.seed + i) * 13) * (0.5 + edge * 0.6);
        const py = gy - 6 - hash(cl.seed * 0.7 + i * 2) * 12 * edge;
        const nf = nightFactorAt(cl.x0 + t * len);
        if (pass === 0) { c.fillStyle = mix('#6f8fbb', '#1c2a48', nf); c.beginPath(); c.arc(px + 4, py + 9, rad, 0, 6.283); c.fill(); }
        else if (pass === 1) { c.fillStyle = mix('#f3f8ff', '#566b92', nf); c.beginPath(); c.arc(px, py, rad, 0, 6.283); c.fill(); }
        else { c.fillStyle = mix('#ffffff', '#7e93b8', nf); c.beginPath(); c.arc(px - rad * 0.25, py - rad * 0.3, rad * 0.55, 0, 6.283); c.fill(); }
      }
    }
  }
}

/* ---------- beam ---------- */
function drawBeam(c: CanvasRenderingContext2D, s: GameState, v: View, fx: Fx) {
  const sensor = SENSORS[s.sensor];
  const sy = yOf(v, s.a) + 15, sx = v.satX;
  const gy = groundAt(v, sx);
  const cloud = cloudAt(s, s.dist);
  const cloudy = !!cloud && sensor.blockedByCloud;
  const dark = s.status === 'night';
  let endY = gy + 2;
  if (cloudy) endY = gy - 40;
  const full = endY - sy;
  if (full < 6) return;
  const len = dark ? full * (0.38 + 0.04 * Math.sin(fx.time * 6)) : full;
  const yE = sy + len;
  const wTop = 3, wBot = dark ? 12 : cloudy ? 26 : 30;
  const col = dark ? '#7f8aa6' : sensor.color;
  const ok = s.status === 'ok';
  c.save();
  if (fx.quality === 3) c.globalCompositeOperation = 'lighter';
  const g = c.createLinearGradient(0, sy, 0, yE);
  g.addColorStop(0, withAlpha(col, dark ? 0.35 : 0.7)); g.addColorStop(1, withAlpha(col, dark ? 0 : ok ? 0.34 : 0.2));
  c.fillStyle = g;
  c.beginPath(); c.moveTo(sx - wTop, sy); c.lineTo(sx - wBot, yE); c.lineTo(sx + wBot, yE); c.lineTo(sx + wTop, sy); c.closePath(); c.fill();
  // beam pattern per sensor
  c.save();
  c.beginPath(); c.moveTo(sx - wTop, sy); c.lineTo(sx - wBot, yE); c.lineTo(sx + wBot, yE); c.lineTo(sx + wTop, sy); c.closePath(); c.clip();
  const widthAt = (y: number) => lerp(wTop, wBot, (y - sy) / Math.max(1, yE - sy));
  const t = fx.time;
  if (!dark) {
    c.lineWidth = 1.6;
    if (s.sensor === 'heat') {
      c.strokeStyle = withAlpha('#ffd0a0', 0.55);
      for (let k = -2; k <= 2; k++) {
        c.beginPath();
        for (let y = sy; y <= yE; y += 8) { const x = sx + k * widthAt(y) * 0.38 + Math.sin(y * 0.09 - t * 6 + k) * 3; y === sy ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke();
      }
    } else if (s.sensor === 'colour') {
      const bands = ['#ff6b6b', '#7be07b', '#6bb8ff'];
      for (let k = 0; k < 3; k++) {
        c.fillStyle = withAlpha(bands[k], 0.26);
        c.beginPath(); c.moveTo(sx + (k - 1.5) * wTop * 0.66, sy); c.lineTo(sx + (k - 1.5) * wBot * 0.66, yE); c.lineTo(sx + (k - 0.5) * wBot * 0.66, yE); c.lineTo(sx + (k - 0.5) * wTop * 0.66, sy); c.closePath(); c.fill();
      }
      c.strokeStyle = 'rgba(255,255,255,.4)';
      const y = sy + ((t * 140) % (yE - sy)); c.beginPath(); c.moveTo(sx - widthAt(y), y); c.lineTo(sx + widthAt(y), y); c.stroke();
    } else if (s.sensor === 'radar') {
      c.strokeStyle = withAlpha('#c8f0ff', 0.8);
      for (let k = 0; k < 5; k++) {
        const y = sy + (((t * 170 + k * ((yE - sy) / 5)) % (yE - sy)));
        const w = widthAt(y); c.globalAlpha = 1 - (y - sy) / (yE - sy) * 0.6;
        c.beginPath(); c.ellipse(sx, y, w, w * 0.22, 0, 0, Math.PI); c.stroke();
      }
      c.globalAlpha = 1;
    } else {
      c.strokeStyle = withAlpha('#ead6ff', 0.7);
      for (let k = 0; k < 4; k++) {
        const y0 = sy + (((t * 110 + k * ((yE - sy) / 4)) % (yE - sy)));
        c.beginPath();
        for (let dx = -1; dx <= 1.01; dx += 0.1) { const w = widthAt(y0); const x = sx + dx * w; const y = y0 + Math.sin(dx * 9 + t * 8) * 3.2; dx === -1 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke();
      }
    }
  }
  c.restore();
  if (dark) { // ghost outline: the beam is switched off
    c.strokeStyle = 'rgba(160,175,205,.28)'; c.lineWidth = 1.4; c.setLineDash([5, 7]);
    c.beginPath(); c.moveTo(sx - wTop, sy); c.lineTo(sx - 26, endY); c.moveTo(sx + wTop, sy); c.lineTo(sx + 26, endY); c.stroke(); c.setLineDash([]);
  }
  // footprint or scatter
  if (cloudy) {
    for (let i = 0; i < (fx.quality === 1 ? 4 : 9); i++) {
      const a = hash(i * 3 + Math.floor(t * 12)) * Math.PI + Math.PI, r = 8 + hash(i + Math.floor(t * 12) * 7) * 24;
      c.strokeStyle = withAlpha('#ffffff', 0.35); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(sx, endY); c.lineTo(sx + Math.cos(a) * r * 1.4, endY + Math.sin(a) * r * 0.7); c.stroke();
    }
  } else if (!dark) {
    const rg = c.createRadialGradient(sx, gy + 4, 0, sx, gy + 4, 50);
    rg.addColorStop(0, withAlpha(sensor.color, ok ? 0.85 : 0.22)); rg.addColorStop(1, withAlpha(sensor.color, 0));
    c.fillStyle = rg; c.save(); c.translate(sx, gy + 4); c.scale(1, 0.34); c.translate(-sx, -(gy + 4)); c.beginPath(); c.arc(sx, gy + 4, 50, 0, 6.283); c.fill(); c.restore();
    if (ok) {
      c.strokeStyle = withAlpha('#ffffff', 0.85); c.lineWidth = 1.8; c.setLineDash([7, 6]); c.lineDashOffset = -t * 30;
      c.beginPath(); c.ellipse(sx, gy + 4, 30, 9, 0, 0, 6.283); c.stroke(); c.setLineDash([]);
    }
  }
  c.restore();
}

function drawOrbs(c: CanvasRenderingContext2D, s: GameState, v: View, fx: Fx) {
  const sy = yOf(v, s.a) + 14;
  c.save();
  if (fx.quality === 3) c.globalCompositeOperation = 'lighter';
  for (const o of fx.orbs) {
    const k = Math.min(1, o.t / o.dur), e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
    const x = lerp(o.x0, v.satX, e) + Math.sin(o.wob + k * 8) * 5 * (1 - k), y = lerp(o.y0, sy, e);
    const r = 5.5 * (1 - k * 0.35);
    const g = c.createRadialGradient(x, y, 0, x, y, r * 2.6);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.3, withAlpha(o.color, 0.8)); g.addColorStop(1, withAlpha(o.color, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.6, 0, 6.283); c.fill();
  }
  c.restore();
}

/* ---------- satellite ---------- */
function drawSatellite(c: CanvasRenderingContext2D, s: GameState, v: View, fx: Fx, climbing: boolean) {
  const sx = v.satX, sy = yOf(v, s.a);
  const sensor = SENSORS[s.sensor];
  const blink = s.invuln > 0 && Math.floor(fx.time * 14) % 2 === 0;
  if (s.over) return;
  c.save();
  c.translate(sx, sy);
  c.rotate(-Math.max(-0.32, Math.min(0.32, s.v * 0.34)));
  c.globalAlpha = blink ? 0.35 : 1;
  const sc = 1.2 + fx.satPulse * 0.07;
  c.scale(sc, sc);
  // flame
  if (climbing) {
    const fl = 14 + Math.random() * 7;
    const fg = c.createLinearGradient(-17, 0, -17 - fl - 6, 0);
    fg.addColorStop(0, 'rgba(255,240,200,.95)'); fg.addColorStop(0.4, 'rgba(255,170,60,.8)'); fg.addColorStop(1, 'rgba(255,90,30,0)');
    c.fillStyle = fg; c.beginPath(); c.moveTo(-16, -4.5); c.lineTo(-17 - fl - 6, 0); c.lineTo(-16, 4.5); c.closePath(); c.fill();
  }
  // booms and panels
  c.strokeStyle = '#9fb0d4'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-14, -1); c.lineTo(-24, -1); c.moveTo(14, -1); c.lineTo(24, -1); c.stroke();
  for (const side of [-1, 1]) {
    c.save(); c.translate(side * 24, -1);
    const pw = 38;
    const x = side < 0 ? -pw : 0;
    const pg = c.createLinearGradient(0, -12, 0, 12); pg.addColorStop(0, '#3a76d6'); pg.addColorStop(1, '#173a85');
    c.fillStyle = pg; c.fillRect(x, -12, pw, 24);
    c.strokeStyle = 'rgba(160,205,255,.55)'; c.lineWidth = 0.9;
    c.beginPath();
    for (let k = 1; k < 4; k++) { c.moveTo(x + (pw / 4) * k, -12); c.lineTo(x + (pw / 4) * k, 12); }
    c.moveTo(x, 0); c.lineTo(x + pw, 0); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.moveTo(x, -12); c.lineTo(x + pw * 0.45, -12); c.lineTo(x + pw * 0.2, 12); c.lineTo(x, 12); c.closePath(); c.fill();
    c.strokeStyle = '#d5deee'; c.lineWidth = 1.6; c.strokeRect(x, -12, pw, 24);
    c.restore();
  }
  // body
  const bg = c.createLinearGradient(0, -11, 0, 11); bg.addColorStop(0, '#ffd27a'); bg.addColorStop(0.55, '#ffb547'); bg.addColorStop(1, '#b8700f');
  c.fillStyle = bg; rr(c, -15, -11, 30, 22, 5); c.fill();
  c.strokeStyle = '#0b1424'; c.lineWidth = 1.4; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.35)'; rr(c, -12, -9, 24, 3, 1.5); c.fill();
  c.fillStyle = '#17284a'; rr(c, -9, -3, 18, 8, 2); c.fill();
  for (let k = 0; k < 3; k++) { c.fillStyle = k === 1 ? sensor.color : '#2f4a7a'; c.beginPath(); c.arc(-4.5 + k * 4.5, 1, 1.4, 0, 6.283); c.fill(); }
  // dish and antenna
  c.strokeStyle = '#d5deee'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -11); c.lineTo(0, -17); c.stroke();
  c.fillStyle = '#e8eefc'; c.beginPath(); c.ellipse(0, -18, 6, 2.6, 0, 0, 6.283); c.fill();
  if (Math.floor(fx.time * 2) % 2 === 0) { c.fillStyle = '#ff6b6b'; c.beginPath(); c.arc(10, -14, 1.4, 0, 6.283); c.fill(); }
  // sensor lens
  const lg = c.createRadialGradient(0, 12, 0, 0, 12, 7);
  lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.35, sensor.color); lg.addColorStop(1, withAlpha(sensor.color, 0));
  c.fillStyle = '#0b1424'; c.beginPath(); c.arc(0, 11.5, 5, 0, 6.283); c.fill();
  c.fillStyle = lg; c.beginPath(); c.arc(0, 12, 5.8 + fx.switchPulse * 4, 0, 6.283); c.fill();
  // shield bubble
  if (s.invuln > 0 || fx.shieldRing > 0) {
    c.globalAlpha = Math.min(1, fx.shieldRing + 0.25) * (blink ? 0.4 : 0.8);
    c.strokeStyle = '#7cc4ff'; c.lineWidth = 2 + fx.shieldRing * 3;
    c.beginPath(); c.arc(0, 0, 32 + (1 - fx.shieldRing) * 8, 0, 6.283); c.stroke();
  }
  c.restore();
}

/* ---------- junk ---------- */
function drawJunk(c: CanvasRenderingContext2D, j: Junk, x: number, y: number, fx: Fx) {
  const r = j.r;
  c.save();
  c.translate(x, y);
  if (j.hitT > 0) { const k = j.hitT; c.translate(k * 120, -k * 60); c.globalAlpha = Math.max(0, 1 - k * 1.4); }
  // warning glow so hazards read against the blue
  if (fx.quality > 1 && j.hitT === 0) {
    const g = c.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.1);
    g.addColorStop(0, 'rgba(255,107,107,.28)'); g.addColorStop(1, 'rgba(255,107,107,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 2.1, 0, 6.283); c.fill();
  }
  c.rotate(j.rot);
  c.lineJoin = 'round'; c.lineWidth = 2; c.strokeStyle = '#0b1424';
  const metal = c.createLinearGradient(-r, -r, r, r); metal.addColorStop(0, '#b4c3e0'); metal.addColorStop(1, '#4b5f86');
  if (j.kind === 0) { // snapped solar panel
    c.fillStyle = '#2c5fb0'; c.beginPath(); c.moveTo(-r * 1.05, -r * 0.5); c.lineTo(r * 0.7, -r * 0.72); c.lineTo(r * 1.1, r * 0.1); c.lineTo(r * 0.55, r * 0.25); c.lineTo(r * 0.3, r * 0.62); c.lineTo(-r * 0.2, r * 0.3); c.lineTo(-r * 0.85, r * 0.5); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(190,225,255,.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-r * 0.4, -r * 0.6); c.lineTo(-r * 0.3, r * 0.4); c.moveTo(r * 0.2, -r * 0.7); c.lineTo(r * 0.25, r * 0.3); c.moveTo(-r, -r * 0.05); c.lineTo(r * 1.05, -r * 0.1); c.stroke();
  } else if (j.kind === 1) { // rocket body
    c.fillStyle = metal; rr(c, -r * 1.15, -r * 0.42, r * 2.3, r * 0.84, r * 0.2); c.fill(); c.stroke();
    c.fillStyle = '#ffb547'; c.fillRect(-r * 0.1, -r * 0.42, r * 0.34, r * 0.84);
    c.fillStyle = '#0b1424'; c.beginPath(); c.moveTo(r * 1.15, -r * 0.3); c.lineTo(r * 1.5, -r * 0.5); c.lineTo(r * 1.5, r * 0.5); c.lineTo(r * 1.15, r * 0.3); c.closePath(); c.fill();
    c.fillStyle = '#0b1424'; c.beginPath(); c.moveTo(-r * 0.8, -r * 0.42); c.lineTo(-r * 0.6, -r * 0.1); c.lineTo(-r * 0.5, -r * 0.42); c.closePath(); c.fill();
  } else if (j.kind === 2) { // dead satellite
    c.fillStyle = '#8a6a2f'; rr(c, -r * 0.6, -r * 0.6, r * 1.2, r * 1.2, r * 0.18); c.fill(); c.stroke();
    c.fillStyle = metal; c.fillRect(-r * 0.3, -r * 0.3, r * 0.6, r * 0.6);
    c.strokeStyle = '#9fb0d4'; c.lineWidth = 2; c.beginPath(); c.moveTo(r * 0.6, 0); c.lineTo(r * 1.1, -r * 0.3); c.stroke();
    c.fillStyle = '#2c5fb0'; c.strokeStyle = '#0b1424'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * 0.6, -r * 0.15); c.lineTo(-r * 1.3, -r * 0.6); c.lineTo(-r * 1.25, -r * 0.05); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, -r * 0.7, r * 0.3, Math.PI, 0); c.stroke();
  } else { // bolt cluster
    c.strokeStyle = '#0b1424'; c.lineWidth = 2;
    for (const [dx, dy, k] of [[-0.6, -0.3, 0], [0.5, -0.4, 1], [0.1, 0.6, 2]] as const) {
      c.save(); c.translate(dx * r, dy * r); c.rotate(k * 1.2);
      c.fillStyle = k === 1 ? '#ffb547' : metal; c.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; i ? c.lineTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42) : c.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42); }
      c.closePath(); c.fill(); c.stroke(); c.restore();
    }
  }
  c.restore();
  // blinking light (unrotated)
  if (j.hitT === 0 && Math.floor(fx.time * 3 + j.id) % 2 === 0) { c.fillStyle = '#ff6b6b'; c.beginPath(); c.arc(x + r * 0.2, y - r * 0.9, 2.2, 0, 6.283); c.fill(); }
}

/* ---------- HUD (css px) ---------- */
function drawHud(c: CanvasRenderingContext2D, s: GameState, v: View, fx: Fx, best: number) {
  c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  const narrow = v.narrow, pad = narrow ? 10 : 16;
  const font = (px: number, wt = 700) => `${wt} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  c.textBaseline = 'alphabetic';
  // left panel
  const pw = narrow ? 138 : 176, ph = narrow ? 62 : 76;
  c.fillStyle = 'rgba(8,16,32,.62)'; rr(c, pad, pad, pw, ph, 12); c.fill();
  c.strokeStyle = 'rgba(124,150,204,.28)'; c.lineWidth = 1; c.stroke();
  c.textAlign = 'left';
  c.fillStyle = '#9fb0d4'; c.font = font(narrow ? 10 : 11, 700); c.fillText('SCORE', pad + 12, pad + (narrow ? 17 : 20));
  c.fillStyle = '#ffffff'; c.font = font(narrow ? 24 : 30, 800); c.fillText(String(s.score), pad + 12, pad + (narrow ? 43 : 52));
  c.fillStyle = '#9fb0d4'; c.font = font(narrow ? 11 : 12, 600); c.fillText(`Orbit ${s.orbit}`, pad + 12, pad + (narrow ? 57 : 69));
  if (best > 0) { c.textAlign = 'right'; c.fillStyle = '#7f90b6'; c.fillText(`Best ${best}`, pad + pw - 12, pad + (narrow ? 57 : 69)); c.textAlign = 'left'; }
  // shields
  const sx0 = pad + pw + 10, sy0 = pad + 4;
  for (let i = 0; i < MAX_SHIELDS; i++) {
    const frac = Math.max(0, Math.min(1, s.shields - i));
    const x = sx0 + i * (narrow ? 22 : 26), y = sy0, w = narrow ? 18 : 21, h = narrow ? 22 : 26;
    c.save(); c.translate(x, y);
    const path = () => { c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w, h * 0.18); c.lineTo(w, h * 0.55); c.quadraticCurveTo(w, h * 0.85, w / 2, h); c.quadraticCurveTo(0, h * 0.85, 0, h * 0.55); c.lineTo(0, h * 0.18); c.closePath(); };
    path(); c.fillStyle = 'rgba(8,16,32,.62)'; c.fill();
    if (frac > 0) {
      c.save(); path(); c.clip();
      const flash = s.shields <= 1 && !fx.reduced && Math.floor(fx.time * 4) % 2 === 0;
      c.fillStyle = flash ? '#e5636b' : '#7cc4ff'; c.fillRect(0, h * (1 - frac), w, h * frac); c.restore();
    }
    path(); c.strokeStyle = frac > 0 ? '#cfe8ff' : 'rgba(124,150,204,.5)'; c.lineWidth = 1.6; c.stroke();
    c.restore();
  }
  // combo
  const cx = v.w / 2;
  if (s.combo >= 3) {
    const pop = fx.reduced ? 0 : fx.comboPop;
    const fsz = (narrow ? 15 : 18) + pop * 6;
    c.textAlign = 'center';
    const label = `${s.combo} in a row`;
    c.font = font(fsz, 800);
    const tw = c.measureText(label).width + (s.mult > 1 ? 70 : 28);
    const by = narrow ? pad + ph + 8 : pad;
    c.fillStyle = 'rgba(8,16,32,.62)'; rr(c, cx - tw / 2, by, tw, narrow ? 34 : 38, 17); c.fill();
    c.strokeStyle = s.mult > 1 ? '#ffb547' : 'rgba(124,150,204,.28)'; c.lineWidth = 1.4; c.stroke();
    c.fillStyle = '#ffffff'; c.fillText(label, cx - (s.mult > 1 ? 18 : 0), by + (narrow ? 23 : 25));
    if (s.mult > 1) { c.fillStyle = '#ffb547'; c.font = font(fsz + 2, 800); c.fillText(`x${s.mult}`, cx + tw / 2 - 24, by + (narrow ? 23 : 25)); }
    if (s.status !== 'ok' && s.combo > 0) { // grace bar
      const k = Math.max(0, 1 - s.comboGap / 1.3);
      c.fillStyle = 'rgba(255,181,71,.9)'; c.fillRect(cx - tw / 2 + 14, by + (narrow ? 29 : 32), (tw - 28) * k, 2.5);
    }
    c.textAlign = 'left';
  }
  // hint pill
  if (s.hint) {
    const h = s.hint, a = Math.min(1, h.t / 0.2, (h.dur - h.t) / 0.4);
    c.font = font(narrow ? 14 : 17, 700);
    const tw = Math.min(v.w - 24, c.measureText(h.text).width + 36);
    const hy = (narrow ? pad + ph + 8 + (s.combo >= 3 ? 42 : 0) : pad + 56) + (1 - a) * -8;
    c.globalAlpha = Math.max(0, a);
    c.fillStyle = 'rgba(255,181,71,.96)'; rr(c, cx - tw / 2, hy, tw, narrow ? 34 : 40, 20); c.fill();
    c.fillStyle = '#16213a'; c.textAlign = 'center'; c.fillText(h.text, cx, hy + (narrow ? 22 : 26), tw - 20);
    c.globalAlpha = 1; c.textAlign = 'left';
  }
  // orbit banner
  if (fx.banner > 0) {
    const a = Math.min(1, fx.banner * 2.4) * Math.min(1, (1 - (1 - fx.banner)) * 1.6);
    c.globalAlpha = Math.max(0, Math.min(1, a));
    c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.font = font(narrow ? 30 : 42, 800);
    c.fillText(fx.bannerText, cx, v.h * 0.4 - (1 - fx.banner) * 20);
    c.font = font(narrow ? 13 : 16, 600); c.fillStyle = '#cfe0ff'; c.fillText('Faster now', cx, v.h * 0.4 + 24 - (1 - fx.banner) * 20);
    c.globalAlpha = 1; c.textAlign = 'left';
  }
  if (fx.hitFlash > 0) {
    const g = c.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.3, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    g.addColorStop(0, 'rgba(229,99,107,0)'); g.addColorStop(1, `rgba(229,99,107,${0.5 * fx.hitFlash})`);
    c.fillStyle = g; c.fillRect(0, 0, v.w, v.h);
  }
}

/* ---------- frame ---------- */
export function render(c: CanvasRenderingContext2D, s: GameState, v: View, fx: Fx, climbing: boolean, best: number, hud = true) {
  c.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, 0, 0);
  let ox = 0, oy = 0;
  if (fx.shake > 0 && !fx.reduced) { ox = (Math.random() - 0.5) * 16 * fx.shake; oy = (Math.random() - 0.5) * 12 * fx.shake; }
  c.translate(ox, oy);
  drawSky(c, s, v, fx);
  drawTerrain(c, s, v, fx);
  if (fx.quality >= 2) { // faint high wisps for parallax depth
    c.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 7; i++) {
      const wx = ((i * 331 - s.dist * 0.5) % (v.vw + 300) + (v.vw + 300)) % (v.vw + 300) - 150;
      c.beginPath(); c.ellipse(wx, v.gy0 - 22 - hash(i) * 40, 70 + hash(i + 3) * 60, 5, 0, 0, 6.283); c.fill();
    }
  }
  drawClouds(c, s, v, fx);
  drawZoneLabels(c, s, v);
  drawBeam(c, s, v, fx);
  for (const j of s.junk) {
    const x = v.satX + (j.x - s.dist);
    if (x < -60 || x > v.vw + 60) continue;
    drawJunk(c, j, x, yOf(v, j.a), fx);
  }
  drawSatellite(c, s, v, fx, climbing && !s.easy);
  drawOrbs(c, s, v, fx);
  // particles
  c.save();
  if (fx.quality === 3) c.globalCompositeOperation = 'lighter';
  for (const p of fx.particles) {
    const k = p.life / p.max;
    if (p.kind === 'debris') {
      c.globalCompositeOperation = 'source-over'; c.fillStyle = p.color; c.globalAlpha = k;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); c.restore();
    } else {
      c.globalAlpha = k * (p.kind === 'smoke' ? 0.5 : 1);
      c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (p.kind === 'smoke' ? 1.6 - k * 0.6 : k + 0.3), 0, 6.283); c.fill();
    }
  }
  c.restore();
  c.globalAlpha = 1;
  if (hud) drawHud(c, s, v, fx, best);
}

export function eyeColor(id: SensorId) { return SENSORS[id].color; }
