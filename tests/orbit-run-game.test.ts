import { describe, expect, it } from 'vitest';
import { SENSOR_ORDER, ZONES } from '../src/orbit-run/content';
import type { ZoneId } from '../src/orbit-run/content';
import {
  BAND, BASE_SPEED, DT, PICKUP_R, difficultyAt, drainAt, edgeCostAt, MAX_SHIELDS, ORBIT_LEN, createGame, currentStatus, isNightAt, loadSave, nightFactorAt, recordRun,
  segmentAt, sensorStatus, setSensor, speedAt, step, totalData, wallGap,
} from '../src/orbit-run/game';
import type { GameState } from '../src/orbit-run/game';
import { SAVE_KEY } from '../src/orbit-run/content';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
const run = (s: GameState, secs: number, climb: boolean | ((s: GameState) => boolean) = false) => {
  for (let i = 0; i < secs / DT && !s.over; i++) step(s, DT, typeof climb === 'function' ? climb(s) : climb);
};
const clearJunk = (s: GameState) => { s.junk = []; s.nextJunkX = 1e9; };
const hover = (s: GameState) => s.a < 0.5; // hold around the middle of the band
const rightEye = (s: GameState) => setSensor(s, ZONES[segmentAt(s, s.dist).zone].sensor);

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
    for (let i = 0; i < 6 / DT; i++) { step(s, DT, hover(s)); if (s.hint && !seen.has(String(s.hint.id))) { seen.add(String(s.hint.id)); hints++; } }
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
    expect(s.shields).toBeCloseTo(MAX_SHIELDS - edgeCostAt(difficultyAt(s.dist)), 5);
    expect(s.v).toBeLessThan(0);
    expect(s.over).toBe(false);
  });
  it('even a gentle touch of the edge costs a little shield', () => {
    const s = createGame(2); clearJunk(s);
    s.t = 10; s.a = 0.999; s.v = 0.2;
    step(s, DT, false);
    expect(s.shields).toBeCloseTo(MAX_SHIELDS - edgeCostAt(0), 3);
    expect(s.v).toBeLessThan(0);
  });
  it('sitting on the top edge is not safe: holding climb wears the shields away', () => {
    const s = createGame(2); clearJunk(s); s.powerUps = []; s.nextPowerX = 1e9; run(s, 30, (g) => { rightEye(g); return true; });
    expect(s.over).toBe(true);
    expect(s.endReason).toBe('shields');
  });
  it('sitting on the bottom edge is not safe either', () => {
    const s = createGame(2); clearJunk(s); s.powerUps = []; s.nextPowerX = 1e9; run(s, 30, (g) => { rightEye(g); return false; });
    expect(s.over).toBe(true);
  });
  it('flying in the middle of the band costs nothing', () => {
    const s = createGame(2); clearJunk(s);
    run(s, 20, (g) => { rightEye(g); return hover(g); });
    expect(s.shields).toBe(MAX_SHIELDS);
    expect(s.over).toBe(false);
  });
});

describe('power: the wrong eye costs you', () => {
  it('the wrong eye drains power and ends the run', () => {
    const s = createGame(6); clearJunk(s); setSensor(s, 'microwave'); s.powerUps = []; s.nextPowerX = 1e9;
    s.segments = [{ id: 1, zone: 'ocean', x0: -1000, x1: 1e7, hinted: true, wrongT: 0 }]; s.nextZoneX = 1e9;
    s.clouds = []; s.nextCloudX = 1e9;
    run(s, 6, hover);
    expect(s.power).toBeLessThan(0.8);
    expect(s.combo).toBe(0);
    run(s, 30, hover);
    expect(s.over).toBe(true);
    expect(s.endReason).toBe('power');
  });
  it('the right eye keeps power topped up', () => {
    const s = createGame(6); clearJunk(s);
    run(s, 60, (g) => { rightEye(g); return hover(g); });
    expect(s.over).toBe(false);
    expect(s.power).toBeGreaterThan(0.6);
  });
  it('no drain when the right eye could not work anyway (cloud over the warm sea)', () => {
    const s = createGame(6); clearJunk(s); setSensor(s, 'radar');
    s.clouds = [{ id: 1, x0: -1000, x1: 1e6, hinted: true, seed: 1 }]; s.nextCloudX = 1e9;
    s.segments = [{ id: 1, zone: 'ocean', x0: -1000, x1: 1e6, hinted: true, wrongT: 0 }]; s.nextZoneX = 1e9;
    run(s, 5, hover);
    expect(s.power).toBe(1);
  });
  it('a short grace after the ground changes gives time to switch', () => {
    const s = createGame(6); clearJunk(s); setSensor(s, 'microwave');
    run(s, 0.4, hover);
    expect(s.power).toBe(1);
  });
});

describe('difficulty ramps from gentle to hard', () => {
  it('difficulty starts at 0 and reaches 1 after a few orbits', () => {
    expect(difficultyAt(0)).toBe(0);
    expect(difficultyAt(ORBIT_LEN * 2)).toBeGreaterThan(0.3);
    expect(difficultyAt(ORBIT_LEN * 10)).toBe(1);
  });
  it('the wrong eye drains more than twice as fast at full difficulty', () => {
    expect(drainAt(1)).toBeGreaterThan(drainAt(0) * 2);
    expect(edgeCostAt(1)).toBeGreaterThan(edgeCostAt(0));
  });
  it('the warm-up has only single junk, no walls, and much less of it', () => {
    const s = createGame(12);
    const early = s.junk.filter((j) => j.x < ORBIT_LEN * 0.3);
    expect(early.every((j) => !j.wall)).toBe(true);
    const per = (x0: number, x1: number, g: GameState) => new Set(g.junk.filter((j) => j.x >= x0 && j.x < x1).map((j) => Math.round(j.x / 40))).size;
    const h = createGame(12); h.easy = true;
    let late = 0;
    for (let i = 0; i < 200 / DT && !h.over; i++) { rightEye(h); step(h, DT, false); if (Math.abs(h.dist - ORBIT_LEN * 6) < 3) late = per(ORBIT_LEN * 6, ORBIT_LEN * 6 + 1400, h); }
    expect(per(0, 1400 + 1500, s)).toBeLessThan(late + 1);
  });
});

describe('power-ups', () => {
  const place = (s: GameState, kind: 'repair' | 'solar' | 'boost') => { s.powerUps = [{ id: 77, x: s.dist + 3, a: s.a, kind, got: 0 }]; s.nextPowerX = 1e9; };
  it('repair kit gives back a shield, never above the max', () => {
    const s = createGame(1); clearJunk(s); s.shields = 1.5; place(s, 'repair'); step(s, DT, hover(s));
    expect(s.shields).toBe(2);
    expect(s.events.some((e) => e.type === 'power')).toBe(true);
    s.shields = MAX_SHIELDS; place(s, 'repair'); step(s, DT, hover(s)); expect(s.shields).toBe(MAX_SHIELDS);
  });
  it('solar panel fills the power bar', () => {
    const s = createGame(1); clearJunk(s); s.power = 0.2; place(s, 'solar'); step(s, DT, hover(s));
    expect(s.power).toBe(1);
  });
  it('data boost doubles points for a few seconds', () => {
    const a = createGame(5), b = createGame(5); clearJunk(a); clearJunk(b);
    a.powerUps = []; a.nextPowerX = 1e9; place(b, 'boost');
    run(a, 3, hover); run(b, 3, hover);
    expect(b.score).toBeGreaterThan(a.score * 1.6);
  });
  it('power-ups keep coming and are missed if you fly past them', () => {
    const s = createGame(3); s.easy = true; const seen = new Set<number>();
    for (let i = 0; i < 90 / DT && !s.over; i++) { rightEye(s); step(s, DT, false); for (const p of s.powerUps) seen.add(p.id); }
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(PICKUP_R).toBeGreaterThan(15);
  });
});

describe('junk patterns', () => {
  it('walls block the whole band except one gap, and the gap is always wide enough', () => {
    const s = createGame(8); s.easy = true;
    const cols = new Map<number, number[]>(), seen = new Set<number>();
    for (let i = 0; i < 90 / DT && !s.over; i++) {
      rightEye(s); step(s, DT, false);
      for (const j of s.junk) if (j.wall && !seen.has(j.id)) { seen.add(j.id); cols.set(j.x, [...(cols.get(j.x) ?? []), j.a]); }
    }
    expect(cols.size).toBeGreaterThan(0);
    for (const [x, as] of cols) {
      as.sort((p, q) => p - q);
      expect(as[0]).toBeLessThan(0.15); expect(as[as.length - 1]).toBeGreaterThan(0.85); // edges covered
      let widest = 0; for (let i = 1; i < as.length; i++) widest = Math.max(widest, as[i] - as[i - 1]);
      expect(widest, `wall at ${x}`).toBeGreaterThanOrEqual(wallGap(difficultyAt(x)) - 1e-6);
      expect(widest * BAND - 2 * (11 + 23 * 0.72)).toBeGreaterThan(45); // a real corridor for the satellite
    }
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
      const s = createGame(seed, true);
      run(s, 150, (g) => { rightEye(g); return false; });
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
  it('sound is on by default, also for old saves that stored the old off default', () => {
    expect(loadSave(mem()).sound).toBe(true);
    const st = mem(); st.setItem(SAVE_KEY, JSON.stringify({ v: 1, best: 5, sound: false }));
    expect(loadSave(st).sound).toBe(true);
    st.setItem(SAVE_KEY, JSON.stringify({ v: 1, best: 5, sound: false, soundV: 2 }));
    expect(loadSave(st).sound).toBe(false);
  });
  it('survives corrupt or blocked storage', () => {
    const bad = { getItem: () => '{nope', setItem: () => { throw new Error('blocked'); } };
    expect(loadSave(bad).best).toBe(0);
    expect(() => recordRun(bad, 5, false)).not.toThrow();
    expect(loadSave(null).runs).toBe(0);
  });
});
