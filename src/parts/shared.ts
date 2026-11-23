import { h, s, clear, announce } from '../ui/dom';
import { Button, Callout, ChoiceGroup, DataMissing } from '../ui/components';
import type { Option } from '../content';
import { award } from '../state';
import { loadMany } from '../data/load';
import type { DataFiles, DataName } from '../data/types';
import { PARTS, type PartId, type Progress } from '../state';

export interface PartCtx {
  state: Progress;
  save(): void;
  go(id: PartId): void;
  /** Mark a part complete and move on to the next one. */
  finish(id: PartId): void;
  restart(): void;
  params: URLSearchParams;
}
export type PartMount = (root: HTMLElement, ctx: PartCtx) => void | (() => void);

export function PartHeader(eyebrow: string, title: string, lede?: string): HTMLElement {
  return h('header', { style: 'margin-bottom:1rem' },
    h('p', { class: 'eyebrow' }, h('span', { class: 'dot' }), eyebrow),
    h('h1', { style: 'font-size:clamp(1.6rem,1.1rem + 1.8vw,2.3rem)' }, title),
    lede ? h('p', { class: 'muted', style: 'max-width:46rem;margin:0' }, lede) : null);
}

export function nextPart(id: PartId): PartId | null {
  const i = PARTS.findIndex((p) => p.id === id);
  return PARTS[i + 1]?.id ?? null;
}

/** Load the named data files, then call render. If any are missing, show a tidy state and a way to carry on. */
export function withData<K extends DataName>(
  root: HTMLElement,
  ctx: PartCtx,
  part: PartId,
  names: K[],
  render: (data: { [P in K]: DataFiles[P] }) => void | (() => void),
): () => void {
  let cleanup: void | (() => void);
  let dead = false;
  root.append(h('p', { class: 'muted', role: 'status' }, 'Loading data…'));
  loadMany(names).then((d) => {
    if (dead) return;
    clear(root);
    const missing = names.filter((n) => !d[n]);
    if (missing.length) {
      const info = PARTS.find((p) => p.id === part)!;
      root.append(
        PartHeader(info.label, info.label),
        DataMissing(missing.map((m) => `${m}.json`).join(', ')),
        h('div', { class: 'row end', style: 'margin-top:1rem' },
          Button('Skip this part for now', { onClick: () => ctx.finish(part) })));
      return;
    }
    cleanup = render(d as { [P in K]: DataFiles[P] });
  });
  return () => { dead = true; if (typeof cleanup === 'function') cleanup(); };
}

export function PartNav(opts: { back?: { label: string; onClick: () => void }; next?: { label: string; onClick: () => void; disabled?: boolean }; hint?: string }): HTMLElement {
  return h('div', { class: 'spread no-print', style: 'margin-top:1.1rem' },
    opts.back ? Button(opts.back.label, { variant: 'ghost', onClick: opts.back.onClick }) : h('span'),
    h('div', { class: 'row' },
      opts.hint ? h('span', { class: 'muted small' }, opts.hint) : null,
      opts.next ? Button(opts.next.label, { variant: 'primary', disabled: opts.next.disabled, onClick: opts.next.onClick }) : null));
}

/** Show a "locked" chip for committed answers. */
export function LockChip(text = 'Locked in'): HTMLElement {
  const icon = s('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true' },
    s('rect', { x: 2, y: 5.5, width: 8, height: 5.5, rx: 1, fill: 'currentColor' }),
    s('path', { d: 'M4 5.5V4a2 2 0 0 1 4 0v1.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4 }));
  return h('span', { class: 'lock' }, icon, text);
}

export function say(msg: string): void {
  announce(msg);
}

export function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 100);
}

export interface QuestionOpts {
  name: string;
  legend: string;
  options: Option[];
  get(): string | undefined;
  set(id: string): void;
  scoreKey: string;
  max: number;
  /** A commitment question scores for answering, right or wrong. Otherwise only the correct option scores. */
  commit?: boolean;
  explain?: string;
  button?: string;
  rerender(): void;
}

/** Radio question that locks on the first answer. First attempt is the one that scores. */
export function QuestionBlock(ctx: PartCtx, o: QuestionOpts): HTMLElement {
  const answered = o.get();
  let pick = answered ?? '';
  const opts = o.options.map((op) => ({
    id: op.id, text: op.text,
    state: answered && !o.commit ? (op.correct ? ('right' as const) : answered === op.id ? ('wrong' as const) : undefined) : undefined,
  }));
  const btn = Button(o.button ?? (o.commit ? 'Lock in my answer' : 'Check my answer'), { variant: 'primary', disabled: true, onClick: () => {
    if (!pick) return;
    o.set(pick);
    const right = o.options.find((x) => x.id === pick)?.correct;
    award(ctx.state, o.scoreKey, o.commit || right ? o.max : 0);
    ctx.save();
    o.rerender();
  } });
  const group = ChoiceGroup({ name: o.name, legend: o.legend, options: opts, value: answered, locked: !!answered, onChange: (v) => { pick = v as string; btn.disabled = false; } });
  const chosen = o.options.find((x) => x.id === answered);
  return h('div', { class: 'stack-sm' },
    group,
    answered
      ? h('div', { class: 'stack-sm fade-in' },
          h('div', null, LockChip(o.commit ? 'Answer locked' : 'Answer recorded')),
          o.commit ? (o.explain ? Callout('Now look at the evidence', o.explain) : null)
            : Callout(chosen?.correct ? 'Right' : 'Not quite', o.explain ?? chosen?.feedback ?? '', chosen?.correct ? 'good' : 'warn'))
      : h('div', { class: 'row' }, btn, o.commit ? h('span', { class: 'muted small' }, 'You score for committing, right or wrong.') : null));
}
