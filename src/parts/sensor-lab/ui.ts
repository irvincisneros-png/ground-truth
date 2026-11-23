/** Small DOM helpers and instrument-style components for the sensor lab. */
import { CRITERIA, type Check, type TradeoffColumn } from './data';

type Attrs = Record<string, string | number | boolean | undefined | null>;
type Kid = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : String(v));
  for (const k of kids) if (k) e.append(k);
  return e;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...kids: (Node | string | null | false)[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) e.setAttribute(k, String(v));
  for (const k of kids) if (k) e.append(k);
  return e;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');
/** Thin-space thousands separator. */
export const grp = (v: number, d = 0) => {
  const [i, f] = Math.abs(v).toFixed(d).split('.');
  return (v < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? '.' + f : '');
};
export const sgn = (v: number, d = 2) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(d);

export interface Readout { el: HTMLElement; set(value: string, tone?: 'ok' | 'warn' | 'bad' | 'muted' | ''): void; unit(u: string): void }
export function readout(label: string, unit = '', size: 'md' | 'lg' = 'md'): Readout {
  const v = h('span', { class: 'sl-ro-v' }, '–');
  const u = h('span', { class: 'sl-ro-u' }, unit);
  const el = h('div', { class: `sl-ro sl-ro--${size}` }, h('div', { class: 'sl-ro-l' }, label), h('div', { class: 'sl-ro-val' }, v, u));
  return {
    el,
    set(value, tone = '') { v.textContent = value; el.dataset.tone = tone; },
    unit(x) { u.textContent = x; },
  };
}

/** A "Show data table" disclosure wrapping a table that is built lazily. */
export function dataTableToggle(caption: string, headers: string[], rows: () => (string | number)[][]): HTMLElement {
  const btn = h('button', { type: 'button', class: 'sl-link', 'aria-expanded': 'false' }, 'Show data table');
  const host = h('div', { class: 'sl-table-host', hidden: true });
  const wrap = h('div', { class: 'sl-table-wrap' }, btn, host);
  const build = () => {
    host.replaceChildren();
    const t = h('table', { class: 'sl-table' });
    t.append(h('caption', null, caption));
    const hr = h('tr');
    headers.forEach((x) => hr.append(h('th', { scope: 'col' }, x)));
    t.append(h('thead', null, hr));
    const tb = h('tbody');
    rows().forEach((r) => { const tr = h('tr'); r.forEach((c) => tr.append(h('td', null, String(c)))); tb.append(tr); });
    t.append(tb);
    host.append(t);
  };
  btn.addEventListener('click', () => {
    const open = host.hidden;
    if (open) build();
    host.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Hide data table' : 'Show data table';
  });
  return wrap;
}

/** Trade-off card: five rated criteria per platform. No right or wrong answers. */
export function tradeoffCard(cols: TradeoffColumn[]): HTMLElement {
  const root = h('div', { class: 'sl-trade', style: `--cols:${cols.length}` });
  const head = h('div', { class: 'sl-trade-head' }, h('div'));
  cols.forEach((c) => head.append(h('div', { class: 'sl-trade-col', style: `--c:${c.color}` }, h('strong', null, c.name), h('span', null, c.sub))));
  root.append(head);
  CRITERIA.forEach((cr) => {
    const row = h('div', { class: 'sl-trade-row' }, h('div', { class: 'sl-trade-crit' }, h('strong', null, cr.label), h('span', null, cr.hint)));
    cols.forEach((c) => {
      const r = c.ratings[cr.id];
      const segs = h('div', { class: 'sl-segs', role: 'img', 'aria-label': `${c.name}, ${cr.label}: ${r.score} out of 5. ${r.note}` });
      for (let i = 1; i <= 5; i++) segs.append(h('i', { class: i <= r.score ? 'on' : '' }));
      row.append(h('div', { class: 'sl-trade-cell', style: `--c:${c.color}` }, h('span', { class: 'sl-trade-who' }, c.name), segs, h('p', null, r.note)));
    });
    root.append(row);
  });
  root.append(h('p', { class: 'sl-trade-foot' }, 'Ratings compare the four sensors in this lab. No sensor is "best": each is good at some things and blind to others. The right choice depends on the question.'));
  return root;
}

export interface CheckResult { correct: boolean; attempts: number; firstCorrect: boolean }
/** Multiple-choice check. The first attempt is recorded; students may retry until correct. */
export function checkCard(check: Check, prior: { attempts: number; firstCorrect: boolean; solved: boolean } | undefined, onSolved: (r: CheckResult) => void, onAttempt: (r: CheckResult) => void): HTMLElement {
  const root = h('fieldset', { class: 'sl-check' });
  root.append(h('legend', null, h('span', { class: 'sl-tag' }, 'Check'), check.question));
  let attempts = prior?.attempts ?? 0;
  let firstCorrect = prior?.firstCorrect ?? false;
  const fb = h('div', { class: 'sl-feedback', role: 'status', 'aria-live': 'polite' });
  const group = h('div', { class: 'sl-options' });
  const name = `chk-${Math.random().toString(36).slice(2, 7)}`;
  const inputs: HTMLInputElement[] = [];
  const lock = () => inputs.forEach((i) => { i.disabled = true; });
  check.options.forEach((o, idx) => {
    const id = `${name}-${idx}`;
    const input = h('input', { type: 'radio', name, id, value: idx });
    inputs.push(input);
    const lab = h('label', { for: id, class: 'sl-option' }, input, h('span', { class: 'sl-opt-text' }, o.text));
    input.addEventListener('change', () => {
      attempts++;
      const correct = !!o.correct;
      if (attempts === 1) firstCorrect = correct;
      lab.classList.toggle('is-right', correct);
      lab.classList.toggle('is-wrong', !correct);
      fb.className = `sl-feedback ${correct ? 'is-right' : 'is-wrong'}`;
      fb.replaceChildren(h('strong', null, correct ? 'Correct. ' : 'Not quite. '), o.feedback);
      if (correct) fb.append(h('p', { class: 'sl-explain' }, check.explain));
      const res = { correct, attempts, firstCorrect };
      onAttempt(res);
      if (correct) { lock(); onSolved(res); }
    });
    group.append(lab);
  });
  root.append(group, fb);
  if (prior?.solved) {
    const ci = check.options.findIndex((o) => o.correct);
    inputs[ci].checked = true;
    group.children[ci].classList.add('is-right');
    fb.className = 'sl-feedback is-right';
    fb.replaceChildren(h('strong', null, 'Answered. '), check.options[ci].feedback, h('p', { class: 'sl-explain' }, check.explain));
    lock();
  }
  return root;
}

/** Make an element draggable inside a bounding box, plus arrow-key nudging. Returns a disposer. */
export function makeDraggable(
  el: HTMLElement | SVGElement,
  get: () => { x: number; y: number },
  set: (x: number, y: number) => void,
  scale: () => number,
  stepPx = 14,
): () => void {
  let start: { px: number; py: number; x: number; y: number; id: number } | null = null;
  const down = (e: Event) => {
    const pe = e as PointerEvent;
    const p = get();
    start = { px: pe.clientX, py: pe.clientY, x: p.x, y: p.y, id: pe.pointerId };
    (el as Element).setPointerCapture?.(pe.pointerId);
    el.classList.add('is-grabbed');
    pe.preventDefault();
  };
  const move = (e: Event) => {
    const pe = e as PointerEvent;
    if (!start || pe.pointerId !== start.id) return;
    const k = scale();
    set(start.x + (pe.clientX - start.px) * k, start.y + (pe.clientY - start.py) * k);
  };
  const up = () => { start = null; el.classList.remove('is-grabbed'); };
  const key = (e: Event) => {
    const ke = e as KeyboardEvent;
    const d: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const v = d[ke.key];
    if (!v) return;
    ke.preventDefault();
    const p = get();
    const m = ke.shiftKey ? 3 : 1;
    set(p.x + v[0] * stepPx * scale() * m, p.y + v[1] * stepPx * scale() * m);
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('keydown', key);
  };
}

/** Cividis-like sequential ramp, colour-vision-deficiency safe. t in 0..1 -> [r, g, b]. */
const CIVIDIS: [number, number, number][] = [
  [0, 34, 78], [18, 53, 112], [59, 73, 108], [87, 93, 109], [112, 113, 115], [138, 134, 120], [166, 157, 117], [196, 181, 110], [228, 207, 91], [254, 232, 56],
];
export function cividis(t: number): [number, number, number] {
  const x = clamp(t, 0, 1) * (CIVIDIS.length - 1);
  const i = Math.min(CIVIDIS.length - 2, Math.floor(x)), f = x - i;
  const a = CIVIDIS[i], b = CIVIDIS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export const cividisCss = (t: number) => { const c = cividis(t); return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; };
