/** Authored SVG icons for Orbit Run (64 grid, static strings, no emoji, no raster). */
import type { SensorId } from './content';
const P = 'fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"';
const A = 'var(--ic, #ffb547)';

export const EYE_ICON: Record<SensorId, string> = {
  heat: `<g ${P}><rect x="12" y="7" width="12" height="32" rx="6"/><circle cx="18" cy="46" r="9" fill="${A}"/><path d="M18 20v22" stroke="${A}" stroke-width="5"/><path d="M28 14h6M28 22h6M28 30h6" stroke-width="2.6"/><circle cx="46" cy="38" r="12"/><circle cx="46" cy="38" r="5" fill="${A}" stroke="none"/></g>`,
  colour: `<g ${P}><circle cx="32" cy="32" r="25"/><path d="M18.14 24A16 16 0 0 1 45.86 24z" fill="#e5636b" stroke="none"/><path d="M18.14 24h27.72A16 16 0 0 1 45.86 40H18.14A16 16 0 0 1 18.14 24z" fill="#4cc38a" stroke="none"/><path d="M18.14 40A16 16 0 0 0 45.86 40z" fill="#56b4e9" stroke="none"/><circle cx="32" cy="32" r="16"/></g>`,
  radar: `<g ${P}><g transform="rotate(-38 24 40)"><path d="M6 34a18 18 0 0 0 36 0z" fill="${A}" fill-opacity=".35"/><path d="M24 34V20"/><circle cx="24" cy="18" r="2.6" fill="currentColor" stroke="none"/></g><path d="M20 50l4 8M30 50l-6 8M16 58h16"/><path d="M42 20a10 10 0 0 1 6 8M46 12a18 18 0 0 1 10 14" stroke="${A}"/></g>`,
  microwave: `<g ${P}><circle cx="32" cy="32" r="5" fill="${A}" stroke="none"/><circle cx="32" cy="32" r="12"/><circle cx="32" cy="32" r="20" stroke-opacity=".75"/><circle cx="32" cy="32" r="28" stroke-opacity=".5"/></g>`,
};
export const ICON = {
  pause: `<g fill="currentColor"><rect x="18" y="14" width="10" height="36" rx="3"/><rect x="36" y="14" width="10" height="36" rx="3"/></g>`,
  play: `<g fill="currentColor"><path d="M20 12l32 20-32 20z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></g>`,
  soundOn: `<g ${P}><path d="M8 24h10l14-11v38L18 40H8z" fill="currentColor" fill-opacity=".25"/><path d="M40 22a14 14 0 0 1 0 20M46 14a24 24 0 0 1 0 36" stroke="${A}"/></g>`,
  soundOff: `<g ${P}><path d="M8 24h10l14-11v38L18 40H8z" fill="currentColor" fill-opacity=".25"/><path d="M42 24l14 16M56 24L42 40" stroke="${A}"/></g>`,
  mouse: `<g ${P}><rect x="18" y="8" width="28" height="46" rx="14"/><path d="M32 8v18M18 26h28"/><path d="M25 14a8 8 0 0 0 0 8" stroke="${A}" stroke-width="4"/></g>`,
  touch: `<g ${P}><path d="M26 30V14a4 4 0 0 1 8 0v16l10 2a6 6 0 0 1 5 7l-3 15H27L16 40a4 4 0 0 1 6-5z"/><path d="M48 8a14 14 0 0 1 8 10M12 8a14 14 0 0 0-6 10" stroke="${A}"/></g>`,
  up: `<g ${P}><path d="M32 52V14M16 28L32 12l16 16" stroke="${A}" stroke-width="5"/></g>`,
  satellite: `<g ${P}><rect x="25" y="25" width="14" height="14" rx="2" transform="rotate(45 32 32)" fill="currentColor" fill-opacity=".2"/><rect x="5" y="5" width="14" height="10" rx="1.5" transform="rotate(45 12 10)" fill="${A}" fill-opacity=".45"/><rect x="45" y="49" width="14" height="10" rx="1.5" transform="rotate(45 52 54)" fill="${A}" fill-opacity=".45"/><path d="M14 14l9 9M41 41l9 9"/></g>`,
};
export const svg = (inner: string, cls = '') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${inner}</svg>`;
