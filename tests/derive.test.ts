import { describe, expect, it } from 'vitest';
import reef from './fixtures/reef.json';
import buoy from './fixtures/buoy.json';
import sea from './fixtures/sealevel.json';
import ice from './fixtures/seaice.json';
import { annualMeans, buoyStats, findDropPair, isoToYear, monthTicks, parseWindows, predictionHeld, rankByPeak, reefPeak, seaIceTrend, seriesRecords, summerWindow, surveyOutcome, windowRate, yearToDayLabel, yearToLabel } from '../src/data/derive';
import { validate } from '../src/data/load';
import type { BuoyData, ReefData, SeaIceData, SeaLevelData } from '../src/data/types';

const R = reef as unknown as ReefData;
const B = buoy as unknown as BuoyData;
const S = sea as unknown as SeaLevelData;
const I = ice as unknown as SeaIceData;

describe('dates', () => {
  it('converts ISO dates to decimal years', () => {
    expect(isoToYear('2024-01-01')).toBeCloseTo(2024, 6);
    expect(isoToYear('2024-07-02')).toBeCloseTo(2024.5, 2);
  });
  it('labels decimal years', () => {
    expect(yearToLabel(2024.0)).toBe('Jan 2024');
    expect(yearToLabel(2024.5)).toBe('Jul 2024');
  });
  it('summer window runs December to April', () => {
    const [a, b] = summerWindow(2024);
    expect(isoToYear('2023-12-15')).toBeGreaterThan(a);
    expect(isoToYear('2024-03-01')).toBeLessThan(b);
    expect(isoToYear('2024-08-01')).toBeGreaterThan(b);
  });
});

describe('reef derivations (fake fixtures)', () => {
  it('reads the published peak, or computes one from the series', () => {
    const r = R.reefs[0];
    expect(reefPeak(r, '2024')).toBe(10);
    const stripped = { ...r, peakDhwBySummer: {} };
    const computed = reefPeak(stripped, '2024')!;
    expect(computed).toBeGreaterThan(8);
    expect(computed).toBeLessThanOrEqual(10);
    expect(reefPeak(stripped, '1999')).toBeUndefined();
  });
  it('ranks reefs by peak', () => {
    expect(rankByPeak(R.reefs, '2024').map((r) => r.id)).toEqual(['fake-a', 'fake-b']);
  });
  it('finds the most severely bleached reef, which need not be the hottest', () => {
    const o = surveyOutcome(R.reefs, '2024');
    expect(o.top).toBe('fake-b');
    expect(o.categories).toEqual({ 'fake-a': 1, 'fake-b': 3 });
  });
  it('reports a tie and missing data', () => {
    const tie = R.reefs.map((r) => ({ ...r, survey: { '2024': { category: 2, label: 'x' } } }));
    expect(surveyOutcome(tie, '2024').top).toBe('same');
    expect(surveyOutcome(R.reefs, '1999').top).toBeNull();
  });
});

describe('prediction verdicts', () => {
  const level = (cats: number[]) => R.reefs.map((r, i) => ({ ...r, survey: { '2024': { category: cats[i], label: 'x' } } }));
  it('a reef in a tied top group counts as held', () => {
    const o = surveyOutcome([...level([3, 3]), { ...R.reefs[0], id: 'third', survey: { '2024': { category: 0, label: 'x' } } }], '2024');
    expect(o.topIds.sort()).toEqual(['fake-a', 'fake-b']);
    expect(predictionHeld(o, 'fake-a')).toBe(true);
    expect(predictionHeld(o, 'third')).toBe(false);
    expect(predictionHeld(o, 'same')).toBe(false);
    expect(o.allSame).toBe(false);
  });
  it('"about the same" holds only when every area is level', () => {
    const o = surveyOutcome(level([2, 2]), '2024');
    expect(o.allSame).toBe(true);
    expect(predictionHeld(o, 'same')).toBe(true);
  });
  it('a clear winner holds only for that reef', () => {
    const o = surveyOutcome(R.reefs, '2024');
    expect(predictionHeld(o, 'fake-b')).toBe(true);
    expect(predictionHeld(o, 'fake-a')).toBe(false);
  });
  it('no survey data means nothing can hold', () => {
    expect(predictionHeld(surveyOutcome(R.reefs, '1999'), 'fake-a')).toBe(false);
  });
});

describe('time ticks', () => {
  it('month ticks start on the first of a month and are thinned', () => {
    const t = monthTicks(2023.9, 2025.1, 7);
    expect(t.length).toBeLessThanOrEqual(7);
    for (const x of t) expect(yearToDayLabel(x).startsWith('1 ')).toBe(true);
  });
  it('labels a decimal year with a day and month', () => {
    expect(yearToDayLabel(2024.0)).toBe('1 Jan');
    expect(yearToDayLabel(isoToYear('2024-03-15'))).toBe('15 Mar');
    expect(yearToDayLabel(isoToYear('2023-11-01'))).toBe('1 Nov');
    expect(yearToDayLabel(isoToYear('2023-12-01'))).toBe('1 Dec');
  });
});

describe('buoy', () => {
  it('computes mean and largest difference', () => {
    const s = buoyStats(B);
    expect(s.meanDiff).toBeCloseTo(0.5, 6);
    expect(s.maxAbsDiff).toBeCloseTo(0.5, 6);
    expect(s.n).toBe(30);
    expect(s.peakSatellite).toBeGreaterThan(s.peakLogger);
  });
});

describe('sea level', () => {
  it('takes annual means only for complete years', () => {
    const a = annualMeans(S.gmsl);
    expect(a[0].year).toBe(1993);
    expect(a.every((x) => x.year >= 1993)).toBe(true);
    expect(a.map((x) => x.year)).toEqual([...new Set(a.map((x) => x.year))]);
  });
  it('drops a partial first or last year', () => {
    const cut = S.gmsl.filter((p) => p.t_year >= 1993.5 && p.t_year < 2020.4);
    const a = annualMeans(cut);
    expect(a[0].year).toBe(1994);
    expect(a[a.length - 1].year).toBe(2019);
  });
  it('finds the ENSO-style dip pair (the trap)', () => {
    const pair = findDropPair(annualMeans(S.gmsl))!;
    expect(pair.y0).toBe(2010);
    expect(pair.y1).toBe(2011);
    expect(pair.delta_mm).toBeLessThan(0);
  });
  it('shows acceleration in the window rates', () => {
    const early = windowRate(S.gmsl, 1993, 2002)!;
    const late = windowRate(S.gmsl, 2015, 2024)!;
    expect(late).toBeGreaterThan(early);
    expect(windowRate(S.gmsl, 1800, 1801)).toBeNull();
  });
  it('parses window keys, with a fallback', () => {
    expect(parseWindows({ '1993-2002': 2, '2015-2024': 5 })).toEqual([[1993, 2002], [2015, 2024]]);
    expect(parseWindows({})).toEqual([[1993, 2002], [2015, 2024]]);
    expect(parseWindows({ '2015-2024': 5, '1993-2002': 2, '2003-2014': 3 })).toEqual([[1993, 2002], [2015, 2024]]);
  });
  it('findDropPair needs consecutive years', () => {
    expect(findDropPair([{ year: 2000, mean_mm: 1 }, { year: 2002, mean_mm: 0 }])).toBeNull();
    expect(findDropPair([])).toBeNull();
  });
});

describe('sea ice', () => {
  it('finds record years', () => {
    const r = seriesRecords(I.antarctic.sep_max)!;
    expect(r.high.year).toBe(2014);
    expect(r.low.year).toBe(2023);
    expect(seriesRecords([])).toBeNull();
  });
  it('measures a falling Arctic trend per decade', () => {
    const t = seaIceTrend(I.arctic.sep)!;
    expect(t.mkm2PerDecade).toBeCloseTo(-0.6, 6);
    expect(t.pctPerDecade).toBeLessThan(0);
  });
});

describe('data validation', () => {
  it('accepts well-formed fixtures', () => {
    expect(validate('reef', R)).toBe(true);
    expect(validate('buoy', B)).toBe(true);
    expect(validate('sealevel', S)).toBe(true);
    expect(validate('seaice', I)).toBe(true);
  });
  it('rejects broken shapes instead of throwing', () => {
    expect(validate('reef', {})).toBe(false);
    expect(validate('reef', null)).toBe(false);
    expect(validate('buoy', { series: [] })).toBe(false);
    expect(validate('sealevel', { gmsl: [] })).toBe(false);
    expect(validate('forest', { cases: [] })).toBe(false);
    expect(validate('seaice', { antarctic: {} })).toBe(false);
  });
});
