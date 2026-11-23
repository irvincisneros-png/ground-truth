/** Sentence builder: pure checking logic (tested) and the interactive DOM component. */
import { h } from '../ui/dom';
import type { Frame, Mission } from './missions';

export type Verdict = 'right' | 'wrong' | 'empty';
export interface FrameResult {
  verdicts: Verdict[];
  /** A hint for each wrong blank, null otherwise. */
  hints: (string | null)[];
  complete: boolean;
  allRight: boolean;
}

/** Check the words placed in each blank. `null` means empty. */
export function checkFrame(frame: Frame, placed: (string | null)[]): FrameResult {
  const verdicts: Verdict[] = frame.blanks.map((b, i) => {
    const w = placed[i];
    if (w === null || w === undefined) return 'empty';
    return b.chips.some((c) => c.correct && c.text === w) ? 'right' : 'wrong';
  });
  const hints = frame.blanks.map((b, i) => {
    if (verdicts[i] !== 'wrong') return null;
    return b.chips.find((c) => c.text === placed[i])?.hint ?? 'Have another look at the pictures.';
  });
  return {
    verdicts, hints,
    complete: verdicts.every((v) => v !== 'empty'),
    allRight: verdicts.every((v) => v === 'right'),
  };
}

/** The correct words, in blank order. */
export function correctWords(frame: Frame): string[] {
  return frame.blanks.map((b) => b.chips.find((c) => c.correct)!.text);
}

/** Join the frame with the given words into one sentence of text. Missing words show as "...". */
export function fillFrame(frame: Frame, words: (string | null)[]): string {
  return frame.parts.map((p) => (typeof p === 'number' ? (words[p] ?? '...') : p)).join('');
}

export interface FrameHandle {
  /** Check now. Returns the result (also announces hints). */
  check(): FrameResult;
  words(): (string | null)[];
}

interface Slot { chip: number | null }
interface ChipView { id: number; blank: number; text: string }

/**
 * Interactive sentence frame. The student taps a chip then a blank (or a blank then a chip, or drags a chip onto a blank).
 * Wrong chips wobble, give a hint and go back to the tray so the student can try again.
 */
export function mountFrame(
  root: HTMLElement,
  mission: Mission,
  opts: { announce: (msg: string) => void; onSolved: (words: string[]) => void; initial?: string[] },
): FrameHandle {
  const frame = mission.frame;
  const chips: ChipView[] = [];
  frame.blanks.forEach((b, bi) => b.chips.forEach((c) => chips.push({ id: chips.length, blank: bi, text: c.text })));
  const slots: Slot[] = frame.blanks.map(() => ({ chip: null }));
  let selected: number | null = null;
  let activeBlank: number | null = null;
  let wobble = new Set<number>();
  let solved = false;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wordAt = (i: number) => (slots[i].chip === null ? null : chips[slots[i].chip!].text);
  const words = () => slots.map((_, i) => wordAt(i));
  const placedChips = () => new Set(slots.map((s) => s.chip).filter((c): c is number => c !== null));

  const sentence = h('p', { class: 'sp-sentence', 'aria-label': 'Your sentence' });
  const tray = h('div', { class: 'sp-tray' });
  const msg = h('p', { class: 'sp-frame-msg', role: 'status', 'aria-live': 'polite' });
  root.append(sentence, tray, msg);

  const say = (t: string, kind: '' | 'good' | 'bad' = '') => {
    msg.className = `sp-frame-msg ${kind}`.trim();
    msg.textContent = t;
    opts.announce(t);
  };

  function place(chip: number, blank: number) {
    const prev = slots[blank].chip;
    if (prev !== null) { /* swap: previous chip returns to the tray */ }
    slots[blank].chip = chip;
    selected = null; activeBlank = null;
    wobble.delete(blank);
    paint(`chip-${firstFreeChip()}`);
    const w = wordAt(blank);
    say(`Put “${w}” in blank ${blank + 1}.`);
    if (slots.every((s) => s.chip !== null)) say('All the blanks are full. Press Check my sentence.');
  }
  const firstFreeChip = () => chips.find((c) => !placedChips().has(c.id))?.id ?? -1;

  function clickChip(id: number) {
    if (solved) return;
    if (selected === id) { selected = null; paint(`chip-${id}`); say('Chip put down.'); return; }
    selected = id;
    if (activeBlank !== null && slots[activeBlank].chip === null) { place(id, activeBlank); return; }
    const empty = slots.findIndex((s) => s.chip === null);
    paint(empty >= 0 ? `blank-${empty}` : `chip-${id}`);
    say(`Picked “${chips[id].text}”. Now press a blank.`);
  }
  function clickBlank(i: number) {
    if (solved) return;
    if (slots[i].chip !== null) {
      const back = slots[i].chip!;
      slots[i].chip = null; wobble.delete(i);
      paint(`blank-${i}`);
      say(`Took “${chips[back].text}” out of blank ${i + 1}.`);
      return;
    }
    if (selected !== null) { place(selected, i); return; }
    activeBlank = activeBlank === i ? null : i;
    paint(activeBlank !== null ? `chip-${firstFreeChip()}` : `blank-${i}`);
    if (activeBlank !== null) say(`Blank ${i + 1} is ready. Now press a word.`);
  }

  function paint(focusKey?: string) {
    const used = placedChips();
    sentence.replaceChildren(...frame.parts.map((p) => {
      if (typeof p === 'string') return document.createTextNode(p);
      const i = p;
      const chip = slots[i].chip;
      const right = solved && chip !== null;
      const b = h('button', {
        type: 'button', id: `blank-${i}`,
        class: `sp-blank${chip !== null ? ' filled' : ''}${activeBlank === i ? ' active' : ''}${wobble.has(i) ? ' wrong' : ''}${right ? ' right' : ''}`,
        'aria-label': chip === null ? `Blank ${i + 1}, empty${selected !== null ? '. Press to place the picked word' : ''}` : `Blank ${i + 1}: ${chips[chip].text}.${solved ? '' : ' Press to take it out'}`,
        disabled: solved ? true : undefined,
      }, h('span', { class: 'sp-blank-n', 'aria-hidden': 'true' }, String(i + 1)), chip === null ? h('span', { class: 'sp-blank-line', 'aria-hidden': 'true' }) : chips[chip].text);
      b.addEventListener('click', () => clickBlank(i));
      b.addEventListener('dragover', (e) => { if (!solved) { e.preventDefault(); b.classList.add('over'); } });
      b.addEventListener('dragleave', () => b.classList.remove('over'));
      b.addEventListener('drop', (e) => {
        e.preventDefault(); b.classList.remove('over');
        const id = Number(e.dataTransfer?.getData('text/plain'));
        if (!Number.isNaN(id) && chips[id] && !placedChips().has(id)) place(id, i);
      });
      return b;
    }));
    tray.replaceChildren(...frame.blanks.map((_, bi) => h('div', { class: 'sp-chiprow', role: 'group', 'aria-label': `Words for blank ${bi + 1}` },
      h('span', { class: 'sp-blank-n', 'aria-hidden': 'true' }, String(bi + 1)),
      ...chips.filter((c) => c.blank === bi).map((c) => {
        const isUsed = used.has(c.id);
        const el = h('button', {
          type: 'button', id: `chip-${c.id}`, class: `sp-chip${selected === c.id ? ' picked' : ''}${isUsed ? ' used' : ''}`,
          'aria-pressed': String(selected === c.id), draggable: solved || isUsed ? undefined : 'true',
          disabled: isUsed || solved ? true : undefined, 'aria-label': `${c.text}${isUsed ? ', placed' : ''}`,
        }, c.text);
        el.addEventListener('click', () => clickChip(c.id));
        el.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/plain', String(c.id)); selected = c.id; });
        return el;
      }))));
    if (focusKey) (root.querySelector<HTMLElement>(`#${focusKey}`) ?? root.querySelector<HTMLElement>('.sp-chip:not(:disabled)'))?.focus({ preventScroll: true });
  }

  function check(): FrameResult {
    const res = checkFrame(frame, words());
    if (!res.complete) {
      say(`Fill every blank first. ${res.verdicts.filter((v) => v === 'empty').length} left.`, 'bad');
      return res;
    }
    if (res.allRight) {
      solved = true;
      wobble = new Set();
      paint();
      say('Yes! That is right.', 'good');
      opts.onSolved(words() as string[]);
      return res;
    }
    wobble = new Set(res.verdicts.map((v, i) => (v === 'wrong' ? i : -1)).filter((i) => i >= 0));
    paint();
    const hints = res.hints.map((t, i) => (t ? `Blank ${i + 1}: ${t}` : null)).filter(Boolean).join(' ');
    say(`Nearly. ${hints} Try again.`, 'bad');
    // The wrong words pop back to the tray after the wobble so the student can retry straight away.
    window.setTimeout(() => {
      if (solved) return;
      wobble.forEach((i) => { slots[i].chip = null; });
      wobble = new Set();
      paint(`chip-${firstFreeChip()}`);
    }, reduced ? 1400 : 900);
    return res;
  }

  if (opts.initial) {
    opts.initial.forEach((w, i) => { slots[i].chip = chips.find((c) => c.blank === i && c.text === w)?.id ?? null; });
    solved = slots.every((s) => s.chip !== null);
  }
  paint();
  say(solved ? 'You finished this sentence.' : 'Tap a word, then tap a blank.');
  return { check, words };
}
