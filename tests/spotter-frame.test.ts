import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../src/spotter/missions';
import { checkFrame, correctWords, fillFrame } from '../src/spotter/frame';
import { buildReportText } from '../src/spotter/report';
import { earnStamp, defaultState } from '../src/spotter/state';

describe('sentence checking', () => {
  it('the correct words pass for every mission', () => {
    for (const m of MISSIONS) {
      const r = checkFrame(m.frame, correctWords(m.frame));
      expect(r.allRight).toBe(true);
      expect(r.complete).toBe(true);
      expect(r.hints.every((h) => h === null)).toBe(true);
    }
  });

  it('empty blanks are not wrong, just empty', () => {
    const f = MISSIONS[0].frame;
    const r = checkFrame(f, [null, null]);
    expect(r.verdicts).toEqual(['empty', 'empty']);
    expect(r.complete).toBe(false);
    expect(r.allRight).toBe(false);
  });

  it('a wrong chip is flagged with its own hint, the right one is not', () => {
    const f = MISSIONS[0].frame; // shrinking / warmer
    const r = checkFrame(f, ['growing', 'warmer']);
    expect(r.verdicts).toEqual(['wrong', 'right']);
    expect(r.hints[0]).toMatch(/white ice/);
    expect(r.hints[1]).toBeNull();
    expect(r.complete).toBe(true);
    expect(r.allRight).toBe(false);
  });

  it('every wrong chip in every mission is caught and gives its hint', () => {
    for (const m of MISSIONS) {
      m.frame.blanks.forEach((b, bi) => {
        for (const c of b.chips.filter((x) => !x.correct)) {
          const words = correctWords(m.frame);
          words[bi] = c.text;
          const r = checkFrame(m.frame, words);
          expect(r.verdicts[bi]).toBe('wrong');
          expect(r.hints[bi]).toBe(c.hint);
          expect(r.allRight).toBe(false);
        }
      });
    }
  });

  it('the same word can be right in one blank and wrong in another (forest "more")', () => {
    const f = MISSIONS[1].frame; // burnt / more / more
    expect(checkFrame(f, ['burnt', 'more', 'more']).allRight).toBe(true);
    expect(checkFrame(f, ['burnt', 'less', 'more']).verdicts).toEqual(['right', 'wrong', 'right']);
  });

  it('fills the frame into one readable sentence', () => {
    expect(fillFrame(MISSIONS[0].frame, ['shrinking', 'warmer'])).toBe('The satellite shows the Arctic sea ice is shrinking. This is because Earth is getting warmer.');
    expect(fillFrame(MISSIONS[3].frame, ['hot', 'bleached'])).toBe('The satellite shows the sea was too hot, so the coral bleached.');
    expect(fillFrame(MISSIONS[2].frame, [null, null])).toContain('...');
  });
});

describe('report card text', () => {
  it('lists stamps, sentences, the name and the finishing line', () => {
    let s = defaultState();
    s.name = 'Sam';
    MISSIONS.forEach((m, i) => { s = earnStamp(s, i, correctWords(m.frame)); });
    const t = buildReportText(s, '24 November 2026');
    expect(t).toContain('Name: Sam');
    expect(t).toContain('Date: 24 November 2026');
    expect(t).toContain('Stamps: 4 of 4');
    expect(t).toContain('The satellite shows the sea is rising.');
    expect(t).toContain('just like real scientists.');
  });
  it('says so when a mission is unfinished', () => {
    expect(buildReportText(defaultState(), 'today')).toContain('Not finished yet.');
  });
});
