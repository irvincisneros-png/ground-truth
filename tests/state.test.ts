import { describe, expect, it } from 'vitest';
import { PARTS, STORAGE_KEY, award, clearProgress, defaultState, hasSavedProgress, hydrate, isUnlocked, loadProgress, markComplete, saveProgress, type StorageLike } from '../src/state';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

describe('persistence', () => {
  it('uses the documented key', () => {
    expect(STORAGE_KEY).toBe('ground-truth:v1');
  });
  it('round-trips progress', () => {
    const st = fakeStorage();
    const s = defaultState();
    s.part = 'reef';
    s.name = 'Sam';
    s.reef.predict = { choice: 'fake-a', confidence: 2 };
    s.reef.step = 3;
    award(s, 'reef.predict', 2);
    markComplete(s, 'launch');
    expect(saveProgress(st, s)).toBe(true);
    const back = loadProgress(st);
    expect(back).toEqual(s);
  });
  it('returns defaults when nothing is saved', () => {
    expect(loadProgress(fakeStorage())).toEqual(defaultState());
    expect(hasSavedProgress(fakeStorage())).toBe(false);
  });
  it('returns defaults for corrupt JSON', () => {
    expect(loadProgress(fakeStorage({ [STORAGE_KEY]: '{not json' }))).toEqual(defaultState());
  });
  it('returns defaults for a different version', () => {
    expect(hydrate({ v: 2, part: 'reef' })).toEqual(defaultState());
  });
  it('survives a missing storage object (private mode)', () => {
    expect(loadProgress(null)).toEqual(defaultState());
    expect(saveProgress(null, defaultState())).toBe(false);
    expect(hasSavedProgress(null)).toBe(false);
  });
  it('survives storage that throws', () => {
    const bad: StorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(loadProgress(bad)).toEqual(defaultState());
    expect(saveProgress(bad, defaultState())).toBe(false);
    expect(() => clearProgress(bad)).not.toThrow();
  });
  it('start again clears the saved entry', () => {
    const st = fakeStorage();
    saveProgress(st, defaultState());
    expect(hasSavedProgress(st)).toBe(true);
    clearProgress(st);
    expect(hasSavedProgress(st)).toBe(false);
  });
});

describe('hydrate is defensive', () => {
  it('fills in sections an older save did not have', () => {
    const s = hydrate({ v: 1, part: 'ice', completed: ['launch'] });
    expect(s.part).toBe('ice');
    expect(s.forest.guess).toEqual({});
    expect(s.sensorLab.notes).toEqual({});
    expect(s.briefing.draft.evidence).toEqual([]);
  });
  it('drops unknown parts and non-numeric scores', () => {
    const s = hydrate({ v: 1, part: 'nope', completed: ['launch', 'zzz', 3], scores: { 'reef.peak': 2, bad: 'x', worse: NaN } });
    expect(s.part).toBe('launch');
    expect(s.completed).toEqual(['launch']);
    expect(s.scores).toEqual({ 'reef.peak': 2 });
  });
  it('ignores sections of the wrong shape', () => {
    const s = hydrate({ v: 1, reef: 'oops', sea: [1, 2], forest: { guess: 7 } });
    expect(s.reef).toEqual(defaultState().reef);
    expect(s.sea).toEqual(defaultState().sea);
    expect(s.forest.guess).toEqual({});
  });
  it('limits the name length', () => {
    expect(hydrate({ v: 1, name: 'x'.repeat(500) }).name.length).toBe(60);
  });
});

describe('unlocking parts', () => {
  it('opens the first part and the one after a completed part', () => {
    const s = defaultState();
    expect(isUnlocked(s, 'launch')).toBe(true);
    expect(isUnlocked(s, 'sensor-lab')).toBe(false);
    markComplete(s, 'launch');
    expect(isUnlocked(s, 'sensor-lab')).toBe(true);
    expect(isUnlocked(s, 'reef')).toBe(false);
  });
  it('unlockAll opens everything', () => {
    for (const p of PARTS) expect(isUnlocked(defaultState(), p.id, true)).toBe(true);
  });
  it('markComplete does not duplicate', () => {
    const s = defaultState();
    markComplete(s, 'launch');
    markComplete(s, 'launch');
    expect(s.completed).toEqual(['launch']);
  });
});
