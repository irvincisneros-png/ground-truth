/** Satellite Spotter progress, saved in localStorage under `ground-truth:spotter:v1`. Pure functions, no DOM. */
import { MISSION_COUNT, STEP_COUNT } from './missions';

export const SPOTTER_KEY = 'ground-truth:spotter:v1';

export type Screen = 'start' | 'mission' | 'report';

export interface SpotterState {
  v: 1;
  screen: Screen;
  /** 0-based mission and step. */
  mission: number;
  step: number;
  /** One flag per mission: the sentence was completed and the stamp earned. */
  stamps: boolean[];
  /** The chosen words for each mission's blanks (only once completed). */
  sentences: (string[] | null)[];
  /** The reef bonus question was answered. */
  bonus: boolean;
  name: string;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function defaultState(): SpotterState {
  return {
    v: 1, screen: 'start', mission: 0, step: 0,
    stamps: Array(MISSION_COUNT).fill(false),
    sentences: Array(MISSION_COUNT).fill(null),
    bonus: false, name: '',
  };
}

export function safeStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const k = '__gt_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

const int = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;

/** Turn anything read from storage into a safe state. Unknown or damaged data falls back to the default. */
export function sanitise(raw: unknown): SpotterState {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return d;
  const screen: Screen = r.screen === 'mission' || r.screen === 'report' ? r.screen : 'start';
  const stamps = Array.isArray(r.stamps) ? d.stamps.map((_, i) => (r.stamps as unknown[])[i] === true) : d.stamps;
  const sentences = Array.isArray(r.sentences)
    ? d.sentences.map((_, i) => {
        const x = (r.sentences as unknown[])[i];
        return Array.isArray(x) && x.every((t) => typeof t === 'string') ? (x as string[]).slice(0, 6) : null;
      })
    : d.sentences;
  return {
    v: 1, screen,
    mission: int(r.mission, 0, MISSION_COUNT - 1, 0),
    step: int(r.step, 0, STEP_COUNT - 1, 0),
    stamps, sentences,
    bonus: r.bonus === true,
    name: typeof r.name === 'string' ? r.name.slice(0, 40) : '',
  };
}

export function loadState(storage: StorageLike | null): SpotterState {
  if (!storage) return defaultState();
  try {
    const t = storage.getItem(SPOTTER_KEY);
    return t ? sanitise(JSON.parse(t)) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(storage: StorageLike | null, s: SpotterState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SPOTTER_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearState(storage: StorageLike | null): void {
  try { storage?.removeItem(SPOTTER_KEY); } catch { /* ignore */ }
}

/** True when there is something worth resuming (a mission started or finished). */
export function hasProgress(s: SpotterState): boolean {
  return s.screen !== 'start' || s.stamps.some(Boolean) || s.mission > 0 || s.step > 0;
}

export function stampCount(s: SpotterState): number {
  return s.stamps.filter(Boolean).length;
}

/** Where "Next" goes from here. Mission 4 step 5 leads to the report card. */
export function advance(s: SpotterState): SpotterState {
  const n: SpotterState = { ...s, stamps: [...s.stamps], sentences: [...s.sentences] };
  if (s.screen === 'start') { n.screen = 'mission'; n.mission = 0; n.step = 0; return n; }
  if (s.screen === 'report') return n;
  if (s.step < STEP_COUNT - 1) { n.step = s.step + 1; return n; }
  if (s.mission < MISSION_COUNT - 1) { n.mission = s.mission + 1; n.step = 0; return n; }
  n.screen = 'report';
  return n;
}

/** Record a finished sentence and its stamp. */
export function earnStamp(s: SpotterState, mission: number, words: string[]): SpotterState {
  const n: SpotterState = { ...s, stamps: [...s.stamps], sentences: [...s.sentences] };
  n.stamps[mission] = true;
  n.sentences[mission] = words;
  return n;
}

/** Label for the resume button. */
export function resumeLabel(s: SpotterState): string {
  if (s.screen === 'report') return 'See my report card';
  return `Continue mission ${s.mission + 1}`;
}
