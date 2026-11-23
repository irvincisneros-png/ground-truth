import type { BuoyData, GmslPoint, Reef, ReefData, SeaIceData, YearValue } from './types';
import { linearFit } from '../ui/chart-math';

/** ISO date (YYYY-MM-DD) to decimal year. */
export function isoToYear(iso: string): number {
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00Z' : iso);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}

export function yearToLabel(x: number): string {
  const y = Math.floor(x);
  const frac = x - y;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Math.min(11, Math.floor(frac * 12))];
  return `${month} ${y}`;
}

/** The southern-hemisphere bleaching summer that ends in `summer` (Dec of the year before to Apr). */
export function summerWindow(summer: number): [number, number] {
  return [summer - 1 + 11 / 12, summer + 4 / 12];
}

export function reefPeak(reef: Reef, summer: string): number | undefined {
  const v = reef.peakDhwBySummer?.[summer];
  if (typeof v === 'number') return v;
  const [a, b] = summerWindow(Number(summer));
  const pts = reef.dhw.filter((p) => {
    const x = isoToYear(p.date);
    return x >= a && x <= b;
  });
  return pts.length ? Math.max(...pts.map((p) => p.dhw_cweeks)) : undefined;
}

export interface Outcome {
  /** reef id with the most severe survey category, or 'same' when the top two tie */
  top: string | 'same' | null;
  /** every reef that shares the highest category */
  topIds: string[];
  /** true when every reef with a survey result has the same category */
  allSame: boolean;
  categories: Record<string, number | undefined>;
}

export function surveyOutcome(reefs: Reef[], summer: string): Outcome {
  const categories: Record<string, number | undefined> = {};
  for (const r of reefs) categories[r.id] = r.survey?.[summer]?.category;
  const known = reefs.filter((r) => typeof categories[r.id] === 'number');
  if (!known.length) return { top: null, topIds: [], allSame: false, categories };
  const max = Math.max(...known.map((r) => categories[r.id] as number));
  const topIds = known.filter((r) => categories[r.id] === max).map((r) => r.id);
  const allSame = topIds.length === known.length;
  return { top: topIds.length > 1 ? 'same' : topIds[0], topIds, allSame, categories };
}

/** Did the survey agree with a prediction? A reef in a tied top group counts. "About the same" needs all reefs level. */
export function predictionHeld(o: Outcome, choice: string): boolean {
  if (o.top === null) return false;
  if (choice === 'same') return o.allSame;
  return o.topIds.includes(choice);
}

/** The two reefs ranked by 2024 peak DHW: [higher, lower]. */
export function rankByPeak(reefs: Reef[], summer: string): Reef[] {
  return [...reefs].sort((a, b) => (reefPeak(b, summer) ?? -1) - (reefPeak(a, summer) ?? -1));
}

export interface BuoyStats {
  meanDiff: number;
  maxAbsDiff: number;
  n: number;
  peakLogger: number;
  peakSatellite: number;
}
export function buoyStats(b: BuoyData): BuoyStats {
  const d = b.series.map((p) => p.satellite_c - p.logger_c);
  const n = d.length;
  return {
    n,
    meanDiff: d.reduce((a, v) => a + v, 0) / n,
    maxAbsDiff: Math.max(...d.map(Math.abs)),
    peakLogger: Math.max(...b.series.map((p) => p.logger_c)),
    peakSatellite: Math.max(...b.series.map((p) => p.satellite_c)),
  };
}

/** Annual means over calendar years that are fully covered by the series. */
export function annualMeans(gmsl: GmslPoint[]): { year: number; mean_mm: number }[] {
  if (!gmsl.length) return [];
  const first = gmsl[0].t_year, last = gmsl[gmsl.length - 1].t_year;
  const groups = new Map<number, number[]>();
  for (const p of gmsl) {
    const y = Math.floor(p.t_year);
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y)!.push(p.gmsl_mm);
  }
  const out: { year: number; mean_mm: number }[] = [];
  for (const [year, vals] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const complete = first <= year + 0.1 && last >= year + 0.9;
    if (complete && vals.length >= 3) out.push({ year, mean_mm: vals.reduce((a, v) => a + v, 0) / vals.length });
  }
  return out;
}

/** The consecutive pair of years with the biggest fall (or smallest rise): the ENSO trap pair. */
export function findDropPair(annual: { year: number; mean_mm: number }[]): { y0: number; y1: number; delta_mm: number } | null {
  let best: { y0: number; y1: number; delta_mm: number } | null = null;
  for (let i = 1; i < annual.length; i++) {
    if (annual[i].year !== annual[i - 1].year + 1) continue;
    const delta = annual[i].mean_mm - annual[i - 1].mean_mm;
    if (!best || delta < best.delta_mm) best = { y0: annual[i - 1].year, y1: annual[i].year, delta_mm: delta };
  }
  return best;
}

export function windowRate(gmsl: GmslPoint[], from: number, to: number): number | null {
  const fit = linearFit(gmsl.map((p) => ({ x: p.t_year, y: p.gmsl_mm })), from, to + 1 - 1e-9);
  return fit ? fit.slope : null;
}

export interface Records {
  high: YearValue;
  low: YearValue;
}
export function seriesRecords(s: YearValue[]): Records | null {
  if (!s.length) return null;
  let high = s[0], low = s[0];
  for (const p of s) {
    if (p.extent_mkm2 > high.extent_mkm2) high = p;
    if (p.extent_mkm2 < low.extent_mkm2) low = p;
  }
  return { high, low };
}

/** Rank (1 = lowest) of a year in a series; useful to say "lowest on record". */
export function lowestYear(s: YearValue[]): number | null {
  return seriesRecords(s)?.low.year ?? null;
}

export function seaIceTrend(s: YearValue[]): { mkm2PerDecade: number; pctPerDecade: number } | null {
  const fit = linearFit(s.map((p) => ({ x: p.year, y: p.extent_mkm2 })));
  if (!fit) return null;
  const mean = s.reduce((a, p) => a + p.extent_mkm2, 0) / s.length;
  return { mkm2PerDecade: fit.slope * 10, pctPerDecade: (fit.slope * 10 / mean) * 100 };
}

export function reefList(d: ReefData): Reef[] {
  return d.reefs.slice(0, 3);
}
export type { SeaIceData };

/** Window keys such as "1993-2002" to [from, to]. */
export function parseWindows(rates: Record<string, number>): [number, number][] {
  const w = Object.keys(rates).map((k) => k.split('-').map(Number) as [number, number]).filter((p) => p.length === 2 && p.every(Number.isFinite));
  w.sort((a, b) => a[0] - b[0]);
  return w.length >= 2 ? [w[0], w[w.length - 1]] : [[1993, 2002], [2015, 2024]];
}


/** First-of-month ticks (as decimal years) inside [x0, x1], thinned to at most `max`. */
export function monthTicks(x0: number, x1: number, max = 7): number[] {
  const months: number[] = [];
  let y = Math.floor(x0), m = 0;
  for (;;) {
    const x = isoToYear(`${y}-${String(m + 1).padStart(2, '0')}-01`);
    if (x > x1) break;
    if (x >= x0) months.push(x);
    m += 1;
    if (m === 12) { m = 0; y += 1; }
    if (y > x1 + 1) break;
  }
  let step = 1;
  for (const s of [1, 2, 3, 6, 12]) { step = s; if (Math.ceil(months.length / s) <= max) break; }
  return months.filter((_, i) => i % step === 0);
}

/** "12 Jan" style label for a decimal year. */
export function yearToDayLabel(x: number): string {
  const y = Math.floor(x);
  const t = Date.UTC(y, 0, 1) + (x - y) * (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1));
  const d = new Date(Math.round(t / 3600000) * 3600000);
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
}
