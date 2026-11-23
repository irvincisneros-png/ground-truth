/**
 * Deterministic scoring. Pure functions: no DOM, no clock, no randomness.
 * Principles (docs/SPEC.md): predictions score for commitment, not correctness; only first attempts score;
 * overclaiming is penalised exactly as much as underclaiming; irrelevant evidence is penalised;
 * the limitation must match the claim.
 */
import {
  CLAIMS, EVIDENCE, LIMITATIONS, REEF_LIMITS, STRENGTHS,
  type Claim, type ClaimId, type EvidenceCard, type LimitationCard, type Relevance, type Strength,
} from './content';
import { PARTS, type PartId, type Progress } from './state';

/* ---------- item table: every scoreable item and its maximum ---------- */

export interface ItemDef {
  key: string;
  part: PartId;
  max: number;
  label: string;
}
export const ITEMS: ItemDef[] = [
  { key: 'launch.guess', part: 'launch', max: 1, label: 'Committed an answer to the hook question' },
  { key: 'reef.predict', part: 'reef', max: 2, label: 'Committed a prediction with a confidence level' },
  { key: 'reef.flight', part: 'reef', max: 1, label: 'Chose a survey flight' },
  { key: 'reef.why', part: 'reef', max: 2, label: 'Explained why logger and satellite differ' },
  { key: 'reef.peak', part: 'reef', max: 2, label: 'Read the peak heat stress from the graph' },
  { key: 'reef.ratio', part: 'reef', max: 1, label: 'Compared the two peaks as a ratio' },
  { key: 'reef.limits', part: 'reef', max: 2, label: 'Picked valid limitations' },
  { key: 'sea.pair', part: 'sea', max: 1, label: 'Committed a reading of the two-year pair' },
  { key: 'sea.conclusion', part: 'sea', max: 2, label: 'Judged what the long record shows' },
  { key: 'sea.gauge', part: 'sea', max: 1, label: 'Explained the tide gauge difference' },
  { key: 'forest.guess', part: 'forest', max: 1, label: 'Committed a guess from the loss pixels' },
  { key: 'forest.classify.0', part: 'forest', max: 1, label: 'Classified the first crop' },
  { key: 'forest.classify.1', part: 'forest', max: 1, label: 'Classified the second crop' },
  { key: 'forest.caution', part: 'forest', max: 1, label: 'Stated what the attribution research says' },
  { key: 'ice.guess', part: 'ice', max: 1, label: 'Committed a view on the Antarctic record' },
  { key: 'ice.statement', part: 'ice', max: 2, label: 'Judged the two poles against the long record' },
  { key: 'ice.sheet', part: 'ice', max: 1, label: 'Separated sea ice from ice sheets' },
  { key: 'briefing.strength', part: 'briefing', max: 3, label: 'Matched claim strength to the evidence' },
  { key: 'briefing.evidence', part: 'briefing', max: 4, label: 'Chose relevant evidence' },
  { key: 'briefing.limitation', part: 'briefing', max: 3, label: 'Chose a limitation that fits the claim' },
];
export const SENSOR_STATIONS = 4;
const SENSOR_MAX = SENSOR_STATIONS;

export function itemMax(key: string): number {
  return ITEMS.find((i) => i.key === key)?.max ?? 0;
}

/* ---------- small building blocks ---------- */

/** Commitment scores: any committed answer earns the full points, right or wrong. */
export function commitPoints(committed: boolean, max: number): number {
  return committed ? max : 0;
}

/** Confidence adds nothing to the score: only the act of committing does. */
export function scorePrediction(choice: string | undefined, confidence: number | undefined): number {
  return choice && confidence ? itemMax('reef.predict') : 0;
}

export interface Tolerance {
  abs: number;
  rel: number;
}
/** True if |answer - truth| is within the larger of the absolute and relative tolerances. */
export function withinTolerance(answer: number, truth: number, tol: Tolerance): boolean {
  if (!Number.isFinite(answer) || !Number.isFinite(truth)) return false;
  return Math.abs(answer - truth) <= Math.max(tol.abs, Math.abs(truth) * tol.rel);
}
export const PEAK_TOLERANCE: Tolerance = { abs: 0.5, rel: 0.1 };
export const RATIO_TOLERANCE: Tolerance = { abs: 0.1, rel: 0.08 };

export function scoreQuantified(
  answer: { peak: number; ratio: number },
  truth: { peak: number; ratio: number | null },
): { peakOk: boolean; ratioOk: boolean; points: { peak: number; ratio: number } } {
  const peakOk = withinTolerance(answer.peak, truth.peak, PEAK_TOLERANCE);
  const ratioOk = truth.ratio === null ? true : withinTolerance(answer.ratio, truth.ratio, RATIO_TOLERANCE);
  return { peakOk, ratioOk, points: { peak: peakOk ? itemMax('reef.peak') : 0, ratio: ratioOk ? itemMax('reef.ratio') : 0 } };
}

/** One point per valid pick (at most the item maximum), minus one per invalid pick, never below zero. */
export function scoreLimitSelection(picked: string[]): { points: number; validPicked: string[]; invalidPicked: string[] } {
  const validIds = new Set(REEF_LIMITS.filter((o) => o.valid).map((o) => o.id));
  const known = new Set(REEF_LIMITS.map((o) => o.id));
  const unique = [...new Set(picked)].filter((id) => known.has(id));
  const validPicked = unique.filter((id) => validIds.has(id));
  const invalidPicked = unique.filter((id) => !validIds.has(id));
  const raw = Math.min(validPicked.length, itemMax('reef.limits')) - invalidPicked.length;
  return { points: Math.max(0, raw), validPicked, invalidPicked };
}

/* ---------- Minister briefing ---------- */

export const EVIDENCE_MIN = 2;
export const EVIDENCE_MAX = 3;
const STRENGTH_POINTS = [3, 1, 0] as const; // by distance from the justified strength
const EVIDENCE_POINTS: Record<Relevance, number> = { core: 2, support: 1, none: -1 };
const LIMITATION_POINTS = { primary: 3, related: 1, none: 0 } as const;

export interface BriefingInput {
  claimId: ClaimId | string;
  strength: number;
  evidenceIds: string[];
  limitationId: string;
}
export interface EvidenceFeedback {
  id: string;
  title: string;
  relevance: Relevance;
  trap: boolean;
  points: number;
}
export interface BriefingResult {
  valid: boolean;
  problems: string[];
  strength: { points: number; max: number; direction: 'match' | 'over' | 'under'; distance: number; justified: Strength };
  evidence: { points: number; max: number; cards: EvidenceFeedback[]; coreCount: number; irrelevantCount: number };
  limitation: { points: number; max: number; match: 'primary' | 'related' | 'none' };
  total: number;
  max: number;
  messages: string[];
}

export function claimById(id: string): Claim | undefined {
  return CLAIMS.find((c) => c.id === id);
}
export function evidenceById(id: string): EvidenceCard | undefined {
  return EVIDENCE.find((c) => c.id === id);
}
export function limitationById(id: string): LimitationCard | undefined {
  return LIMITATIONS.find((c) => c.id === id);
}
export function relevanceOf(card: EvidenceCard, claimId: string): Relevance {
  if (card.trap) return 'none';
  return card.rel[claimId as ClaimId] ?? 'none';
}
export function limitationMatch(card: LimitationCard, claimId: string): 'primary' | 'related' | 'none' {
  return card.match[claimId as ClaimId] ?? 'none';
}

/** Distance from the justified strength to points. Symmetric: over and under cost the same. */
export function strengthPoints(chosen: number, justified: number): number {
  const d = Math.abs(chosen - justified);
  return STRENGTH_POINTS[Math.min(d, 2)];
}

export function briefingMax(): number {
  return itemMax('briefing.strength') + itemMax('briefing.evidence') + itemMax('briefing.limitation');
}

export function scoreBriefing(input: BriefingInput): BriefingResult {
  const max = briefingMax();
  const problems: string[] = [];
  const claim = claimById(input.claimId);
  if (!claim) problems.push('Choose a claim.');
  if (![0, 1, 2, 3].includes(input.strength)) problems.push('Choose how strongly the evidence supports the claim.');
  const ids = [...new Set(input.evidenceIds)];
  if (ids.length < EVIDENCE_MIN) problems.push(`Choose at least ${EVIDENCE_MIN} evidence cards.`);
  if (ids.length > EVIDENCE_MAX) problems.push(`Choose at most ${EVIDENCE_MAX} evidence cards.`);
  if (ids.some((id) => !evidenceById(id))) problems.push('One of the evidence cards is not recognised.');
  const lim = limitationById(input.limitationId);
  if (!lim) problems.push('Choose one limitation.');

  const empty: BriefingResult = {
    valid: false,
    problems,
    strength: { points: 0, max: itemMax('briefing.strength'), direction: 'match', distance: 0, justified: 0 },
    evidence: { points: 0, max: itemMax('briefing.evidence'), cards: [], coreCount: 0, irrelevantCount: 0 },
    limitation: { points: 0, max: itemMax('briefing.limitation'), match: 'none' },
    total: 0,
    max,
    messages: [],
  };
  if (problems.length || !claim || !lim) return empty;

  const strength = input.strength;
  const distance = Math.abs(strength - claim.justified);
  const direction: 'match' | 'over' | 'under' = strength === claim.justified ? 'match' : strength > claim.justified ? 'over' : 'under';
  const sPts = strengthPoints(strength, claim.justified);

  const cards: EvidenceFeedback[] = ids.map((id) => {
    const card = evidenceById(id)!;
    const relevance = relevanceOf(card, claim.id);
    return { id, title: card.title, relevance, trap: !!card.trap, points: EVIDENCE_POINTS[relevance] };
  });
  const rawEv = cards.reduce((a, c) => a + c.points, 0);
  const ePts = Math.max(0, Math.min(itemMax('briefing.evidence'), rawEv));
  const coreCount = cards.filter((c) => c.relevance === 'core').length;
  const irrelevantCount = cards.filter((c) => c.relevance === 'none').length;

  const m = limitationMatch(lim, claim.id);
  const lPts = LIMITATION_POINTS[m];

  const messages: string[] = [];
  if (direction === 'over') messages.push(distance > 1 ? 'You claimed far more than the evidence can carry.' : 'You claimed a little more than the evidence can carry. Overclaiming costs as many points as underclaiming.');
  else if (direction === 'under') messages.push(distance > 1 ? 'You claimed far less than the evidence supports.' : 'You claimed a little less than the evidence supports. Underclaiming costs as many points as overclaiming.');
  else messages.push('Your claim strength matches what the evidence can honestly support.');
  if (irrelevantCount) messages.push(`${irrelevantCount === 1 ? 'One card does' : 'Some cards do'} not test this claim, and each one cost you a point.`);
  if (coreCount === 0) messages.push('None of your cards directly tests the claim.');
  if (m === 'primary') messages.push('Your limitation names a key weakness of this evidence.');
  else if (m === 'related') messages.push('Your limitation is true, but it is not the main weakness of this evidence.');
  else messages.push('Your limitation does not match this claim.');

  return {
    valid: true,
    problems: [],
    strength: { points: sPts, max: itemMax('briefing.strength'), direction, distance, justified: claim.justified },
    evidence: { points: ePts, max: itemMax('briefing.evidence'), cards, coreCount, irrelevantCount },
    limitation: { points: lPts, max: itemMax('briefing.limitation'), match: m },
    total: sPts + ePts + lPts,
    max,
    messages,
  };
}

/* ---------- totals for the debrief ---------- */

export interface PartScore {
  part: PartId;
  label: string;
  earned: number;
  max: number;
  items: { key: string; label: string; earned: number | null; max: number }[];
}

export function summarise(p: Progress): PartScore[] {
  const out: PartScore[] = [];
  for (const info of PARTS) {
    if (info.id === 'debrief') continue;
    if (info.id === 'sensor-lab') {
      const earned = Math.min(SENSOR_MAX, new Set(p.sensorLab.stationsDone).size);
      out.push({ part: info.id, label: info.label, earned, max: SENSOR_MAX, items: [{ key: 'sensor.stations', label: 'Stations completed', earned, max: SENSOR_MAX }] });
      continue;
    }
    const items = ITEMS.filter((i) => i.part === info.id).map((i) => ({ key: i.key, label: i.label, earned: i.key in p.scores ? Math.min(i.max, Math.max(0, p.scores[i.key])) : null, max: i.max }));
    out.push({ part: info.id, label: info.label, earned: items.reduce((a, i) => a + (i.earned ?? 0), 0), max: items.reduce((a, i) => a + i.max, 0), items });
  }
  return out;
}

export function totals(p: Progress): { earned: number; max: number } {
  const s = summarise(p);
  return { earned: s.reduce((a, x) => a + x.earned, 0), max: s.reduce((a, x) => a + x.max, 0) };
}

/** Plain-text summary for the "copy summary" button and the teacher export. */
export function summaryText(p: Progress): string {
  const lines: string[] = [];
  lines.push('GROUND TRUTH: Year 9 satellite evidence (NSW 4.3.4)');
  if (p.name.trim()) lines.push(`Name: ${p.name.trim()}`);
  lines.push('');
  lines.push('Evidence points');
  for (const s of summarise(p)) lines.push(`- ${s.label}: ${s.earned} / ${s.max}`);
  const t = totals(p);
  lines.push(`Total: ${t.earned} / ${t.max}`);
  const first = p.briefing.first;
  if (first) {
    const claim = claimById(first.claimId ?? '');
    lines.push('');
    lines.push('Minister briefing');
    if (claim) lines.push(`Claim: ${claim.text}`);
    if (first.strength !== undefined) lines.push(`Strength of claim: ${STRENGTHS[first.strength]?.label ?? ''}`);
    lines.push(`Evidence: ${first.evidence.map((id) => evidenceById(id)?.title ?? id).join('; ')}`);
    const lim = limitationById(first.limitationId ?? '');
    if (lim) lines.push(`Limitation: ${lim.title}. ${lim.text}`);
    if (first.freeText.trim()) lines.push(`Student note: ${first.freeText.trim()}`);
  }
  return lines.join('\n');
}

export { CLAIMS, EVIDENCE, LIMITATIONS };
