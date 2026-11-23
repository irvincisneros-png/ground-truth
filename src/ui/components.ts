import { h, nextId, type Child } from './dom';

/* ---------- Button ---------- */
export interface ButtonOpts {
  variant?: 'primary' | 'ghost' | 'default';
  small?: boolean;
  disabled?: boolean;
  onClick?: (e: MouseEvent) => void;
  type?: 'button' | 'submit';
  label?: string;
  id?: string;
}
export function Button(text: Child, opts: ButtonOpts = {}): HTMLButtonElement {
  const cls = ['btn', opts.variant && opts.variant !== 'default' ? opts.variant : '', opts.small ? 'small' : ''].filter(Boolean).join(' ');
  const b = h('button', { class: cls, type: opts.type ?? 'button', 'aria-label': opts.label, id: opts.id }, text);
  if (opts.disabled) {
    b.disabled = true;
  }
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

/* ---------- Card / Panel ---------- */
export function Card(title: string | null, body: Child[], opts: { eyebrow?: string; flat?: boolean; actions?: Child } = {}): HTMLElement {
  return h('section', { class: opts.flat ? 'panel flat' : 'panel' },
    opts.eyebrow ? h('p', { class: 'eyebrow' }, opts.eyebrow) : null,
    title ? h('div', { class: 'panel-head' }, h('h3', null, title), opts.actions ?? null) : null,
    ...body);
}

export function Callout(title: string, body: Child, kind: '' | 'warn' | 'good' | 'bad' = ''): HTMLElement {
  return h('div', { class: `callout ${kind}`.trim(), role: kind === 'bad' || kind === 'good' ? 'status' : undefined },
    h('strong', null, title), typeof body === 'string' ? h('p', null, body) : body);
}

export function Readout(label: string, value: string, unit?: string, text = false): HTMLElement {
  return h('div', { class: 'readout' }, h('span', { class: 'k' }, label), h('span', { class: text ? 'v txt' : 'v' }, value, unit ? h('span', { class: 'u' }, unit) : null));
}

export function Badge(text: string, kind: '' | 'accent' | 'good' | 'bad' | 'draft' = ''): HTMLElement {
  return h('span', { class: `badge ${kind}`.trim() }, text);
}

export function EmptyState(title: string, detail: string): HTMLElement {
  return h('div', { class: 'empty-state', role: 'status' }, h('strong', null, title), h('span', null, detail));
}

export function DataMissing(what: string): HTMLElement {
  return EmptyState('Data loading — not yet available', `The ${what} data file is not available yet, so this part cannot run. Ask your teacher, or try reloading the page.`);
}

/* ---------- Modal ---------- */
export interface ModalOpts {
  title: string;
  body: Child[];
  actions?: { label: string; variant?: 'primary' | 'ghost' | 'default'; onClick?: () => void; close?: boolean }[];
  onClose?: () => void;
}
export function openModal(opts: ModalOpts): { close(): void } {
  const prevFocus = document.activeElement as HTMLElement | null;
  const titleId = nextId('modal-title');
  const back = h('div', { class: 'modal-back' });
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    prevFocus?.focus?.();
    opts.onClose?.();
  };
  const actions = (opts.actions ?? [{ label: 'Close', variant: 'primary' as const }]).map((a) =>
    Button(a.label, { variant: a.variant, onClick: () => { a.onClick?.(); if (a.close !== false) close(); } }));
  const dialog = h('div', { class: 'panel modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('h2', { id: titleId }, opts.title), ...opts.body, h('div', { class: 'row end', style: 'margin-top:1rem' }, actions));
  back.appendChild(dialog);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled'));
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  (actions[actions.length - 1] ?? dialog).focus();
  return { close };
}

/* ---------- Choices ---------- */
export interface ChoiceOpt {
  id: string;
  text: string;
  detail?: string;
  state?: 'right' | 'wrong';
}
export interface ChoiceGroupOpts {
  name: string;
  legend: string;
  options: ChoiceOpt[];
  multiple?: boolean;
  value?: string | string[];
  locked?: boolean;
  onChange?: (value: string | string[]) => void;
  maxPick?: number;
}
/** Radio or checkbox list. Native inputs, so the keyboard just works. */
export function ChoiceGroup(o: ChoiceGroupOpts): HTMLElement {
  const selected = new Set(Array.isArray(o.value) ? o.value : o.value ? [o.value] : []);
  const inputs: HTMLInputElement[] = [];
  const fs = h('fieldset', { class: 'choice-list' }, h('legend', null, o.legend));
  for (const opt of o.options) {
    const input = h('input', { type: o.multiple ? 'checkbox' : 'radio', name: o.name, value: opt.id });
    input.checked = selected.has(opt.id);
    input.disabled = !!o.locked;
    inputs.push(input);
    const cls = ['choice', o.locked ? 'locked' : '', opt.state === 'right' ? 'is-right' : '', opt.state === 'wrong' ? 'is-wrong' : ''].filter(Boolean).join(' ');
    const label = h('label', { class: cls }, input, h('span', null, h('span', { class: 't' }, opt.text), opt.detail ? h('span', { class: 'd' }, opt.detail) : null));
    input.addEventListener('change', () => {
      if (o.multiple) {
        const vals = inputs.filter((i) => i.checked).map((i) => i.value);
        if (o.maxPick && vals.length > o.maxPick) { input.checked = false; return; }
        o.onChange?.(vals);
      } else o.onChange?.(input.value);
    });
    fs.appendChild(label);
  }
  return fs;
}

/* ---------- Sub-step list inside a part ---------- */
export function StepList(labels: string[], current: number, reached: number, onGo: (i: number) => void): HTMLElement {
  return h('ol', { class: 'steps', 'aria-label': 'Steps in this part' },
    labels.map((l, i) => {
      const cls = [i === current ? 'on' : '', i < reached ? 'done' : ''].join(' ').trim();
      const enabled = i <= reached;
      const b = h('button', { type: 'button', 'aria-current': i === current ? 'step' : undefined, 'aria-disabled': enabled ? undefined : 'true' }, `${i + 1} ${l}`);
      b.addEventListener('click', () => { if (enabled && i !== current) onGo(i); });
      return h('li', { class: cls }, b);
    }));
}
