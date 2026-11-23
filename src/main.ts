import './styles/tokens.css';
import './styles/base.css';
import { h, s, clear } from './ui/dom';
import { Button, openModal } from './ui/components';
import { PARTS, clearProgress, defaultState, hasSavedProgress, isUnlocked, loadProgress, markComplete, saveProgress, safeStorage, type PartId, type Progress } from './state';
import { loadAllSources } from './data/load';
import { nextPart, type PartCtx, type PartMount } from './parts/shared';
import { mountLaunch } from './parts/launch';
import { mountSensor } from './parts/sensor';
import { mountReef } from './parts/reef';
import { mountSea } from './parts/transfer-sea';
import { mountForest } from './parts/transfer-forest';
import { mountIce } from './parts/transfer-ice';
import { mountBriefing } from './parts/briefing';
import { mountDebrief } from './parts/debrief';

const REGISTRY: Record<PartId, PartMount> = {
  launch: mountLaunch, 'sensor-lab': mountSensor, reef: mountReef, sea: mountSea, forest: mountForest, ice: mountIce, briefing: mountBriefing, debrief: mountDebrief,
};

const params = new URLSearchParams(location.search);
const unlockAll = params.has('unlock');
const storage = safeStorage();
const hadSaved = hasSavedProgress(storage);
let state: Progress = loadProgress(storage);
let cleanup: void | (() => void);

const shell = document.getElementById('shell')!;
const saveState = h('span', { class: 'save-state', role: 'status' });
const rail = h('ol', { class: 'rail', 'aria-label': 'Lesson progress' });
const main = h('main', { id: 'app', class: 'app-main', tabindex: '-1' });
const printEl = h('div', { id: 'print-summary' });

function save() {
  const ok = saveProgress(storage, state);
  saveState.textContent = ok ? 'Saved on this device' : 'Not saved: storage is blocked';
  saveState.style.setProperty('--x', ok ? '' : '1');
}

function brandMark() {
  return s('svg', { width: 28, height: 28, viewBox: '0 0 32 32', 'aria-hidden': 'true' },
    s('circle', { cx: 16, cy: 16, r: 12.5, fill: 'none', stroke: '#2a3d63', 'stroke-width': 1.5 }),
    s('circle', { cx: 16, cy: 16, r: 8, fill: 'none', stroke: '#ffb547', 'stroke-width': 1.8 }),
    s('path', { d: 'M16 1.5v6M16 24.5v6M1.5 16h6M24.5 16h6', stroke: '#9fb0d4', 'stroke-width': 1.4 }),
    s('circle', { cx: 16, cy: 16, r: 2.4, fill: '#ffb547' }));
}

const header = h('header', { class: 'app-header' },
  h('a', { class: 'brand', href: `${import.meta.env.BASE_URL}challenge.html`, 'aria-label': 'Ground Truth Challenge home' }, brandMark(), h('span', null, 'Ground Truth', h('small', null, 'NSW SCIENCE Y9 · 4.3.4'))),
  h('div', { class: 'header-actions' },
    saveState,
    Button('Credits', { variant: 'ghost', small: true, onClick: showCredits }),
    h('a', { class: 'btn ghost small', href: `${import.meta.env.BASE_URL}` }, 'Easier mode: Satellite Spotter'),
    h('a', { class: 'btn ghost small', href: `${import.meta.env.BASE_URL}teacher.html` }, 'Teacher guide'),
    Button('Start again', { variant: 'ghost', small: true, onClick: confirmRestart })));

const footer = h('footer', { class: 'app-footer' },
  h('span', null, 'Ground Truth · an NSW Stage 5 science lesson. Real data, pre-processed for the classroom.'),
  h('a', { href: '#credits', onClick: (e: Event) => { e.preventDefault(); showCredits(); } }, 'Data credits'));

shell.append(header, rail, main, footer, printEl);

function paintRail() {
  clear(rail);
  PARTS.forEach((p, i) => {
    const done = state.completed.includes(p.id);
    const current = state.part === p.id;
    const enabled = isUnlocked(state, p.id, unlockAll);
    const btn = h('button', { type: 'button', 'aria-current': current ? 'step' : undefined, 'aria-disabled': enabled ? undefined : 'true', 'aria-label': `${p.label}${done ? ', done' : ''}${enabled ? '' : ', locked'}` },
      h('span', { class: 'node' }, done ? '✓' : String(i + 1)),
      h('span', { class: 'label' }, p.short),
      p.minutes ? h('span', { class: 'min' }, `${p.minutes} min`) : null);
    btn.addEventListener('click', () => { if (enabled) go(p.id); });
    rail.append(h('li', { class: `${done ? 'done' : ''} ${current ? 'current' : ''}`.trim() }, btn));
  });
}

const ctx = (): PartCtx => ({
  state, save, go, params,
  finish(id) {
    markComplete(state, id);
    const n = nextPart(id);
    if (n) { state.part = n; save(); render(true); } else { save(); render(false); }
  },
  restart: confirmRestart,
});

function render(moveFocus: boolean) {
  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;
  clear(main);
  const info = PARTS.find((p) => p.id === state.part)!;
  document.title = `${info.label} | Ground Truth`;
  paintRail();
  const holder = h('div', { class: 'fade-in' });
  main.append(holder);
  cleanup = REGISTRY[state.part](holder, ctx());
  if (moveFocus) { main.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
  if (location.hash !== `#/${state.part}`) history.replaceState(null, '', `#/${state.part}${location.search ? '' : ''}`);
}

function go(id: PartId) {
  if (!isUnlocked(state, id, unlockAll)) return;
  state.part = id;
  save();
  render(true);
}

function confirmRestart() {
  openModal({
    title: 'Start again?',
    body: [h('p', null, 'This clears your saved answers and points on this device. You cannot undo it.')],
    actions: [{ label: 'Keep my progress', variant: 'ghost' }, { label: 'Clear and start again', variant: 'primary', onClick: () => {
      clearProgress(storage);
      state = defaultState();
      saveState.textContent = '';
      render(true);
    } }],
  });
}

async function showCredits() {
  const groups = await loadAllSources();
  const seen = new Set<string>();
  const items = groups.flatMap((g) => g.sources).filter((so) => { const k = `${so.name}|${so.url}`; if (seen.has(k)) return false; seen.add(k); return true; });
  openModal({
    title: 'Data and image credits',
    body: [
      items.length ? h('ul', { class: 'stack-sm', style: 'padding-left:1.1rem;margin:0' }, items.map((so) => h('li', null, h('a', { href: so.url, target: '_blank', rel: 'noopener' }, so.name), h('span', { class: 'muted small' }, ` – ${so.licence}. `), h('span', { class: 'muted small' }, so.citation)))) : h('p', { class: 'muted' }, 'Data sources are listed here once the data files are loaded.'),
      h('p', { class: 'muted small', style: 'margin-top:1rem' }, 'Earth imagery: NASA Earth Observatory Blue Marble (public domain). Coastlines: Natural Earth (public domain). All charts, maps and artwork in this lesson were drawn for it. No AI-generated images.'),
    ],
  });
}

window.addEventListener('hashchange', () => {
  const id = location.hash.replace(/^#\//, '') as PartId;
  if (PARTS.some((p) => p.id === id) && id !== state.part && isUnlocked(state, id, unlockAll)) go(id);
});

// Honour a deep link, but never past what the student has unlocked.
const wanted = location.hash.replace(/^#\//, '') as PartId;
if (PARTS.some((p) => p.id === wanted) && isUnlocked(state, wanted, unlockAll)) state.part = wanted;

render(false);
if (hadSaved && state.part !== 'launch') {
  const info = PARTS.find((p) => p.id === state.part)!;
  const note = h('div', { class: 'resume-note', role: 'status' }, h('strong', null, 'Welcome back'), h('span', null, `Your progress was saved. You are back at “${info.label}”.`),
    Button('Dismiss', { variant: 'ghost', small: true, onClick: () => note.remove() }));
  main.prepend(note);
}
if (storage) save(); else saveState.textContent = 'Not saved: storage is blocked';
