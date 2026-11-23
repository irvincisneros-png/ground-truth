/** Sea-level line for mission 3: the real satellite record (public/data/sealevel.json) drawn next to a ruler. */
import type { GmslPoint } from '../data/types';

export const START_YEAR = 1993;

/** Sea level in cm above the 1993 average, averaged over +/- half a year around `year` (smooths the 10-day wiggles). */
export function levelAtCm(gmsl: GmslPoint[], year: number): number {
  const win = gmsl.filter((p) => Math.abs(p.t_year - year) <= 0.5);
  const use = win.length ? win : gmsl;
  const mm = use.reduce((a, p) => a + p.gmsl_mm, 0) / use.length;
  return mm / 10;
}

export const latestYear = (gmsl: GmslPoint[]): number => gmsl[gmsl.length - 1].t_year;

/** Year shown at slider position p (0..100). */
export const yearAt = (gmsl: GmslPoint[], p: number): number => START_YEAR + ((latestYear(gmsl) - START_YEAR) * p) / 100;

/** A friendly reading for the slider: "In 2010 the sea was up about 5 cm." */
export function readoutAt(gmsl: GmslPoint[], p: number): string {
  if (p <= 0.5) return 'In 1993 we start at 0 cm.';
  const y = Math.min(Math.round(yearAt(gmsl, p)), Math.floor(latestYear(gmsl)));
  const cm = Math.max(0, Math.round(levelAtCm(gmsl, p >= 99.5 ? latestYear(gmsl) - 0.25 : y)));
  return p >= 99.5 ? `Now the sea is up about ${cm} cm.` : `In ${y} the sea was up about ${cm} cm.`;
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number>, text?: string): SVGElement => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e as SVGElement;
};

let uid = 0;
export interface SeaChart { el: SVGSVGElement; set(p: number): void }

/** An SVG ruler (0 to 11 cm) on the left and the line growing to the right as the slider moves. */
export function buildSeaChart(gmsl: GmslPoint[]): SeaChart {
  const W = 1000, H = 400, top = 36, bottom = 346;
  const cmPx = (bottom - top) / 11;
  const y = (cm: number) => bottom - cm * cmPx;
  const x0 = 130, x1 = 960;
  const last = latestYear(gmsl);
  const x = (yr: number) => x0 + ((yr - START_YEAR) / (last - START_YEAR)) * (x1 - x0);
  const id = `sea-clip-${++uid}`;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sp-sea-svg', role: 'img', 'aria-label': 'A ruler in centimetres beside a line showing the sea rising from 1993 to now.' }) as SVGSVGElement;

  // ruler body
  svg.append(el('rect', { x: 40, y: top - 10, width: 62, height: bottom - top + 20, rx: 8, class: 'sp-ruler' }));
  for (let c = 0; c <= 11; c++) {
    svg.append(el('line', { x1: 102, x2: 102 - (c % 5 === 0 ? 26 : 18), y1: y(c), y2: y(c), class: 'sp-tick' }));
    svg.append(el('text', { x: 62, y: y(c) + 5, class: 'sp-ticklabel', 'text-anchor': 'end' }, String(c)));
    svg.append(el('line', { x1: x0, x2: x1, y1: y(c), y2: y(c), class: c === 0 ? 'sp-grid sp-grid-0' : 'sp-grid' }));
  }
  svg.append(el('text', { x: 71, y: top - 14, class: 'sp-ticklabel', 'text-anchor': 'middle' }, 'cm'));

  // x labels
  [1993, 2000, 2010, 2020].forEach((yr) => svg.append(el('text', { x: x(yr), y: bottom + 28, class: 'sp-ticklabel', 'text-anchor': 'middle' }, String(yr))));

  // the real line (thinned for drawing; the data are untouched)
  const step = Math.max(1, Math.floor(gmsl.length / 400));
  const pts = gmsl.filter((_, i) => i % step === 0 || i === gmsl.length - 1).filter((p) => p.t_year >= START_YEAR);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t_year).toFixed(1)} ${y(Math.max(0, p.gmsl_mm / 10)).toFixed(1)}`).join('');
  const clip = el('clipPath', { id });
  const clipRect = el('rect', { x: x0 - 4, y: 0, width: 0, height: H });
  clip.append(clipRect);
  svg.append(clip);
  const g = el('g', { 'clip-path': `url(#${id})` });
  g.append(el('path', { d, class: 'sp-sealine' }));
  svg.append(g);

  // marker, and a guide from the line to the ruler
  const guide = el('line', { x1: 102, x2: x0, y1: y(0), y2: y(0), class: 'sp-guide' });
  const dot = el('circle', { cx: x0, cy: y(0), r: 9, class: 'sp-dot' });
  const tag = el('text', { x: x0, y: y(0) - 16, class: 'sp-dottag', 'text-anchor': 'middle' }, '');
  const rulerMark = el('circle', { cx: 102, cy: y(0), r: 6, class: 'sp-dot' });
  svg.append(guide, rulerMark, dot, tag);

  const set = (p: number) => {
    const yr = yearAt(gmsl, p);
    const cx = x(yr);
    const cm = Math.max(0, levelAtCm(gmsl, p >= 99.5 ? last - 0.25 : yr));
    clipRect.setAttribute('width', String(Math.max(0, cx - x0 + 4)));
    dot.setAttribute('cx', String(cx)); dot.setAttribute('cy', String(y(cm)));
    guide.setAttribute('y1', String(y(cm))); guide.setAttribute('y2', String(y(cm))); guide.setAttribute('x2', String(cx));
    rulerMark.setAttribute('cy', String(y(cm)));
    tag.setAttribute('x', String(Math.min(cx, x1 - 30))); tag.setAttribute('y', String(y(cm) - 16));
    tag.textContent = p <= 0.5 ? '' : `+${Math.round(cm)} cm`;
  };
  set(0);
  return { el: svg, set };
}
