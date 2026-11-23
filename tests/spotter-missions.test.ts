import { describe, expect, it } from 'vitest';
import realSea from '../public/data/sealevel.json';
import { EYES, EYE_IDS, FINISH_LINE, GLOSSARY, MISSIONS, NEW_WORDS, STEP_COUNT } from '../src/spotter/missions';
import { levelAtCm, latestYear, readoutAt } from '../src/spotter/sealevel';
import { normaliseImages } from '../src/spotter/images';
import { pickVoice } from '../src/spotter/speech';
import type { GmslPoint } from '../src/data/types';

const wordCount = (t: string) => t.trim().split(/\s+/).length;

describe('Satellite Spotter mission content', () => {
  it('has four missions in the spec order', () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(['ice', 'forest', 'sea', 'reef']);
    expect(MISSIONS.map((m) => m.n)).toEqual([1, 2, 3, 4]);
    expect(STEP_COUNT).toBe(5);
  });

  it('every mission has exactly one best eye, and a reason for each of the other three', () => {
    for (const m of MISSIONS) {
      expect(EYE_IDS).toContain(m.bestEye);
      expect(Object.keys(m.reasons).sort()).toEqual([...EYE_IDS].sort());
      for (const id of EYE_IDS) expect(m.reasons[id].length).toBeGreaterThan(8);
      expect(EYE_IDS.filter((id) => id === m.bestEye)).toHaveLength(1);
    }
  });

  it('the best eyes are the ones the spec names', () => {
    expect(MISSIONS.map((m) => m.bestEye)).toEqual(['microwave', 'colour', 'radar', 'heat']);
  });

  it('every sentence blank has exactly one correct chip, unique chip words, and a hint on every wrong chip', () => {
    for (const m of MISSIONS) {
      const used = m.frame.parts.filter((p): p is number => typeof p === 'number');
      expect(used.sort()).toEqual(m.frame.blanks.map((_, i) => i));
      expect(m.frame.blanks.length).toBeGreaterThanOrEqual(2);
      expect(m.frame.blanks.length).toBeLessThanOrEqual(3);
      for (const b of m.frame.blanks) {
        expect(b.chips.filter((c) => c.correct)).toHaveLength(1);
        expect(new Set(b.chips.map((c) => c.text)).size).toBe(b.chips.length);
        expect(b.chips.length).toBeGreaterThanOrEqual(2);
        expect(b.chips.length).toBeLessThanOrEqual(3);
        for (const c of b.chips) if (!c.correct) expect(c.hint && c.hint.length > 5).toBe(true);
      }
    }
  });

  it('the correct chip does not always sit first', () => {
    const idx = MISSIONS.flatMap((m) => m.frame.blanks.map((b) => b.chips.findIndex((c) => c.correct)));
    expect(idx.some((i) => i > 0)).toBe(true);
    expect(idx.some((i) => i === 0)).toBe(true);
  });

  it('forest frame says hot, dry weather made fires more likely and climate change makes it more common (attribution wording)', () => {
    const f = MISSIONS[1].frame;
    const text = f.parts.map((p) => (typeof p === 'number' ? '_' : p)).join('');
    expect(text).toMatch(/Hot, dry weather made the fires _ likely/);
    expect(text).toMatch(/climate change makes hot, dry weather _ common/);
    expect(text).not.toMatch(/caused/i);
  });

  it('only the reef mission has the bonus question, and the reveal lists the real bleaching years', () => {
    expect(MISSIONS.filter((m) => m.bonus).map((m) => m.id)).toEqual(['reef']);
    const b = MISSIONS[3].bonus!;
    expect(b.answer).toBe('no');
    for (const y of [1998, 2002, 2016, 2017, 2020, 2022, 2024, 2025]) expect(b.reveal).toContain(String(y));
  });

  it('keeps screen text short: wrong-eye reasons and chip hints are one sentence', () => {
    for (const m of MISSIONS) {
      for (const id of EYE_IDS) expect(wordCount(m.reasons[id])).toBeLessThanOrEqual(14);
      for (const b of m.frame.blanks) for (const c of b.chips) if (c.hint) expect(wordCount(c.hint)).toBeLessThanOrEqual(20);
    }
    expect(wordCount(FINISH_LINE)).toBeLessThanOrEqual(16);
  });

  it('uses no emoji anywhere in the student-facing text', () => {
    const all = JSON.stringify([MISSIONS, EYES, GLOSSARY]);
    expect(all).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('the glossary has the six words from the spec and every "new word" step points at one', () => {
    expect(GLOSSARY.map((g) => g.id)).toEqual(['satellite', 'sensor', 'data', 'climate-change', 'sea-ice', 'coral-bleaching']);
    const ids = new Set(GLOSSARY.map((g) => g.id));
    for (const steps of Object.values(NEW_WORDS)) for (const id of Object.values(steps ?? {})) expect(ids.has(id as string)).toBe(true);
  });

  it('every eye points at a real globe satellite spec', async () => {
    const { SATELLITES } = await import('../src/globe/orbits');
    for (const id of EYE_IDS) expect(SATELLITES[EYES[id].satKey]).toBeTruthy();
  });
});

describe('sea level mission uses the real data', () => {
  const g = (realSea as unknown as { gmsl: GmslPoint[] }).gmsl.filter((p) => p.t_year >= 1993);

  it('1993 starts near zero and the latest reading rounds to the "about 10 cm" caption', () => {
    expect(Math.abs(levelAtCm(g, 1993.3))).toBeLessThan(0.5);
    expect(Math.round(levelAtCm(g, latestYear(g) - 0.25))).toBe(10);
  });

  it('the slider readout rises with the slider', () => {
    expect(readoutAt(g, 0)).toMatch(/0 cm/);
    expect(readoutAt(g, 100)).toMatch(/10 cm/);
    const mid = Number(/about (\d+) cm/.exec(readoutAt(g, 50))![1]);
    expect(mid).toBeGreaterThan(2);
    expect(mid).toBeLessThan(8);
  });
});

describe('image manifest handling', () => {
  const pair = (id: string) => ({ id, before: { file: `${id}-before.webp`, label: '1984' }, after: { file: `${id}-after.webp`, label: '2023' }, caption: 'c', credit: 'NASA', licence: 'Public domain', sourceUrl: 'https://x.test' });
  it('accepts an array, a wrapper object, or a keyed object', () => {
    expect(Object.keys(normaliseImages([pair('ice'), pair('reef')]))).toEqual(['ice', 'reef']);
    expect(Object.keys(normaliseImages({ images: [pair('forest')] }))).toEqual(['forest']);
    expect(Object.keys(normaliseImages({ ice: { ...pair('ice'), id: undefined } }))).toEqual(['ice']);
  });
  it('drops broken entries and never invents images', () => {
    expect(normaliseImages(null)).toEqual({});
    expect(normaliseImages([{ id: 'ice', before: { file: 'a.webp' } }])).toEqual({});
    expect(normaliseImages('nope')).toEqual({});
  });
});

describe('read-aloud voice choice', () => {
  it('prefers en-AU, then other English, else none', () => {
    const v = (lang: string) => ({ lang, name: lang });
    expect(pickVoice([v('en-US'), v('en-AU'), v('en-GB')])?.lang).toBe('en-AU');
    expect(pickVoice([v('fr-FR'), v('en_GB')])?.lang).toBe('en_GB');
    expect(pickVoice([v('fr-FR'), v('de-DE')])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
});
