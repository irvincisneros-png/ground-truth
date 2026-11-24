import { describe, expect, it } from 'vitest';
import { SENSOR_ORDER, ZONES } from '../src/orbit-run/content';
import type { ZoneId } from '../src/orbit-run/content';
import {
  BAND, BASE_SPEED, DT, MAX_SHIELDS, ORBIT_LEN, createGame, currentStatus, isNightAt, loadSave, nightFactorAt, recordRun,
  sensorStatus, setSensor, speedAt, step, totalData,
} from '../src/orbit-run/game';
import type { GameState } from '../src/orbit-run/game';
import { SAVE_KEY } from '../src/orbit-run/content';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
const run = (s: GameState, secs: number, climb: boolean | ((s: GameState) => boolean) = false) => {
  for (let i = 0; i < secs / DT && !s.over; i++) step(s, DT, typeof climb === 'function' ? climb(s) : climb);
};
const clearJunk = (s: GameState) => { s.junk = []; s.nextJunkX = 1e9; };

describe('sensor x zone x condition matrix', () => {
  const zones = Object.keys(ZONES) as ZoneId[];
  it('matched sensor collects in clear day', () => {
    for (const z of zones) expect(sensorStatus(ZONES[z].sensor, z, false, false)).toBe('ok');
  });
  it('wrong sensor never collects and is reported as wrong', () => {
    for (const z of zones) for (const sn of SENSOR_ORDER) if (sn !== ZONES[z].sensor) expect(sensorStatus(sn, z, false, false)).toBe('wrong');
  });
  it('cloud blocks heat and colour; radar and microwave see through', () => {
    expect(sensorStatus('heat', 'ocean', true, false)).toBe('cloud');
    expect(sensorStatus('heat', 'reef', true, false)).toBe('cloud');
    expect(sensorStatus('colour', 'forest', true, false)).toBe('cloud');
    expect(sensorStatus('radar', 'sea', true, false)).toBe('ok');
    expect(sensorStatus('microwave', 'ice', true, false)).toBe('ok');
  });
  it('night blocks only the colour camera (thermal infrared works at night)', () => {
    expect(sensorStatus('colour', 'forest', false, true)).toBe('night');
    expect(sensorStatus('heat', 'ocean', false, true)).toBe('ok');
    expect(sensorStatus('heat', 'reef', false, true)).toBe('ok');
    expect(sensorStatus('radar', 'sea', false, true)).toBe('ok');
    expect(sensorStatus('microwave', 'ice', false, true)).toBe('ok');
  });
  it('cloud and night together: only radar and microwave work', () => {
    expect(sensorStatus('heat', 'ocean', true, true)).toBe('cloud');
    expect(sensorStatus('colour', 'forest', true, true)).toBe('cloud');
    expect(sensorStatus('radar', 'sea', true, true)).toBe('ok');
    expect(sensorStatus('microwave', 'ice', true, true)).toBe('ok');
  });
  it('the first night does not start for a while, and night has a smooth edge', () => {
    expect(isNightAt(0)).toBe(false);
    expect(isNightAt(ORBIT_LEN * 0.7)).toBe(true);
    expect(nightFactorAt(ORBIT_LEN * 0.58)).toBeGreaterThan(0);
    expect(nightFactorAt(ORBIT_LEN * 0.58)).toBeLessThan(1);
  });
});

describe('collecting in the live game', () => {
  it('collects with the right sensor over the opening ocean, nothing with the wrong one', () => {
    const a = createGame(7); setSensor(a, 'heat'); clearJunk(a); run(a, 4);
    expect(a.data.temperature).toBeGreaterThan(10);
    const b = createGame(7); setSensor(b, 'microwave'); clearJunk(b); run(b, 4);
    expect(totalData(b)).toBe(0);
    expect(b.score).toBe(0);
  });
  it('shows a wrong-sensor hint once per zone only', () => {
    const s = createGame(3); setSensor(s, 'microwave'); clearJunk(s);
    let hints = 0; const seen = new Set<string>();
    for (let i = 0; i < 6 / DT; i++) { step(s, DT, false); if (s.hint && !seen.has(String(s.hint.id))) { seen.add(String(s.hint.id)); hints++; } }
    expect(hints).toBe(1);
    expect(s.hint === null || s.hint.text.length > 0).toBe(true);
  });
  it('combo builds a multiplier and resets after a gap', () => {
    const s = createGame(5); clearJunk(s); run(s, 3.5);
    expect(s.combo).toBeGreaterThanOrEqual(10);
    expect(s.mult).toBeGreaterThanOrEqual(2);
    setSensor(s, 'radar'); run(s, 1.6);
    expect(s.combo).toBe(0);
    expect(s.mult).toBe(1);
  });
});

describe('shields and collisions', () => {
  it('a junk hit costs one shield and gives brief invulnerability', () => {
    const s = createGame(1); clearJunk(s);
    s.junk.push({ id: 900, x: s.dist + 5, a: s.a, r: 20, vy: 0, kind: 0, rot: 0, spin: 0, hitT: 0 });
    step(s, DT, false);
    expect(s.shields).toBe(MAX_SHIELDS - 1);
    expect(s.junkHits).toBe(1);
    s.junk.push({ id: 901, x: s.dist + 5, a: s.a, r: 20, vy: 0, kind: 0, rot: 0, spin: 0, hitT: 0 });
    step(s, DT, false);
    expect(s.shields).toBe(MAX_SHIELDS - 1); // invulnerable
  });
  it('junk far above the satellite is a miss', () => {
    const s = createGame(1); clearJunk(s); s.a = 0.1;
    s.junk.push({ id: 902, x: s.dist + 5, a: 0.9, r: 27, vy: 0, kind: 0, rot: 0, spin: 0, hitT: 0 });
    step(s, DT, false);
    expect(s.shields).toBe(MAX_SHIELDS);
  });
  it('three hits end the run', () => {
    const s = createGame(1); clearJunk(s);
    for (let i = 0; i < 3; i++) {
      s.invuln = 0;
      s.junk.push({ id: 910 + i, x: s.dist + 2, a: s.a, r: 20, vy: 0, kind: 0, rot: 0, spin: 0, hitT: 0 });
      step(s, DT, false);
    }
    expect(s.shields).toBe(0);
    expect(s.over).toBe(true);
    expect(s.events.some((e) => e.type === 'over')).toBe(true);
  });
  it('a hard edge hit nudges back and costs a little shield; no instant death', () => {
    const s = createGame(2); clearJunk(s);
    s.t = 10; s.a = 0.995; s.v = 0.85;
    step(s, DT, true);
    expect(s.shields).toBeCloseTo(MAX_SHIELDS - 0.25, 5);
    expect(s.v).toBeLessThan(0);
    expect(s.over).toBe(false);
  });
  it('a gentle drift against the edge is free', () => {
    const s = createGame(2); clearJunk(s);
    s.t = 10; s.a = 0.999; s.v = 0.2;
    step(s, DT, false);
    expect(s.shields).toBe(MAX_SHIELDS);
  });
  it('holding climb for long never ends the run by itself', () => {
    const s = createGame(2); clearJunk(s); run(s, 20, true);
    expect(s.over).toBe(false);
    expect(s.shields).toBeGreaterThan(2);
  });
});

describe('controls feel', () => {
  it('a tap lifts the satellite a visible amount and hold climbs the band in about a second or two', () => {
    const s = createGame(1); clearJunk(s); const a0 = s.a;
    let peak = 0;
    for (let i = 0; i < 40; i++) { step(s, DT, i < 6); peak = Math.max(peak, s.a - a0); }
    expect(peak * BAND).toBeGreaterThan(22);
    expect(peak * BAND).toBeLessThan(120);
    const h = createGame(1); clearJunk(h); h.a = 0.05; let t = 0;
    while (h.a < 0.95 && t < 5) { step(h, DT, true); t += DT; }
    expect(t).toBeGreaterThan(0.6); expect(t).toBeLessThan(2);
  });
});

describe('speed ramp', () => {
  it('speed rises smoothly with orbits and is capped', () => {
    expect(speedAt(0)).toBe(BASE_SPEED);
    let prev = 0;
    for (let d = 0; d < ORBIT_LEN * 12; d += 100) { const v = speedAt(d); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    expect(speedAt(ORBIT_LEN)).toBeGreaterThan(speedAt(0) * 1.05);
    expect(speedAt(ORBIT_LEN * 100)).toBeLessThanOrEqual(BASE_SPEED * 2.1 + 1e-9);
  });
  it('counts orbits and reports them', () => {
    const s = createGame(4); clearJunk(s); s.dist = ORBIT_LEN - 5; run(s, 0.5);
    expect(s.orbit).toBe(2);
    expect(s.events.some((e) => e.type === 'orbit')).toBe(true);
  });
});

describe('determinism and content', () => {
  it('same seed gives identical runs', () => {
    const a = createGame(42), b = createGame(42);
    run(a, 20, (s) => Math.sin(s.t) > 0); run(b, 20, (s) => Math.sin(s.t) > 0);
    expect(a.dist).toBe(b.dist); expect(a.score).toBe(b.score); expect(a.junk.length).toBe(b.junk.length); expect(a.shields).toBe(b.shields);
  });
  it('zones last 4 to 8 seconds, never repeat back to back, and always cover the satellite', () => {
    const s = createGame(9); clearJunk(s); run(s, 90);
    for (let i = 1; i < s.segments.length - 1; i++) {
      expect(s.segments[i].zone).not.toBe(s.segments[i - 1].zone);
      const secs = (s.segments[i].x1 - s.segments[i].x0) / speedAt(s.segments[i].x0);
      expect(secs).toBeGreaterThanOrEqual(3.99); expect(secs).toBeLessThanOrEqual(8.01);
    }
    expect(currentStatus(s)).toBeTypeOf('string');
  });
  it('first junk is not met for several seconds', () => {
    const s = createGame(11);
    expect(Math.min(...s.junk.map((j) => j.x))).toBeGreaterThan(1200);
  });
});

describe('easy mode auto-altitude', () => {
  it('dodges all junk across seeds for 2.5 minutes with no shield loss', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame(seed, true); setSensor(s, 'heat');
      run(s, 150, false);
      expect(s.junkHits, `seed ${seed}`).toBe(0);
      expect(s.shields).toBe(MAX_SHIELDS);
      expect(s.over).toBe(false);
    }
  });
  it('still lets the player switch sensors and collect', () => {
    const s = createGame(3, true); run(s, 4);
    expect(s.data.temperature).toBeGreaterThan(8);
  });
});

describe('save of the best score', () => {
  it('stores best per mode under the documented key and keeps the higher score', () => {
    const st = mem();
    expect(loadSave(st).best).toBe(0);
    expect(recordRun(st, 120, false).isBest).toBe(true);
    expect(recordRun(st, 90, false).isBest).toBe(false);
    expect(recordRun(st, 200, true).save.bestEasy).toBe(200);
    const sv = loadSave(st);
    expect(sv.best).toBe(120); expect(sv.bestEasy).toBe(200); expect(sv.runs).toBe(3);
    expect(st.m.has(SAVE_KEY)).toBe(true);
    expect(SAVE_KEY).toBe('ground-truth:orbit-run:v1');
  });
  it('survives corrupt or blocked storage', () => {
    const bad = { getItem: () => '{nope', setItem: () => { throw new Error('blocked'); } };
    expect(loadSave(bad).best).toBe(0);
    expect(() => recordRun(bad, 5, false)).not.toThrow();
    expect(loadSave(null).runs).toBe(0);
  });
});
