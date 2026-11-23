import type { DataFiles, DataName, LandData, Source } from './types';

export type Loaded<T> = { ok: true; data: T } | { ok: false; reason: string };

const cache = new Map<string, Promise<Loaded<unknown>>>();

export function dataUrl(path: string): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}data/${path}`;
}

/** Tiny structural checks: enough to refuse a half-written file instead of crashing a chart. */
const validators: Record<DataName, (d: any) => boolean> = {
  reef: (d) => Array.isArray(d?.reefs) && d.reefs.length >= 2 && d.reefs.every((r: any) => Array.isArray(r.dhw) && r.dhw.length > 1 && r.peakDhwBySummer && r.survey),
  buoy: (d) => Array.isArray(d?.series) && d.series.length > 1 && typeof d.depth_m === 'number',
  sealevel: (d) => Array.isArray(d?.gmsl) && d.gmsl.length > 10 && Array.isArray(d?.tideGauge?.series),
  forest: (d) => Array.isArray(d?.cases) && d.cases.length >= 1,
  seaice: (d) => Array.isArray(d?.antarctic?.feb_min) && Array.isArray(d?.antarctic?.sep_max) && Array.isArray(d?.arctic?.sep),
};

export function validate<K extends DataName>(name: K, data: unknown): data is DataFiles[K] {
  try {
    return !!validators[name](data);
  } catch {
    return false;
  }
}

async function fetchJson(path: string): Promise<Loaded<unknown>> {
  try {
    const res = await fetch(dataUrl(path));
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const text = await res.text();
    // A dev server may answer a missing file with index.html; treat anything that is not JSON as missing.
    if (text.trimStart().startsWith('<')) return { ok: false, reason: 'not found' };
    return { ok: true, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'failed' };
  }
}

export function loadData<K extends DataName>(name: K): Promise<Loaded<DataFiles[K]>> {
  const key = name;
  let p = cache.get(key);
  if (!p) {
    p = fetchJson(`${name}.json`).then((r) => {
      if (!r.ok) return r;
      return validate(name, r.data) ? { ok: true as const, data: r.data } : { ok: false as const, reason: 'unexpected shape' };
    });
    cache.set(key, p);
  }
  return p as Promise<Loaded<DataFiles[K]>>;
}

export function loadLand(): Promise<Loaded<LandData>> {
  let p = cache.get('geo/au-land');
  if (!p) {
    p = fetchJson('geo/au-land.json').then((r) => (r.ok && Array.isArray((r.data as LandData).polygons) ? (r as Loaded<LandData>) : { ok: false, reason: 'no land' }));
    cache.set('geo/au-land', p);
  }
  return p as Promise<Loaded<LandData>>;
}

/** Load several files at once; any that are missing come back as undefined. */
export async function loadMany<K extends DataName>(names: K[]): Promise<{ [P in K]?: DataFiles[P] }> {
  const results = await Promise.all(names.map((n) => loadData(n)));
  const out: Record<string, unknown> = {};
  names.forEach((n, i) => {
    const r = results[i];
    if (r.ok) out[n] = r.data;
  });
  return out as { [P in K]?: DataFiles[P] };
}

export const ALL_DATA: DataName[] = ['reef', 'buoy', 'sealevel', 'forest', 'seaice'];

/** Every source from every data file (plus the land outline), de-duplicated by name+url. */
export async function loadAllSources(): Promise<{ file: string; sources: Source[] }[]> {
  const out: { file: string; sources: Source[] }[] = [];
  for (const n of ALL_DATA) {
    const r = await loadData(n);
    if (r.ok) out.push({ file: `${n}.json`, sources: (r.data as { sources?: Source[] }).sources ?? [] });
  }
  const land = await loadLand();
  if (land.ok) out.push({ file: 'geo/au-land.json', sources: land.data.sources ?? [] });
  return out;
}
