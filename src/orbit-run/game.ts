/**
 * Orbit Run: pure, deterministic game logic. No DOM, no Date, no Math.random.
 * World x is "distance flown" in world units. The satellite is always at x = dist.
 * Altitude `a` is 0 (bottom of the band) to 1 (top). Height of the band is BAND units.
 */
import { DATA_ORDER, SENSORS, ZONES, CLOUD_HINT, NIGHT_HINT, EDGE_HINT_TOP, EDGE_HINT_BOTTOM, SAVE_KEY } from './content';
import type { DataKind, SensorId, ZoneId } from './content';

export const BASE_SPEED = 200;      // world units per second at the start
export const ORBIT_LEN = 6400;      // world units per orbit (about 30 s at the start)
export const RAMP_PER_ORBIT = 0.1;  // speed rises 10% of base per orbit (smooth)
export const MAX_SPEED_MULT = 2.1;
export const BAND = 290;            // altitude band height in world units
export const SAT_R = 11;            // satellite hit radius (sprite is much larger: forgiving)
export const JUNK_HIT = 0.72;       // junk hit radius = drawn radius * this
export const MAX_SHIELDS = 3;
export const EDGE_COST = 0.25;      // shield lost per edge touch (top or bottom), at full difficulty
export const EDGE_CD = 0.9;         // seconds between edge costs while pinned on an edge
export const POWER_GAIN = 0.1;      // power per second while collecting
export const POWER_DRAIN = 0.18;    // power per second with the wrong eye (when the right eye would work), at full difficulty
export const ZONE_GRACE = 0.6;      // seconds after a zone starts before a wrong eye drains power, at full difficulty
export const RAMP_ORBITS = 5;       // difficulty climbs from 0 to 1 over this many orbits (about 2.5 minutes)
export const BOOST_TIME = 8;        // seconds of double points from a data boost
export const PICKUP_R = 24;         // generous pick-up radius for power-ups
/**
 * Difficulty 0 (gentle start) to 1 (full). Orbit 1 is a warm-up: slow, single junk, soft penalties.
 * Everything that gets harder reads from this one curve.
 */
export const difficultyAt = (dist: number) => Math.min(1, Math.max(0, dist / (ORBIT_LEN * RAMP_ORBITS)));
const lerpD = (a: number, b: number, d: number) => a + (b - a) * d;
export const drainAt = (d: number) => lerpD(0.07, POWER_DRAIN, d);
export const graceAt = (d: number) => lerpD(1.4, ZONE_GRACE, d);
export const edgeCostAt = (d: number) => lerpD(0.18, EDGE_COST, d);
export const GEN_AHEAD = 1700;
export const COLLECT_RATE = 4.5;    // data points per second when matched
export const COMBO_GRACE = 1.3;     // seconds without collecting before the combo resets
export const DT = 1 / 60;

export type Status = 'ok' | 'wrong' | 'cloud' | 'night';
export type EndReason = 'shields' | 'power' | null;

export interface Segment { id: number; zone: ZoneId; x0: number; x1: number; hinted: boolean; wrongT: number }
export interface Junk { id: number; x: number; a: number; r: number; vy: number; kind: number; rot: number; spin: number; hitT: number; wall?: boolean }
export interface Cloud { id: number; x0: number; x1: number; hinted: boolean; seed: number }
export interface Hint { text: string; t: number; dur: number; id: number }
export type PowerKind = 'repair' | 'solar' | 'boost';
export interface PowerUp { id: number; x: number; a: number; kind: PowerKind; got: number }

export type GameEvent =
  | { type: 'collect'; kind: DataKind; mult: number; combo: number }
  | { type: 'combo'; mult: number }
  | { type: 'hit'; junkId: number }
  | { type: 'edge'; top: boolean }
  | { type: 'drain' }
  | { type: 'power'; kind: PowerKind }
  | { type: 'orbit'; orbit: number }
  | { type: 'switch'; sensor: SensorId }
  | { type: 'hint' }
  | { type: 'over' };

export interface GameState {
  rng: number;
  easy: boolean;
  t: number;
  dist: number;
  speed: number;
  orbit: number;            // 1-based orbit number
  a: number;
  v: number;
  climb: boolean;
  sensor: SensorId;
  shields: number;
  power: number;
  draining: boolean;
  boost: number;
  powerUps: PowerUp[];
  nextPowerX: number;
  pickups: number;
  endReason: EndReason;
  edgeHinted: boolean;
  invuln: number;
  edgeCd: number;
  combo: number;
  mult: number;
  comboGap: number;
  collectAcc: number;
  score: number;
  data: Record<DataKind, number>;
  junkHits: number;
  segments: Segment[];
  junk: Junk[];
  clouds: Cloud[];
  nextZoneX: number;
  nextJunkX: number;
  nextCloudX: number;
  lastJunkA: number;
  lastGapA: number;
  nextId: number;
  nightOrbitHinted: number; // orbit index of the last night we showed a hint for (-1 none)
  cloudHintCount: number;
  nightHintCount: number;
  hint: Hint | null;
  status: Status;
  events: GameEvent[];
  over: boolean;
}

/* ---------- RNG ---------- */
export function rnd(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const range = (s: GameState, a: number, b: number) => a + (b - a) * rnd(s);

/* ---------- Pure helpers ---------- */
/** Speed at a world distance, with a smooth ramp (about +10% of base per orbit). */
export function speedAt(dist: number): number {
  const m = Math.min(MAX_SPEED_MULT, 1 + (RAMP_PER_ORBIT * Math.max(0, dist)) / ORBIT_LEN);
  return BASE_SPEED * m;
}
const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** 0 = day, 1 = night, smooth across a dusk/dawn edge. The first night starts well into orbit 1. */
export function nightFactorAt(x: number): number {
  const p = (((x / ORBIT_LEN) % 1) + 1) % 1;
  return smooth(0.56, 0.6, p) * (1 - smooth(0.8, 0.84, p));
}
export const isNightAt = (x: number) => nightFactorAt(x) > 0.5;

export function blockedBy(sensor: SensorId, cloudy: boolean, night: boolean): 'cloud' | 'night' | null {
  const d = SENSORS[sensor];
  if (cloudy && d.blockedByCloud) return 'cloud';
  if (night && d.blockedByNight) return 'night';
  return null;
}
/** The whole collect matrix in one pure function. */
export function sensorStatus(sensor: SensorId, zone: ZoneId, cloudy: boolean, night: boolean): Status {
  const b = blockedBy(sensor, cloudy, night);
  if (b) return b;
  return ZONES[zone].sensor === sensor ? 'ok' : 'wrong';
}
export const multFor = (combo: number) => (combo >= 45 ? 4 : combo >= 25 ? 3 : combo >= 10 ? 2 : 1);

export function segmentAt(s: GameState, x: number): Segment {
  for (const g of s.segments) if (x >= g.x0 && x < g.x1) return g;
  return s.segments[s.segments.length - 1];
}
export function cloudAt(s: GameState, x: number): Cloud | null {
  for (const c of s.clouds) if (x >= c.x0 + 20 && x <= c.x1 - 20) return c;
  return null;
}

/* ---------- Creation ---------- */
export function createGame(seed = 1, easy = false): GameState {
  const s: GameState = {
    rng: seed | 0, easy, t: 0, dist: 0, speed: BASE_SPEED, orbit: 1, a: 0.5, v: 0, climb: false,
    sensor: 'heat', shields: MAX_SHIELDS, power: 1, draining: false, boost: 0, powerUps: [], nextPowerX: 2600, pickups: 0, endReason: null, edgeHinted: false, invuln: 0, edgeCd: 0, combo: 0, mult: 1, comboGap: 0, collectAcc: 0, score: 0,
    data: { temperature: 0, forest: 0, sea: 0, ice: 0 }, junkHits: 0,
    segments: [], junk: [], clouds: [], nextZoneX: -900, nextJunkX: 1500, nextCloudX: 2300, lastJunkA: 0.5, lastGapA: 0.5, nextId: 1,
    nightOrbitHinted: -1, cloudHintCount: 0, nightHintCount: 0, hint: null, status: 'wrong', events: [], over: false,
  };
  // The first stretch is a long warm ocean so the player can settle in and see the beam work.
  s.segments.push({ id: s.nextId++, zone: 'ocean', x0: -900, x1: 1500, hinted: false, wrongT: 0 });
  s.nextZoneX = 1500;
  ensureContent(s);
  s.status = currentStatus(s);
  return s;
}

/* ---------- Content generation (always the same distance ahead, so it is device independent) ---------- */
function pickZone(s: GameState): ZoneId {
  const last = s.segments[s.segments.length - 1].zone;
  const prev = s.segments.length > 1 ? s.segments[s.segments.length - 2].zone : null;
  let opts = ZONES[last].next.filter((z) => z !== prev);
  if (!opts.length) opts = ZONES[last].next;
  return opts[Math.floor(rnd(s) * opts.length)];
}
function ensureContent(s: GameState): void {
  const horizon = s.dist + GEN_AHEAD;
  while (s.nextZoneX < horizon) {
    const zone = pickZone(s);
    const len = range(s, 4, 8) * speedAt(s.nextZoneX);
    s.segments.push({ id: s.nextId++, zone, x0: s.nextZoneX, x1: s.nextZoneX + len, hinted: false, wrongT: 0 });
    s.nextZoneX += len;
  }
  while (s.nextCloudX < horizon) {
    const len = range(s, 420, 720);
    s.clouds.push({ id: s.nextId++, x0: s.nextCloudX, x1: s.nextCloudX + len, hinted: false, seed: Math.floor(rnd(s) * 1e6) });
    s.nextCloudX += len + range(s, 800, 1500);
  }
  while (s.nextJunkX < horizon) spawnJunk(s);
  while (s.nextPowerX < horizon - 200) spawnPower(s);
}
function addJunk(s: GameState, x: number, a: number, wall = false, drift = 0.12): void {
  const r = wall ? range(s, 18, 23) : range(s, 17, 27);
  s.junk.push({ id: s.nextId++, x, a, r, vy: wall ? 0 : (rnd(s) - 0.5) * drift, kind: Math.floor(rnd(s) * 4), rot: rnd(s) * 6.28, spin: (rnd(s) - 0.5) * 2.2, hitT: 0, wall });
}
/** Gap width (in band fractions, between junk centres) for a wall: very wide at first, tighter later. */
export const wallGap = (d: number) => lerpD(0.56, 0.34, d);
/**
 * A wall of junk across the whole band, top to bottom, with one gap. The gap jumps away from the last
 * one, so the player has to move, and hugging the top or bottom edge is never safe.
 */
function addWall(s: GameState, x: number, d: number): void {
  const gap = wallGap(d);
  const lo = 0.08 + gap / 2, hi = 0.92 - gap / 2;
  let gc = lo + rnd(s) * (hi - lo);
  const jump = lerpD(0.15, 0.3, d); // early gaps sit close to the last one; later they jump further
  if (Math.abs(gc - s.lastGapA) < jump && d > 0.3) gc = s.lastGapA > 0.5 ? lo + rnd(s) * 0.15 : hi - rnd(s) * 0.15;
  if (d <= 0.3) gc = s.lastGapA + Math.max(-0.25, Math.min(0.25, gc - s.lastGapA));
  gc = Math.min(hi, Math.max(lo, gc));
  const step = 0.15;
  for (let a = gc + gap / 2; a <= 1.02; a += step) addJunk(s, x, Math.min(0.97, a), true);
  for (let a = gc - gap / 2; a >= -0.02; a -= step) addJunk(s, x, Math.max(0.03, a), true);
  s.lastGapA = gc; s.lastJunkA = gc;
}
/**
 * Junk patterns by difficulty:
 * - warm-up (first half orbit): singles only, far apart, slow drift, never hugging an edge;
 * - from about d 0.1: walls with a very wide gap; from d 0.2: pairs; edge-huggers and faster drift grow with d.
 */
function spawnJunk(s: GameState): void {
  const x = s.nextJunkX;
  const d = difficultyAt(x);
  const roll = rnd(s);
  const wallChance = d < 0.1 ? 0 : lerpD(0.25, 0.55, d);
  const pairChance = d < 0.2 ? 0 : lerpD(0.1, 0.22, d);
  const drift = lerpD(0.06, 0.2, d);
  let gapTime: number;
  if (roll < wallChance) {
    addWall(s, x, d);
    gapTime = lerpD(3.2, 1.8, d) + rnd(s) * 0.6;
  } else if (roll < wallChance + pairChance) {
    // A pair with a clear gap: always passable.
    const gap = lerpD(0.56, 0.44, d) + rnd(s) * 0.08;
    const low = 0.03 + rnd(s) * (0.94 - gap - 0.03);
    addJunk(s, x, low, false, drift);
    addJunk(s, x + 36, low + gap, false, drift);
    s.lastJunkA = low + gap / 2;
    gapTime = lerpD(2.4, 1.3, d) + rnd(s) * 0.7;
  } else {
    // Singles. Later on, some sit right by an edge so the top and bottom are not hiding places.
    let a = 0.1 + rnd(s) * 0.8;
    if (Math.abs(a - s.lastJunkA) < 0.2) a = 0.1 + rnd(s) * 0.8;
    if (rnd(s) < lerpD(0.1, 0.32, d)) a = rnd(s) < 0.5 ? 0.04 + rnd(s) * 0.08 : 0.88 + rnd(s) * 0.08;
    addJunk(s, x, a, false, drift);
    s.lastJunkA = a;
    gapTime = lerpD(2.6, 1.1, d) + rnd(s) * 0.8;
  }
  s.nextJunkX += gapTime * speedAt(x);
}
/** Power-ups every 9 to 14 s, placed between obstacles, in the middle of the band where they are easy to reach. */
function spawnPower(s: GameState): void {
  const x = s.nextPowerX;
  const kinds: PowerKind[] = ['solar', 'repair', 'boost'];
  const kind = kinds[Math.floor(rnd(s) * kinds.length)];
  // Keep clear of junk columns at nearly the same x.
  const clash = s.junk.some((j) => Math.abs(j.x - x) < 120);
  const px = clash ? x + 160 : x;
  s.powerUps.push({ id: s.nextId++, x: px, a: 0.25 + rnd(s) * 0.5, kind, got: 0 });
  s.nextPowerX = px + range(s, 9, 14) * speedAt(px);
}

/* ---------- Status ---------- */
export function currentStatus(s: GameState): Status {
  const seg = segmentAt(s, s.dist);
  return sensorStatus(s.sensor, seg.zone, !!cloudAt(s, s.dist), isNightAt(s.dist));
}

export function setSensor(s: GameState, id: SensorId): void {
  if (s.over || s.sensor === id) return;
  s.sensor = id;
  s.events.push({ type: 'switch', sensor: id });
  s.status = currentStatus(s);
}

function showHint(s: GameState, text: string, dur = 3.1): void {
  s.hint = { text, t: 0, dur, id: s.nextId++ };
  s.events.push({ type: 'hint' });
}

/* ---------- Easy mode autopilot ---------- */
/** Choose the altitude that dodges upcoming junk (accounts for travel time and drift). */
export function autoTarget(s: GameState): number {
  const look = Math.max(420, s.speed * 2.4);
  const near = s.junk.filter((j) => j.hitT === 0 && j.x > s.dist - 40 && j.x < s.dist + look).sort((p, q) => p.x - q.x);
  if (!near.length) return s.a + (0.5 - s.a) * 0.02; // drift gently to mid band
  // Plan for the next obstacle (a wall, pair or single) first; later ones only nudge the choice.
  const firstX = near[0].x;
  let best = s.a, bestCost = Infinity;
  for (let c = 0.06; c <= 0.941; c += 0.01) {
    let cost = 0.5 * Math.abs(c - s.a) + 0.1 * Math.abs(c - 0.5);
    for (const j of near) {
      const w = j.x - firstX < 80 ? 1 : 0.25;
      const t = Math.max(0, (j.x - s.dist) / s.speed);
      const reach = Math.min(Math.abs(c - s.a), (c > s.a ? 0.7 : 0.42) * t);
      const alt = s.a + Math.sign(c - s.a) * reach;
      const ja = Math.min(0.97, Math.max(0.03, j.a + j.vy * t));
      const need = SAT_R + j.r * JUNK_HIT + 14;
      const clear = Math.abs(alt - ja) * BAND - need;
      if (clear < 0) cost += w * (60 + -clear * 0.6);
      else if (clear < 20) cost += w * (20 - clear) * 0.3;
    }
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  return best;
}

/* ---------- Step ---------- */
const UP = 4.4, DOWN = 2.1, V_UP = 0.88, V_DN = 0.52, REVERSE_BRAKE = 8, KICK = 0.36, DRAG = 0.5;

export function step(s: GameState, dt: number, climb: boolean): void {
  if (s.over) return;
  s.t += dt;
  const intro = 0.55 + 0.45 * smooth(0, 1.6, s.t);
  s.speed = speedAt(s.dist) * intro;
  s.dist += s.speed * dt;
  const orbit = Math.floor(s.dist / ORBIT_LEN) + 1;
  if (orbit !== s.orbit) { s.orbit = orbit; s.events.push({ type: 'orbit', orbit: orbit - 1 }); }
  ensureContent(s);

  // Altitude
  if (s.easy) {
    const target = autoTarget(s);
    const vt = Math.max(-V_DN, Math.min(V_UP, (target - s.a) * 3.4));
    const dv = Math.max(-7 * dt, Math.min(7 * dt, vt - s.v));
    s.v += dv;
    s.a += s.v * dt;
    s.a = Math.max(0.04, Math.min(0.96, s.a));
    s.climb = false;
  } else {
    if (climb && !s.climb) s.v = Math.max(s.v, KICK);
    s.climb = climb;
    const acc = climb ? (s.v < 0 ? UP + REVERSE_BRAKE : UP) : s.v > 0 ? -(DOWN + REVERSE_BRAKE * 0.5) : -DOWN;
    s.v += acc * dt;
    s.v -= s.v * DRAG * dt;
    s.v = Math.max(-V_DN, Math.min(V_UP, s.v));
    s.a += s.v * dt;
    s.edgeCd = Math.max(0, s.edgeCd - dt);
    if (s.a >= 1 || s.a <= 0) {
      const top = s.a >= 1;
      const speedIn = Math.abs(s.v);
      s.a = top ? 1 : 0;
      // Any touch of the top or bottom costs a little shield, so sitting on an edge is never safe.
      if (s.edgeCd === 0 && s.t > 3) {
        s.shields = Math.max(0, s.shields - edgeCostAt(difficultyAt(s.dist)));
        s.edgeCd = EDGE_CD;
        s.events.push({ type: 'edge', top });
        if (!s.edgeHinted) { s.edgeHinted = true; showHint(s, top ? EDGE_HINT_TOP : EDGE_HINT_BOTTOM, 3); }
      }
      s.v = top ? -Math.max(0.3, speedIn * 0.45) : Math.max(0.3, speedIn * 0.45); // bounce back into the band
    }
  }

  // Junk
  for (const j of s.junk) {
    j.rot += j.spin * dt;
    if (j.hitT > 0) { j.hitT += dt; continue; }
    j.a += j.vy * dt;
    if (j.a < 0.05) { j.a = 0.05; j.vy = Math.abs(j.vy); }
    if (j.a > 0.95) { j.a = 0.95; j.vy = -Math.abs(j.vy); }
  }
  s.junk = s.junk.filter((j) => j.x > s.dist - 300);
  s.clouds = s.clouds.filter((c) => c.x1 > s.dist - 300);
  s.segments = s.segments.filter((g, i, arr) => g.x1 > s.dist - 300 || i === arr.length - 1);

  s.invuln = Math.max(0, s.invuln - dt);
  if (s.invuln === 0) {
    for (const j of s.junk) {
      if (j.hitT > 0) continue;
      const dx = j.x - s.dist, dy = (j.a - s.a) * BAND;
      const rr = SAT_R + j.r * JUNK_HIT;
      if (dx * dx + dy * dy < rr * rr) {
        j.hitT = 0.001;
        s.shields = Math.max(0, s.shields - 1);
        s.junkHits++;
        s.invuln = 1.7;
        s.combo = 0; s.mult = 1; s.comboGap = 0;
        s.events.push({ type: 'hit', junkId: j.id });
        break;
      }
    }
  }

  // Power-ups: fly into them
  s.boost = Math.max(0, s.boost - dt);
  for (const p of s.powerUps) {
    if (p.got > 0) { p.got += dt; continue; }
    const dx = p.x - s.dist, dy = (p.a - s.a) * BAND;
    if (dx * dx + dy * dy < (SAT_R + PICKUP_R) ** 2) {
      p.got = 0.001; s.pickups++;
      if (p.kind === 'repair') s.shields = Math.min(MAX_SHIELDS, Math.floor(s.shields + 1e-6) + 1);
      else if (p.kind === 'solar') s.power = 1;
      else s.boost = BOOST_TIME;
      s.events.push({ type: 'power', kind: p.kind });
    }
  }
  s.powerUps = s.powerUps.filter((p) => p.x > s.dist - 300 && p.got < 0.8);

  // Sensor, hints, collecting
  const seg = segmentAt(s, s.dist);
  const cloud = cloudAt(s, s.dist);
  const night = isNightAt(s.dist);
  const status = sensorStatus(s.sensor, seg.zone, !!cloud, night);
  s.status = status;
  if (status === 'wrong') {
    seg.wrongT += dt;
    if (seg.wrongT > 0.9 && !seg.hinted) { seg.hinted = true; showHint(s, ZONES[seg.zone].hint); }
  }
  if (cloud && !cloud.hinted && (status === 'cloud' || s.cloudHintCount === 0)) {
    cloud.hinted = true; s.cloudHintCount++; showHint(s, CLOUD_HINT, 3.4);
  }
  const nightIdx = Math.floor(s.dist / ORBIT_LEN);
  if (night && s.nightOrbitHinted !== nightIdx && (status === 'night' || s.nightHintCount === 0)) {
    s.nightOrbitHinted = nightIdx; s.nightHintCount++; showHint(s, NIGHT_HINT, 3.4);
  }
  if (s.hint) { s.hint.t += dt; if (s.hint.t > s.hint.dur) s.hint = null; }

  // Power: collecting charges it. A wrong eye drains it, but only when the right eye would work here
  // (under cloud or at night there may be nothing to collect, and that is not the player's fault).
  const rightEye = ZONES[seg.zone].sensor;
  const avoidable = status === 'wrong' && sensorStatus(rightEye, seg.zone, !!cloud, night) === 'ok';
  const inZone = (s.dist - seg.x0) / Math.max(1, s.speed);
  const wasDraining = s.draining;
  const dNow = difficultyAt(s.dist);
  s.draining = avoidable && inZone > graceAt(dNow) && s.t > 1.5;
  if (s.draining) {
    s.power = Math.max(0, s.power - drainAt(dNow) * dt);
    if (!wasDraining) s.events.push({ type: 'drain' });
    s.combo = 0; s.mult = 1; s.comboGap = 0;
  } else if (status === 'ok') s.power = Math.min(1, s.power + POWER_GAIN * dt);

  if (status === 'ok') {
    s.comboGap = 0;
    s.collectAcc += dt * COLLECT_RATE;
    while (s.collectAcc >= 1) {
      s.collectAcc -= 1;
      const kind = SENSORS[s.sensor].data;
      s.data[kind]++;
      s.combo++;
      const m = multFor(s.combo);
      if (m > s.mult) { s.mult = m; s.events.push({ type: 'combo', mult: m }); }
      s.score += s.mult * (s.boost > 0 ? 2 : 1);
      s.events.push({ type: 'collect', kind, mult: s.mult, combo: s.combo });
    }
  } else {
    s.collectAcc = 0;
    s.comboGap += dt;
    if (s.comboGap > COMBO_GRACE && s.combo > 0) { s.combo = 0; s.mult = 1; }
  }

  if (s.shields <= 0.001) { s.shields = 0; s.over = true; s.endReason = 'shields'; s.events.push({ type: 'over' }); }
  else if (s.power <= 0) { s.power = 0; s.over = true; s.endReason = 'power'; s.events.push({ type: 'over' }); }
}

/* ---------- Report + save ---------- */
/** soundV 2: sound defaults to on (music added). Older saves stored sound: false only because that was the default. */
export interface Save { v: 1; best: number; bestEasy: number; runs: number; sound: boolean; easy: boolean; soundV?: number }
export type StoreLike = Pick<Storage, 'getItem' | 'setItem'>;
export const defaultSave = (): Save => ({ v: 1, best: 0, bestEasy: 0, runs: 0, sound: true, easy: false, soundV: 2 });

export function loadSave(store: StoreLike | null | undefined): Save {
  try {
    const raw = store?.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const o = JSON.parse(raw) as Partial<Save>;
    const n = (x: unknown) => (typeof x === 'number' && isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    return { v: 1, best: n(o.best), bestEasy: n(o.bestEasy), runs: n(o.runs), sound: o.soundV === 2 ? o.sound === true : true, easy: o.easy === true, soundV: 2 };
  } catch { return defaultSave(); }
}
export function writeSave(store: StoreLike | null | undefined, save: Save): void {
  try { store?.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage blocked: fine */ }
}
/** Record a finished run. Returns the updated save and whether it is a new best (not on the first ever run of 0). */
export function recordRun(store: StoreLike | null | undefined, score: number, easy: boolean): { save: Save; isBest: boolean } {
  const save = loadSave(store);
  const prev = easy ? save.bestEasy : save.best;
  const isBest = score > prev;
  if (isBest) { if (easy) save.bestEasy = score; else save.best = score; }
  save.runs++;
  writeSave(store, save);
  return { save, isBest };
}
export const orbitsCompleted = (s: GameState) => s.orbit - 1;
export const totalData = (s: GameState) => DATA_ORDER.reduce((n, k) => n + s.data[k], 0);
