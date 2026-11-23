import { describe, expect, it } from 'vitest';
import { CLAIMS, EVIDENCE, LIMITATIONS, type ClaimId } from '../src/content';
import {
  EVIDENCE_MAX, EVIDENCE_MIN, ITEMS, PEAK_TOLERANCE, RATIO_TOLERANCE, briefingMax, claimById, commitPoints, evidenceById, itemMax,
  limitationMatch, relevanceOf, scoreBriefing, scoreLimitSelection, scorePrediction, scoreQuantified, strengthPoints, summarise, summaryText, totals, withinTolerance,
} from '../src/scoring';
import { award, defaultState } from '../src/state';

const best = (claim: ClaimId) => {
  const c = claimById(claim)!;
  const core = EVIDENCE.filter((e) => e.rel[claim] === 'core').slice(0, 2).map((e) => e.id);
  const lim = LIMITATIONS.find((l) => l.match[claim] === 'primary')!.id;
  return { claimId: claim, strength: c.justified, evidenceIds: core, limitationId: lim };
};

describe('strength scoring is symmetric', () => {
  it('gives full marks at the justified strength', () => {
    for (const c of CLAIMS) expect(strengthPoints(c.justified, c.justified)).toBe(3);
  });
  it('penalises one step over exactly as much as one step under', () => {
    for (let j = 1; j <= 2; j++) expect(strengthPoints(j + 1, j)).toBe(strengthPoints(j - 1, j));
  });
  it('penalises two steps over exactly as much as two steps under', () => {
    expect(strengthPoints(3, 1)).toBe(strengthPoints(0, 2) === strengthPoints(3, 1) ? strengthPoints(0, 2) : -1);
    expect(strengthPoints(3, 1)).toBe(0);
    expect(strengthPoints(0, 2)).toBe(0);
  });
  it('through scoreBriefing: over and under by one step cost the same points', () => {
    const base = best('c-sea'); // justified = 2
    const over = scoreBriefing({ ...base, strength: 3 });
    const under = scoreBriefing({ ...base, strength: 1 });
    expect(over.strength.points).toBe(under.strength.points);
    expect(over.strength.direction).toBe('over');
    expect(under.strength.direction).toBe('under');
    expect(over.total).toBe(under.total);
  });
  it('"proves" is never the honest strength for any claim', () => {
    for (const c of CLAIMS) expect(c.justified).toBeLessThan(3);
  });
});

describe('evidence scoring', () => {
  it('two core cards score the evidence maximum', () => {
    const r = scoreBriefing(best('c-reef'));
    expect(r.evidence.points).toBe(itemMax('briefing.evidence'));
    expect(r.evidence.coreCount).toBe(2);
  });
  it('an irrelevant card costs a point', () => {
    const base = best('c-reef');
    const clean = scoreBriefing({ ...base, evidenceIds: [base.evidenceIds[0], EVIDENCE.find((e) => e.rel['c-reef'] === 'support')!.id] });
    const dirty = scoreBriefing({ ...base, evidenceIds: [base.evidenceIds[0], EVIDENCE.find((e) => !e.rel['c-reef'] && !e.trap)!.id] });
    expect(clean.evidence.points).toBe(3);
    expect(dirty.evidence.points).toBe(1);
    expect(dirty.evidence.irrelevantCount).toBe(1);
  });
  it('the cherry-picked pair is penalised for every claim', () => {
    const trap = EVIDENCE.find((e) => e.trap)!;
    for (const c of CLAIMS) expect(relevanceOf(trap, c.id)).toBe('none');
    const r = scoreBriefing({ ...best('c-sea'), evidenceIds: [best('c-sea').evidenceIds[0], trap.id] });
    expect(r.evidence.cards.find((c) => c.id === trap.id)!.points).toBe(-1);
    expect(r.evidence.cards.find((c) => c.id === trap.id)!.trap).toBe(true);
  });
  it('never goes below zero or above the maximum', () => {
    const junk = EVIDENCE.filter((e) => !e.rel['c-ice']).slice(0, 3).map((e) => e.id);
    expect(scoreBriefing({ ...best('c-ice'), evidenceIds: junk }).evidence.points).toBe(0);
    const three = EVIDENCE.filter((e) => e.rel['c-sea'] === 'core').slice(0, 3).map((e) => e.id);
    expect(three.length).toBeGreaterThan(0);
    expect(scoreBriefing({ ...best('c-sea'), evidenceIds: three }).evidence.points).toBeLessThanOrEqual(4);
  });
  it('evidence for a different claim does not count as core', () => {
    const seaCore = EVIDENCE.find((e) => e.rel['c-sea'] === 'core')!;
    expect(relevanceOf(seaCore, 'c-reef')).toBe('none');
  });
});

describe('limitation must match the claim', () => {
  it('primary beats related beats mismatch', () => {
    const base = best('c-forest');
    const primary = scoreBriefing(base).limitation;
    const related = scoreBriefing({ ...base, limitationId: 'l-resprout' }).limitation;
    const mismatch = scoreBriefing({ ...base, limitationId: 'l-thick' }).limitation;
    expect(primary.match).toBe('primary');
    expect(related.match).toBe('related');
    expect(mismatch.match).toBe('none');
    expect(primary.points).toBeGreaterThan(related.points);
    expect(related.points).toBeGreaterThan(mismatch.points);
  });
  it('a generic limitation matches nothing', () => {
    for (const c of CLAIMS) expect(limitationMatch(LIMITATIONS.find((l) => l.id === 'l-generic')!, c.id)).toBe('none');
  });
  it('the same limitation can be right for one claim and wrong for another', () => {
    expect(scoreBriefing({ ...best('c-ice'), limitationId: 'l-thick' }).limitation.match).toBe('primary');
    expect(scoreBriefing({ ...best('c-reef'), limitationId: 'l-thick' }).limitation.match).toBe('none');
  });
});

describe('whole briefing', () => {
  it('a perfect briefing scores the maximum for every claim', () => {
    for (const c of CLAIMS) {
      const r = scoreBriefing(best(c.id));
      expect(r.valid).toBe(true);
      expect(r.total).toBe(briefingMax());
      expect(r.max).toBe(10);
    }
  });
  it('is deterministic', () => {
    const a = scoreBriefing({ ...best('c-sea'), strength: 3 });
    const b = scoreBriefing({ ...best('c-sea'), strength: 3 });
    expect(a).toEqual(b);
  });
  it('is order independent for evidence', () => {
    const b = best('c-sea');
    const r1 = scoreBriefing({ ...b, evidenceIds: [...b.evidenceIds] });
    const r2 = scoreBriefing({ ...b, evidenceIds: [...b.evidenceIds].reverse() });
    expect(r1.total).toBe(r2.total);
  });
  it('rejects too few or too many evidence cards, a missing limitation, or no strength', () => {
    const b = best('c-sea');
    expect(scoreBriefing({ ...b, evidenceIds: [b.evidenceIds[0]] }).valid).toBe(false);
    expect(scoreBriefing({ ...b, evidenceIds: EVIDENCE.slice(0, EVIDENCE_MAX + 1).map((e) => e.id) }).valid).toBe(false);
    expect(scoreBriefing({ ...b, limitationId: '' }).valid).toBe(false);
    expect(scoreBriefing({ ...b, strength: -1 }).valid).toBe(false);
    expect(scoreBriefing({ ...b, claimId: 'nope' }).valid).toBe(false);
    expect(scoreBriefing({ ...b, evidenceIds: ['x', 'y'] }).valid).toBe(false);
    expect(EVIDENCE_MIN).toBe(2);
  });
  it('duplicates in evidence ids are ignored', () => {
    const b = best('c-sea');
    expect(scoreBriefing({ ...b, evidenceIds: [b.evidenceIds[0], b.evidenceIds[0]] }).valid).toBe(false);
  });
  it('overclaiming "proves" on a strong claim loses points but not all of them', () => {
    const r = scoreBriefing({ ...best('c-ice'), strength: 3 });
    expect(r.strength.points).toBe(1);
    expect(r.total).toBe(briefingMax() - 2);
    expect(r.messages[0]).toMatch(/more than the evidence/);
  });
  it('claiming "no evidence" for a strongly supported claim loses points too', () => {
    const r = scoreBriefing({ ...best('c-sea'), strength: 0 });
    expect(r.strength.points).toBe(0);
    expect(r.strength.direction).toBe('under');
  });
});

describe('content integrity', () => {
  it('every claim has at least two core cards and a primary limitation', () => {
    for (const c of CLAIMS) {
      expect(EVIDENCE.filter((e) => e.rel[c.id] === 'core').length).toBeGreaterThanOrEqual(2);
      expect(LIMITATIONS.filter((l) => l.match[c.id] === 'primary').length).toBeGreaterThanOrEqual(1);
    }
  });
  it('ids are unique', () => {
    const all = [...CLAIMS.map((c) => c.id), ...EVIDENCE.map((e) => e.id), ...LIMITATIONS.map((l) => l.id)];
    expect(new Set(all).size).toBe(all.length);
  });
  it('lookups work', () => {
    expect(evidenceById('e-gmsl')).toBeTruthy();
    expect(claimById('nope')).toBeUndefined();
  });
  it('there are more irrelevant cards than any claim has relevant ones, so guessing is risky', () => {
    for (const c of CLAIMS) {
      const rel = EVIDENCE.filter((e) => !e.trap && e.rel[c.id]).length;
      expect(EVIDENCE.length - rel).toBeGreaterThan(rel);
    }
  });
});

describe('predictions score for commitment, not correctness', () => {
  it('any committed choice with a confidence earns full points', () => {
    expect(scorePrediction('fake-a', 1)).toBe(itemMax('reef.predict'));
    expect(scorePrediction('fake-b', 3)).toBe(itemMax('reef.predict'));
  });
  it('an uncommitted prediction earns nothing', () => {
    expect(scorePrediction(undefined, 2)).toBe(0);
    expect(scorePrediction('fake-a', undefined)).toBe(0);
  });
  it('confidence does not change the score', () => {
    expect(scorePrediction('x', 1)).toBe(scorePrediction('x', 3));
  });
  it('commitPoints', () => {
    expect(commitPoints(true, 2)).toBe(2);
    expect(commitPoints(false, 2)).toBe(0);
  });
});

describe('tolerance checks', () => {
  it('accepts values within the larger of absolute and relative tolerance', () => {
    expect(withinTolerance(10.4, 10, PEAK_TOLERANCE)).toBe(true);
    expect(withinTolerance(11.0, 10, PEAK_TOLERANCE)).toBe(true); // 10% of 10 = 1
    expect(withinTolerance(11.2, 10, PEAK_TOLERANCE)).toBe(false);
    expect(withinTolerance(0.4, 0, PEAK_TOLERANCE)).toBe(true);
  });
  it('rejects non-finite input', () => {
    expect(withinTolerance(NaN, 5, PEAK_TOLERANCE)).toBe(false);
    expect(withinTolerance(5, Infinity, PEAK_TOLERANCE)).toBe(false);
  });
  it('quantified comparison scores peak and ratio separately', () => {
    const t = { peak: 10, ratio: 2 };
    expect(scoreQuantified({ peak: 10, ratio: 2 }, t).points).toEqual({ peak: 2, ratio: 1 });
    expect(scoreQuantified({ peak: 10, ratio: 5 }, t).points).toEqual({ peak: 2, ratio: 0 });
    expect(scoreQuantified({ peak: 3, ratio: 2.1 }, t).points).toEqual({ peak: 0, ratio: 1 });
    expect(scoreQuantified({ peak: 3, ratio: 2.1 }, t).peakOk).toBe(false);
  });
  it('ratio is waived when the lower reef is near zero', () => {
    const r = scoreQuantified({ peak: 5, ratio: 0 }, { peak: 5, ratio: null });
    expect(r.ratioOk).toBe(true);
  });
  it('tolerance constants are sensible', () => {
    expect(PEAK_TOLERANCE.abs).toBeGreaterThan(0);
    expect(RATIO_TOLERANCE.rel).toBeLessThan(0.5);
  });
});

describe('limitation selection (reef)', () => {
  it('rewards valid picks and caps at the item maximum', () => {
    expect(scoreLimitSelection(['risk']).points).toBe(1);
    expect(scoreLimitSelection(['risk', 'depth']).points).toBe(2);
    expect(scoreLimitSelection(['risk', 'depth', 'history', 'oneyear']).points).toBe(2);
  });
  it('penalises invalid picks, never below zero', () => {
    expect(scoreLimitSelection(['risk', 'depth', 'cannot']).points).toBe(1);
    expect(scoreLimitSelection(['cannot', 'hottest', 'wrong']).points).toBe(0);
  });
  it('ignores unknown and duplicate ids', () => {
    expect(scoreLimitSelection(['risk', 'risk', 'zzz']).points).toBe(1);
  });
});

describe('first attempts only', () => {
  it('award writes once and later attempts cannot change the score', () => {
    const s = defaultState();
    expect(award(s, 'reef.peak', 0)).toBe(true);
    expect(award(s, 'reef.peak', 2)).toBe(false);
    expect(s.scores['reef.peak']).toBe(0);
  });
});

describe('totals and summary', () => {
  it('the maximum is the sum of all item maxima plus the sensor stations', () => {
    const s = defaultState();
    const sum = ITEMS.reduce((a, i) => a + i.max, 0) + 4;
    expect(totals(s).max).toBe(sum);
    expect(totals(s).earned).toBe(0);
  });
  it('counts sensor stations once each and caps at four', () => {
    const s = defaultState();
    s.sensorLab.stationsDone = ['a', 'b', 'a', 'c', 'd', 'e'];
    expect(summarise(s).find((x) => x.part === 'sensor-lab')!.earned).toBe(4);
  });
  it('clamps stored scores to the item maximum', () => {
    const s = defaultState();
    s.scores['reef.peak'] = 99;
    expect(summarise(s).find((x) => x.part === 'reef')!.earned).toBe(itemMax('reef.peak'));
  });
  it('summary text includes totals and the briefing', () => {
    const s = defaultState();
    s.name = 'Test Student';
    const b = best('c-sea');
    s.briefing.first = { ...b, freeText: 'Check local gauges next.', evidence: b.evidenceIds, points: 10, max: 10 };
    const t = summaryText(s);
    expect(t).toContain('Test Student');
    expect(t).toContain('Total: 0 /');
    expect(t).toContain('Strongly supports');
    expect(t).toContain('Check local gauges next.');
  });
});
