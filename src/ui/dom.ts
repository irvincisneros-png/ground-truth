/** Minimal DOM helpers. Text is always set via text nodes, never innerHTML. */

export type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> | null | undefined;

function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)));
    else el.appendChild(c);
  }
}

function applyProps(el: Element, props: Props): void {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'dataset') Object.assign((el as HTMLElement).dataset, v as object);
    else if (v === true) el.setAttribute(k, '');
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else el.setAttribute(k, String(v));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s<K extends keyof SVGElementTagNameMap>(tag: K, props?: Props, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let uid = 0;
export function nextId(prefix = 'gt'): string {
  uid += 1;
  return `${prefix}-${uid}`;
}

export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function announce(message: string): void {
  let live = document.getElementById('gt-live');
  if (!live) {
    live = h('div', { id: 'gt-live', class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    document.body.appendChild(live);
  }
  live.textContent = '';
  window.setTimeout(() => { if (live) live.textContent = message; }, 30);
}

/** Append children that may be null/false/strings, like h() does. */
export function put<T extends Element>(el: T, ...children: Child[]): T {
  append(el, children);
  return el;
}
