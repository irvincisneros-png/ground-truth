import { describe, expect, it } from 'vitest';
import { MISSION_COUNT } from '../src/spotter/missions';
import { SPOTTER_KEY, advance, clearState, defaultState, earnStamp, hasProgress, loadState, resumeLabel, sanitise, saveState, stampCount, type StorageLike } from '../src/spotter/state';

const mem = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
};

describe('Spotter save and resume', () => {
  it('uses the agreed storage key', () => {
    expect(SPOTTER_KEY).toBe('ground-truth:spotter:v1');
  });

  it('starts empty with nothing to resume', () => {
    const s = loadState(mem());
    expect(s).toEqual(defaultState());
    expect(hasProgress(s)).toBe(false);
  });

  it('round-trips progress through storage', () => {
    const st = mem();
    let s = advance(defaultState()); // into mission 1
    s = advance(advance(s));          // step 3
    s = earnStamp(s, 0, ['shrinking', 'warmer']);
    s.name = 'Alex';
    expect(saveState(st, s)).toBe(true);
    expect(st.data.has(SPOTTER_KEY)).toBe(true);
    const back = loadState(st);
    expect(back).toEqual(s);
    expect(back.screen).toBe('mission');
    expect(back.step).toBe(2);
    expect(hasProgress(back)).toBe(true);
    expect(resumeLabel(back)).toBe('Continue mission 1');
  });

  it('walks through 4 missions x 5 steps and ends on the report card', () => {
    let s = advance(defaultState());
    let moves = 0;
    while (s.screen === 'mission') { s = advance(s); moves++; }
    expect(moves).toBe(MISSION_COUNT * 5);
    expect(s.screen).toBe('report');
    expect(resumeLabel(s)).toBe('See my report card');
    expect(advance(s).screen).toBe('report');
  });

  it('goes to step 1 of the next mission after step 5', () => {
    let s = advance(defaultState());
    for (let i = 0; i < 5; i++) s = advance(s);
    expect([s.mission, s.step]).toEqual([1, 0]);
  });

  it('counts stamps and keeps the sentence words', () => {
    let s = defaultState();
    s = earnStamp(s, 2, ['rising', 'more']);
    expect(stampCount(s)).toBe(1);
    expect(s.sentences[2]).toEqual(['rising', 'more']);
    expect(s.sentences[0]).toBeNull();
  });

  it('start again clears everything', () => {
    const st = mem();
    saveState(st, earnStamp(defaultState(), 0, ['a', 'b']));
    clearState(st);
    expect(loadState(st)).toEqual(defaultState());
  });

  it('survives damaged, foreign or out of range data', () => {
    const st = mem();
    st.setItem(SPOTTER_KEY, '{not json');
    expect(loadState(st)).toEqual(defaultState());
    expect(sanitise({ v: 2 })).toEqual(defaultState());
    expect(sanitise(null)).toEqual(defaultState());
    const odd = sanitise({ v: 1, screen: 'nope', mission: 99, step: -3, stamps: [true, 'yes', 1], sentences: [['a', 1], 'x'], name: 123, bonus: 'true' });
    expect(odd.screen).toBe('start');
    expect(odd.mission).toBe(0);
    expect(odd.step).toBe(0);
    expect(odd.stamps).toEqual([true, false, false, false]);
    expect(odd.sentences).toEqual([null, null, null, null]);
    expect(odd.name).toBe('');
    expect(odd.bonus).toBe(false);
  });

  it('blocked storage does not break anything', () => {
    expect(loadState(null)).toEqual(defaultState());
    expect(saveState(null, defaultState())).toBe(false);
    const bad: StorageLike = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); } };
    expect(loadState(bad)).toEqual(defaultState());
    expect(saveState(bad, defaultState())).toBe(false);
    expect(() => clearState(bad)).not.toThrow();
  });
});
