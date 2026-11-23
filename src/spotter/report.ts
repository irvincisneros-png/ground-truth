/** The report card text (used by Copy) and today's date. Pure. */
import { FINISH_LINE, MISSIONS } from './missions';
import { fillFrame } from './frame';
import type { SpotterState } from './state';

export const todayText = (d = new Date()): string => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

/** One full sentence for a finished mission, or null if not done. */
export function missionSentence(s: SpotterState, i: number): string | null {
  const w = s.sentences[i];
  return w ? fillFrame(MISSIONS[i].frame, w) : null;
}

export function buildReportText(s: SpotterState, date = todayText()): string {
  const lines = ['Satellite Spotter report card', s.name.trim() ? `Name: ${s.name.trim()}` : 'Name: ________', `Date: ${date}`, ''];
  MISSIONS.forEach((m, i) => {
    const t = missionSentence(s, i);
    lines.push(`Mission ${m.n}, ${m.title}: ${m.problem}`, t ? `Stamp earned. ${t}` : 'Not finished yet.', '');
  });
  lines.push(`Stamps: ${s.stamps.filter(Boolean).length} of ${MISSIONS.length}`, FINISH_LINE);
  return lines.join('\n');
}
