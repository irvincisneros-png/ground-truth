/** Before / after slider. A real range input sits over the picture, so drag, touch and arrow keys all work. */
import { h } from '../ui/dom';
import { icon } from './icons';
import { spotterUrl, type ImagePair } from './images';

/** A short credit for the line under the slider: the part before the first full stop, bracket or comma, kept short. */
export function shortCredit(c: string | undefined): string {
  if (!c) return '';
  const first = c.split(/[.(]/)[0].trim();
  return first.length > 70 ? `${first.slice(0, 67).trimEnd()}...` : first;
}

export interface SliderHandle { el: HTMLElement; value(): number }

/** Tidy placeholder shown when a picture is not there yet. Never a fake image. */
export function imageComing(what: string): HTMLElement {
  return h('div', { class: 'sp-coming', role: 'img', 'aria-label': `Image coming: ${what}` },
    icon('satellite', { size: 56 }), h('strong', null, 'Image coming'), h('span', null, 'The real satellite picture is still being added.'));
}

/** One real picture (problem step). Falls back to "Image coming" if the file will not load. */
export function singleImage(pair: ImagePair | undefined, side: 'before' | 'after', what: string): HTMLElement {
  if (!pair) return imageComing(what);
  const s = pair[side];
  const fig = h('figure', { class: 'sp-fig' });
  const img = h('img', { src: spotterUrl(s.file), alt: `${what}${s.label ? `, ${s.label}` : ''}`, class: 'sp-img', decoding: 'async' });
  img.addEventListener('error', () => fig.replaceChildren(imageComing(what)));
  // The caption can give the answer away, so only the date label shows here. The full caption is in Credits.
  fig.append(img, h('figcaption', { class: 'sp-figcap' }, s.label));
  return fig;
}

export function beforeAfter(pair: ImagePair | undefined, what: string, onMove: (p: number) => void): SliderHandle {
  const wrap = h('div', { class: 'sp-ba-wrap' });
  if (!pair) {
    wrap.append(imageComing(what));
    return { el: wrap, value: () => 50 };
  }
  const stage = h('div', { class: 'sp-ba', style: '--pos:50' });
  const after = h('img', { src: spotterUrl(pair.after.file), alt: `After${pair.after.label ? `, ${pair.after.label}` : ''}`, class: 'sp-ba-img', decoding: 'async' });
  const before = h('img', { src: spotterUrl(pair.before.file), alt: `Before${pair.before.label ? `, ${pair.before.label}` : ''}`, class: 'sp-ba-img', decoding: 'async' });
  const range = h('input', {
    type: 'range', min: '0', max: '100', step: '1', value: '50', class: 'sp-ba-range',
    'aria-label': 'Slide the line to compare before and after. Use the left and right arrow keys.',
  });
  const handle = h('div', { class: 'sp-ba-handle', 'aria-hidden': 'true' }, h('span', { class: 'sp-ba-grip' }, '‹ ›'));
  stage.append(after, h('div', { class: 'sp-ba-before' }, before), handle, range);
  // Date chips sit ON the picture corners so the labels stay with the image at any size.
  const labels = h('div', { class: 'sp-ba-labels', 'aria-hidden': 'true' },
    h('span', { class: 'sp-ba-chip' }, pair.before.label || 'Before'),
    h('span', { class: 'sp-ba-chip' }, pair.after.label || 'After'));
  stage.append(labels);
  const frame = h('div', { class: 'sp-ba-frame' }, stage);
  const update = () => {
    const v = Number(range.value);
    stage.style.setProperty('--pos', String(v));
    range.setAttribute('aria-valuetext', `${Math.round(v)} percent before, ${Math.round(100 - v)} percent after`);
    onMove(v);
  };
  after.addEventListener('load', () => { if (after.naturalWidth && after.naturalHeight) { const ar = after.naturalWidth / after.naturalHeight; wrap.style.setProperty('--ar-n', String(ar)); wrap.dataset.orient = ar < 1.15 ? 'portrait' : 'landscape'; } });
  range.addEventListener('input', update);
  const broken = () => { wrap.replaceChildren(imageComing(what)); };
  before.addEventListener('error', broken);
  after.addEventListener('error', broken);
  // The caption is a reading key for the colours; the credit is short, with the full text on the Credits page.
  const side = h('div', { class: 'sp-ba-side' },
    pair.caption ? h('p', { class: 'sp-key' }, pair.caption) : null,
    shortCredit(pair.credit) ? h('p', { class: 'sp-credit' }, `Images: ${shortCredit(pair.credit)}. Full credits are on the Credits page.`) : null);
  wrap.append(frame, side);
  update();
  return { el: wrap, value: () => Number(range.value) };
}
