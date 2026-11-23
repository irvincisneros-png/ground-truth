/**
 * Authored SVG icons for Satellite Spotter (no emoji, no raster art).
 * Static strings only; each is drawn on a 64 x 64 grid. Outline uses `currentColor`; `--ic` is the accent colour.
 */
export type IconName =
  | 'heat' | 'radar' | 'colour' | 'microwave'
  | 'speaker' | 'stop' | 'book' | 'check' | 'cross' | 'satellite' | 'sensor' | 'data' | 'climate' | 'sea-ice' | 'coral-bleaching'
  | 'stamp' | 'arrow' | 'sea' | 'print' | 'copy' | 'restart';

const A = 'var(--ic, #ffb547)';
const P = 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';

const SVG: Record<IconName, string> = {
  heat: `<g ${P}><rect x="12" y="7" width="12" height="32" rx="6"/><circle cx="18" cy="46" r="9" fill="${A}" stroke="currentColor"/><path d="M18 20v22" stroke="${A}" stroke-width="5"/><path d="M28 14h6M28 22h6M28 30h6" stroke-width="2.5"/><circle cx="46" cy="38" r="12"/><circle cx="46" cy="38" r="5" fill="${A}" stroke="none"/><path d="M41 31a8 8 0 0 1 5-3" stroke-width="2"/></g>`,
  radar: `<g ${P}><g transform="rotate(-38 24 40)"><path d="M6 34a18 18 0 0 0 36 0z" fill="${A}" fill-opacity=".3"/><path d="M24 34V20"/><circle cx="24" cy="18" r="2.6" fill="currentColor" stroke="none"/></g><path d="M20 50l4 8M30 50l-6 8M16 58h16" stroke-width="3"/><path d="M42 20a10 10 0 0 1 6 8M46 12a18 18 0 0 1 10 14" stroke="${A}"/></g>`,
  colour: `<g ${P}><circle cx="32" cy="32" r="25"/><path d="M18.14 24A16 16 0 0 1 45.86 24z" fill="#e5636b" stroke="none"/><path d="M18.14 24h27.72A16 16 0 0 1 45.86 40H18.14A16 16 0 0 1 18.14 24z" fill="#4cc38a" stroke="none"/><path d="M18.14 40A16 16 0 0 0 45.86 40z" fill="#56b4e9" stroke="none"/><circle cx="32" cy="32" r="16"/><path d="M45 11l4 4M52 20l3 2" stroke-width="2.5"/></g>`,
  microwave: `<g ${P}><circle cx="32" cy="32" r="5" fill="${A}" stroke="none"/><circle cx="32" cy="32" r="12"/><circle cx="32" cy="32" r="20" stroke-opacity=".75"/><circle cx="32" cy="32" r="28" stroke-opacity=".5"/><path d="M4 32h6M54 32h6M32 4v6M32 54v6" stroke="${A}" stroke-width="3"/></g>`,
  speaker: `<g ${P}><path d="M8 24h10l14-11v38L18 40H8z" fill="currentColor" fill-opacity=".18"/><path d="M40 22a14 14 0 0 1 0 20M46 14a24 24 0 0 1 0 36" stroke="${A}"/></g>`,
  stop: `<g ${P}><rect x="14" y="14" width="36" height="36" rx="6" fill="${A}" fill-opacity=".35"/></g>`,
  book: `<g ${P}><path d="M32 14C24 9 14 9 7 12v38c7-3 17-3 25 2 8-5 18-5 25-2V12c-7-3-17-3-25 2z" fill="currentColor" fill-opacity=".12"/><path d="M32 14v38"/><path d="M14 22c4-1 8-1 12 1M14 32c4-1 8-1 12 1M38 23c4-2 8-2 12-1M38 33c4-2 8-2 12-1" stroke="${A}" stroke-width="2.5"/></g>`,
  check: `<g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 34l13 13 26-30"/></g>`,
  cross: `<g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"><path d="M16 16l32 32M48 16L16 48"/></g>`,
  satellite: `<g ${P}><rect x="25" y="25" width="14" height="14" rx="2" transform="rotate(45 32 32)" fill="currentColor" fill-opacity=".15"/><path d="M14 14l9 9M41 41l9 9" stroke-width="3"/><rect x="5" y="5" width="14" height="10" rx="1.5" transform="rotate(45 12 10)" fill="${A}" fill-opacity=".4"/><rect x="45" y="49" width="14" height="10" rx="1.5" transform="rotate(45 52 54)" fill="${A}" fill-opacity=".4"/><path d="M46 14a12 12 0 0 1 4 4M43 9a19 19 0 0 1 12 12" stroke-width="2.5"/></g>`,
  sensor: `<g ${P}><path d="M5 32C14 18 24 13 32 13s18 5 27 19c-9 14-19 19-27 19S14 46 5 32z"/><circle cx="32" cy="32" r="9" fill="${A}" fill-opacity=".35"/><circle cx="32" cy="32" r="3.5" fill="currentColor" stroke="none"/></g>`,
  data: `<g ${P}><path d="M8 54h48"/><rect x="12" y="34" width="9" height="20" rx="2" fill="${A}" fill-opacity=".4"/><rect x="27" y="22" width="9" height="32" rx="2" fill="${A}" fill-opacity=".4"/><rect x="42" y="10" width="9" height="44" rx="2" fill="${A}" fill-opacity=".4"/></g>`,
  climate: `<g ${P}><rect x="14" y="6" width="12" height="34" rx="6"/><circle cx="20" cy="46" r="9" fill="${A}" fill-opacity=".5"/><path d="M20 20v22" stroke="${A}" stroke-width="5"/><path d="M38 40l8-8 6 6 8-12M52 26h8v8" stroke="currentColor"/></g>`,
  'sea-ice': `<g ${P}><path d="M10 42l6-14 10 4 8-12 10 8 10-4 4 18z" fill="currentColor" fill-opacity=".15"/><path d="M4 50c6-4 10-4 14 0s10 4 14 0 10-4 14 0 10 4 14 0" stroke="${A}"/><path d="M4 58c6-4 10-4 14 0s10 4 14 0 10-4 14 0 10 4 14 0" stroke="${A}" stroke-opacity=".5"/></g>`,
  'coral-bleaching': `<g ${P}><path d="M32 58V34M32 44c-8 0-12-5-12-12M32 40c8 0 12-6 12-14M20 32V20M44 26V14M32 34V16" stroke-width="5"/><path d="M12 58h40" stroke="${A}"/></g>`,
  stamp: `<g ${P}><circle cx="32" cy="32" r="26"/><circle cx="32" cy="32" r="19" stroke-width="2" stroke-dasharray="3 4"/><path d="M32 17l4.7 9.6 10.6 1.5-7.7 7.4 1.8 10.5-9.4-5-9.4 5 1.8-10.5-7.7-7.4 10.6-1.5z" fill="currentColor" stroke="none"/></g>`,
  arrow: `<g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 32h42M36 16l16 16-16 16"/></g>`,
  sea: `<g ${P}><path d="M4 32c6-4 10-4 14 0s10 4 14 0 10-4 14 0 10 4 14 0" stroke="${A}"/><path d="M4 44c6-4 10-4 14 0s10 4 14 0 10-4 14 0 10 4 14 0" stroke="${A}" stroke-opacity=".6"/><path d="M52 8v18M46 14h6M46 20h6" stroke="currentColor" stroke-width="2.5"/></g>`,
  print: `<g ${P}><rect x="16" y="6" width="32" height="18" rx="2"/><rect x="8" y="24" width="48" height="24" rx="4" fill="currentColor" fill-opacity=".12"/><rect x="16" y="38" width="32" height="20" rx="2" fill="${A}" fill-opacity=".25"/></g>`,
  copy: `<g ${P}><rect x="20" y="20" width="32" height="38" rx="4" fill="currentColor" fill-opacity=".12"/><path d="M14 44V10a3 3 0 0 1 3-3h26"/><path d="M28 32h16M28 42h16" stroke="${A}"/></g>`,
  restart: `<g ${P}><path d="M52 32a20 20 0 1 1-6-14.5"/><path d="M52 8v12H40"/></g>`,
};

/** An inline SVG icon. Decorative by default (`aria-hidden`); pass `label` to give it a name. */
export function icon(name: IconName, opts: { size?: number; color?: string; label?: string; className?: string } = {}): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = `sp-ic ${opts.className ?? ''}`.trim();
  if (opts.color) el.style.setProperty('--ic', opts.color);
  const size = opts.size ?? 32;
  el.style.width = el.style.height = `${size}px`;
  el.innerHTML = `<svg viewBox="0 0 64 64" width="${size}" height="${size}" ${opts.label ? `role="img" aria-label="${opts.label}"` : 'aria-hidden="true" focusable="false"'}>${SVG[name]}</svg>`;
  return el;
}

export const EYE_ICON = { heat: 'heat', radar: 'radar', colour: 'colour', microwave: 'microwave' } as const;
