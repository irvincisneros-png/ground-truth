/** Typed progress state with localStorage persistence. The storage object is injectable so it can be tested. */

export const STORAGE_KEY = 'ground-truth:v1';

export type PartId = 'launch' | 'sensor-lab' | 'reef' | 'sea' | 'forest' | 'ice' | 'briefing' | 'debrief';

export interface PartInfo {
  id: PartId;
  label: string;
  short: string;
  minutes: number;
}

export const PARTS: PartInfo[] = [
  { id: 'launch', label: 'Launch', short: 'Launch', minutes: 5 },
  { id: 'sensor-lab', label: 'Sensor lab', short: 'Sensors', minutes: 8 },
  { id: 'reef', label: 'Reef investigation', short: 'Reef', minutes: 20 },
  { id: 'sea', label: 'Sea level', short: 'Sea level', minutes: 3 },
  { id: 'forest', label: 'Forest', short: 'Forest', minutes: 3 },
  { id: 'ice', label: 'Ice', short: 'Ice', minutes: 4 },
  { id: 'briefing', label: 'Minister briefing', short: 'Briefing', minutes: 7 },
  { id: 'debrief', label: 'Debrief', short: 'Debrief', minutes: 0 },
];

export interface ReefState {
  /** furthest step reached: 0 predict, 1 flight, 2 reveal, 3 ground truth, 4 compare, 5 limits, 6 done */
  step: number;
  predict?: { choice: string; confidence: 1 | 2 | 3 };
  flightReef?: string;
  whyDiffer?: string;
  quant?: { peak: number; ratio: number; tries: number; peakOk: boolean; ratioOk: boolean };
  limits?: string[];
}
export interface SeaState {
  step: number;
  y0?: number;
  y1?: number;
  pairGuess?: 'rising' | 'falling' | 'unclear';
  conclusion?: string;
  gauge?: string;
  flood?: string;
}
export interface ForestState {
  step: number;
  guess: Record<string, string>;
  classify: Record<string, string>;
  caution?: string;
  longRecord?: string;
}
export interface IceState {
  step: number;
  guess?: string;
  statement?: string;
  sheet?: string;
}
export interface BriefingDraft {
  claimId?: string;
  strength?: number;
  evidence: string[];
  limitationId?: string;
  freeText: string;
}
export interface BriefingState {
  draft: BriefingDraft;
  /** The first submission. Locked: this is the one that scores. */
  first?: BriefingDraft & { points: number; max: number };
}

export interface Progress {
  v: 1;
  part: PartId;
  completed: PartId[];
  /** Points awarded, keyed by item (see ITEMS in scoring.ts). Written once per key: first attempts only. */
  scores: Record<string, number>;
  name: string;
  launch: { guess?: string };
  /** The sensor lab (globe builder) reads and writes this section. */
  sensorLab: { stationsDone: string[]; notes: Record<string, unknown>; done: boolean };
  reef: ReefState;
  sea: SeaState;
  forest: ForestState;
  ice: IceState;
  briefing: BriefingState;
}

export function defaultState(): Progress {
  return {
    v: 1,
    part: 'launch',
    completed: [],
    scores: {},
    name: '',
    launch: {},
    sensorLab: { stationsDone: [], notes: {}, done: false },
    reef: { step: 0 },
    sea: { step: 0 },
    forest: { step: 0, guess: {}, classify: {} },
    ice: { step: 0 },
    briefing: { draft: { evidence: [], freeText: '' } },
  };
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const PART_IDS = new Set<string>(PARTS.map((p) => p.id));

/** Merge saved JSON onto defaults, section by section, ignoring anything of the wrong shape. */
export function hydrate(raw: unknown): Progress {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, any>;
  if (r.v !== 1) return base;
  const out: Progress = { ...base };
  if (typeof r.part === 'string' && PART_IDS.has(r.part)) out.part = r.part as PartId;
  if (Array.isArray(r.completed)) out.completed = r.completed.filter((x: unknown) => typeof x === 'string' && PART_IDS.has(x)) as PartId[];
  if (r.scores && typeof r.scores === 'object') {
    for (const [k, v] of Object.entries(r.scores)) if (typeof v === 'number' && Number.isFinite(v)) out.scores[k] = v;
  }
  if (typeof r.name === 'string') out.name = r.name.slice(0, 60);
  const sec = <T extends object>(def: T, saved: unknown): T => (saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...def, ...(saved as object) } : def);
  out.launch = sec(base.launch, r.launch);
  out.sensorLab = sec(base.sensorLab, r.sensorLab);
  if (!Array.isArray(out.sensorLab.stationsDone)) out.sensorLab.stationsDone = [];
  if (!out.sensorLab.notes || typeof out.sensorLab.notes !== 'object') out.sensorLab.notes = {};
  out.reef = sec(base.reef, r.reef);
  out.sea = sec(base.sea, r.sea);
  out.forest = sec(base.forest, r.forest);
  if (!out.forest.guess || typeof out.forest.guess !== 'object') out.forest.guess = {};
  if (!out.forest.classify || typeof out.forest.classify !== 'object') out.forest.classify = {};
  out.ice = sec(base.ice, r.ice);
  out.briefing = sec(base.briefing, r.briefing);
  out.briefing.draft = sec(base.briefing.draft, out.briefing.draft);
  if (!Array.isArray(out.briefing.draft.evidence)) out.briefing.draft.evidence = [];
  return out;
}

export function loadProgress(storage: StorageLike | null): Progress {
  if (!storage) return defaultState();
  try {
    const txt = storage.getItem(STORAGE_KEY);
    return txt ? hydrate(JSON.parse(txt)) : defaultState();
  } catch {
    return defaultState();
  }
}

export function hasSavedProgress(storage: StorageLike | null): boolean {
  if (!storage) return false;
  try {
    return !!storage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function saveProgress(storage: StorageLike | null, p: Progress): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(storage: StorageLike | null): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked: nothing to clear */
  }
}

/** Award points for an item once. Later attempts never change the score. Returns true if this call scored. */
export function award(p: Progress, key: string, points: number): boolean {
  if (key in p.scores) return false;
  p.scores[key] = points;
  return true;
}

export function markComplete(p: Progress, id: PartId): void {
  if (!p.completed.includes(id)) p.completed.push(id);
}

export function isUnlocked(p: Progress, id: PartId, unlockAll = false): boolean {
  if (unlockAll) return true;
  const i = PARTS.findIndex((x) => x.id === id);
  if (i <= 0) return true;
  return p.completed.includes(PARTS[i - 1].id) || p.completed.includes(id) || p.part === id;
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
