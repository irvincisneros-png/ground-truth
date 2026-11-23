import { describe, expect, it } from 'vitest';
import * as C from '../src/content';
import { assetPath } from '../src/parts/transfer-forest';

describe('question content', () => {
  const checks: [string, C.Option[]][] = [
    ['LAUNCH_GUESS', C.LAUNCH_GUESS], ['REEF_WHY', C.REEF_WHY], ['SEA_CONCLUSION', C.SEA_CONCLUSION], ['SEA_GAUGE', C.SEA_GAUGE],
    ['FOREST_CAUTION', C.FOREST_CAUTION], ['ICE_STATEMENT', C.ICE_STATEMENT], ['ICE_SHEET', C.ICE_SHEET],
  ];
  for (const [name, opts] of checks) {
    it(`${name} has exactly one correct option and unique ids`, () => {
      expect(opts.filter((o) => o.correct).length).toBe(1);
      expect(new Set(opts.map((o) => o.id)).size).toBe(opts.length);
    });
  }
  it('commitment questions have no right answer to leak', () => {
    for (const o of [...C.SEA_PAIR_GUESS, ...C.FOREST_GUESS, ...C.ICE_GUESS, ...C.FOREST_CLASSIFY]) expect(o.correct).toBeUndefined();
  });
  it('reef limitation options include both valid and invalid picks', () => {
    expect(C.REEF_LIMITS.some((o) => o.valid)).toBe(true);
    expect(C.REEF_LIMITS.some((o) => !o.valid)).toBe(true);
  });
  it('names the regional-versus-reef-scale caveat as a valid reef limitation', () => {
    const scale = C.REEF_LIMITS.find((o) => o.id === 'scale');
    expect(scale?.valid).toBe(true);
    expect(scale?.text).toMatch(/regional/i);
  });
  it('strengths run from none to proves in order', () => {
    expect(C.STRENGTHS.map((s) => s.value)).toEqual([0, 1, 2, 3]);
  });
});

describe('First Nations content stays behind ?draft', () => {
  it('flags every First Nations item as a draft', () => {
    const fn = C.USES.filter((u) => /ranger|Torres Strait/i.test(u.title));
    expect(fn.length).toBeGreaterThan(0);
    for (const u of fn) expect(u.draftFN).toBe(true);
    expect(C.DRAFT_FN).toBe(true);
  });
  it('has non-draft use items that do not mention Indigenous groups', () => {
    for (const u of C.USES.filter((x) => !x.draftFN)) expect(u.text + u.title).not.toMatch(/indigenous|torres strait|aboriginal/i);
  });
});

describe('lesson text hygiene', () => {
  const all = JSON.stringify([C.CLAIMS, C.EVIDENCE, C.LIMITATIONS, C.USES, C.LAUNCH_REVEAL]);
  it('has no emoji and no American spellings we avoid', () => {
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(all).not.toMatch(/\b(center|meter|color|gray)\b/i);
  });
});

describe('forest asset paths', () => {
  it('normalises paths relative to public/data', () => {
    expect(assetPath('forest/a.png')).toBe('forest/a.png');
    expect(assetPath('/data/forest/a.png')).toBe('forest/a.png');
    expect(assetPath('public/data/forest/a.png')).toBe('forest/a.png');
  });
});
