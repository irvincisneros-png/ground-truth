/**
 * Real satellite image pairs. They arrive separately as `public/spotter/images.json` plus `public/spotter/*.webp`.
 * Anything missing means "Image coming": we never substitute fake imagery.
 */
export interface ImageSide { file: string; label: string; date?: string }
export interface ImagePair {
  id: string;
  before: ImageSide;
  after: ImageSide;
  caption?: string;
  credit?: string;
  licence?: string;
  sourceUrl?: string;
}

const isSide = (x: unknown): x is ImageSide =>
  !!x && typeof x === 'object' && typeof (x as ImageSide).file === 'string' && (x as ImageSide).file.length > 0;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function toPair(x: unknown, fallbackId?: string): ImagePair | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  const id = str(r.id) ?? fallbackId;
  if (!id || !isSide(r.before) || !isSide(r.after)) return null;
  const side = (v: ImageSide): ImageSide => ({ file: v.file, label: str(v.label) ?? '', date: str(v.date) });
  return { id, before: side(r.before), after: side(r.after), caption: str(r.caption), credit: str(r.credit), licence: str(r.licence), sourceUrl: str(r.sourceUrl) };
}

/** Accepts an array, `{ pairs: [] }`, `{ images: [] }`, or an object keyed by mission id. Bad entries are dropped. */
export function normaliseImages(raw: unknown): Record<string, ImagePair> {
  const out: Record<string, ImagePair> = {};
  let list: [unknown, string | undefined][] = [];
  if (Array.isArray(raw)) list = raw.map((x) => [x, undefined]);
  else if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const arr = Array.isArray(r.pairs) ? r.pairs : Array.isArray(r.images) ? r.images : null;
    list = arr ? arr.map((x) => [x, undefined]) : Object.entries(r).map(([k, v]) => [v, k]);
  }
  for (const [x, k] of list) {
    const p = toPair(x, k);
    if (p) out[p.id] = p;
  }
  return out;
}

const base = (): string => (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
export const spotterUrl = (file: string): string => (/^(https?:)?\/\//.test(file) ? file : file.includes('/') ? `${base()}${file.replace(/^\//, '')}` : `${base()}spotter/${file}`);

let cache: Promise<Record<string, ImagePair>> | null = null;
/** Never rejects: a missing or broken file gives an empty map. */
export function loadImages(): Promise<Record<string, ImagePair>> {
  cache ??= fetch(`${base()}spotter/images.json`)
    .then(async (r) => {
      if (!r.ok) return {};
      const t = await r.text();
      if (t.trimStart().startsWith('<')) return {};
      return normaliseImages(JSON.parse(t));
    })
    .catch(() => ({}));
  return cache;
}
