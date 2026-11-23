import '../styles/tokens.css';
import '../styles/base.css';
import './spotter.css';
import { h, clear } from '../ui/dom';
import { openModal } from '../ui/components';
import { loadData } from '../data/load';
import type { GmslPoint } from '../data/types';
import { EYES, EYE_IDS, FINISH_LINE, GLOSSARY, MISSIONS, MISSION_COUNT, NEW_WORDS, STEP_COUNT, STEP_NAMES, type EyeId, type Mission } from './missions';
import { advance, clearState, earnStamp, hasProgress, loadState, resumeLabel, safeStorage, saveState, stampCount, defaultState, type SpotterState } from './state';
import { icon } from './icons';
import { isSpeaking, onSpeaking, speak, speechSupported, stop as stopSpeech } from './speech';
import { loadImages, type ImagePair } from './images';
import { beforeAfter, imageComing, singleImage } from './slider';
import { buildSeaChart, latestYear, levelAtCm, readoutAt } from './sealevel';
import { mountScan, type ScanHandle } from './scan';
import { mountFrame, correctWords } from './frame';
import { buildReportText, missionSentence, todayText } from './report';
import { GLOSSARY_ICON, openCredits, openGlossary } from './glossary';

const BASE = import.meta.env.BASE_URL;
const storage = safeStorage();
let state: SpotterState = loadState(storage);
let images: Record<string, ImagePair> = {};
let gmsl: GmslPoint[] | null = null;
let cleanup: (() => void) | null = null;
let justStamped = -1;
/** Every visit opens on the start screen (with a Continue button if progress is saved). */
let atStart = true;

const app = document.getElementById('spotter')!;
const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
document.body.append(live);
const announce = (t: string) => { live.textContent = ''; window.setTimeout(() => { live.textContent = t; }, 30); };

const save = () => saveState(storage, state);
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

// ---------------------------------------------------------------- shared pieces

function listenButton(getText: () => string): HTMLElement | null {
  if (!speechSupported()) return null;
  const label = h('span', null, 'Listen');
  const ic = h('span', { class: 'sp-ic-slot' }, icon('speaker', { size: 30 }));
  const b = h('button', { type: 'button', class: 'sp-listen', 'aria-label': 'Read this screen aloud' }, ic, label);
  const paint = (on: boolean) => {
    label.textContent = on ? 'Stop' : 'Listen';
    ic.replaceChildren(icon(on ? 'stop' : 'speaker', { size: 30 }));
    b.setAttribute('aria-label', on ? 'Stop reading' : 'Read this screen aloud');
    b.classList.toggle('on', on);
  };
  const off = onSpeaking(paint);
  b.addEventListener('click', () => { if (isSpeaking()) stopSpeech(); else speak(getText()); });
  paint(isSpeaking());
  prevCleanups.push(off);
  return b;
}
let prevCleanups: (() => void)[] = [];

function stampSlots(): HTMLElement {
  return h('ol', { class: 'sp-stamps', 'aria-label': `${stampCount(state)} of ${MISSION_COUNT} stamps earned` },
    MISSIONS.map((m, i) => h('li', { class: `sp-slot${state.stamps[i] ? ' on' : ''}${justStamped === i ? ' pop' : ''}`, 'aria-label': `Mission ${m.n} stamp, ${state.stamps[i] ? 'earned' : 'not yet'}` },
      state.stamps[i] ? icon('stamp', { size: 30 }) : h('span', null, String(m.n)))));
}

function topBar(): HTMLElement {
  const inMission = !atStart && state.screen === 'mission';
  return h('header', { class: 'sp-top' },
    h('a', { class: 'sp-brand', href: BASE, 'aria-label': 'Satellite Spotter home' }, icon('satellite', { size: 34 }), h('span', null, 'Satellite Spotter')),
    inMission ? h('div', { class: 'sp-mission-tag' }, h('strong', null, `Mission ${state.mission + 1} of ${MISSION_COUNT}`), h('span', null, MISSIONS[state.mission].title)) : null,
    h('div', { class: 'sp-top-right' },
      stampSlots(),
      h('button', { type: 'button', class: 'sp-btn ghost sp-words', onclick: () => openGlossary() }, icon('book', { size: 28 }), h('span', null, 'Words'))));
}

function stepDots(): HTMLElement {
  return h('ol', { class: 'sp-dots', 'aria-label': `Step ${state.step + 1} of ${STEP_COUNT}: ${STEP_NAMES[state.step]}` },
    STEP_NAMES.map((n, i) => h('li', { class: i === state.step ? 'now' : i < state.step ? 'done' : '', 'aria-hidden': 'true' }, h('i'), h('span', null, n))));
}

function newWordBox(): HTMLElement | null {
  const id = NEW_WORDS[state.mission]?.[state.step];
  const g = GLOSSARY.find((x) => x.id === id);
  if (!g) return null;
  return h('p', { class: 'sp-newword' }, icon(GLOSSARY_ICON[g.id], { size: 40 }), h('span', null, h('strong', null, `New word: ${g.word}`), ' = ', g.text));
}

interface Screen {
  eyebrow: string;
  title: string;
  sub?: string;
  body: Node[];
  speak: string;
  primary: HTMLButtonElement;
  footLeft?: Node | null;
  className?: string;
}

function primary(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'sp-btn primary', 'aria-disabled': disabled ? 'true' : undefined }, label);
  b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') === 'true') { announce('Finish this step first.'); return; } onClick(); });
  return b;
}
const enable = (b: HTMLButtonElement, on = true) => { if (on) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true'); };

function card(s: Screen): HTMLElement {
  const listen = listenButton(() => s.speak);
  return h('section', { class: `sp-card ${s.className ?? ''}`.trim() },
    h('div', { class: 'sp-card-head' },
      h('div', { class: 'sp-card-title' },
        h('p', { class: 'sp-eyebrow' }, s.eyebrow),
        h('h1', { id: 'sp-h1', tabindex: '-1' }, s.title),
        s.sub ? h('p', { class: 'sp-sub' }, s.sub) : null),
      listen),
    h('div', { class: 'sp-body' }, ...s.body),
    h('div', { class: 'sp-foot' }, s.footLeft ?? null, s.primary));
}

function show(node: Node, focus = true) {
  clear(app);
  app.append(topBar(), h('main', { class: 'sp-main', id: 'sp-main' }, node), footer());
  if (focus) { (document.getElementById('sp-h1') ?? document.getElementById('sp-main'))?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
}

function runCleanups() {
  stopSpeech();
  prevCleanups.forEach((f) => f());
  prevCleanups = [];
  cleanup?.();
  cleanup = null;
}

function footer(): HTMLElement {
  return h('footer', { class: 'sp-footer' },
    h('a', { href: `${BASE}challenge.html` }, 'Challenge mode (harder)'),
    h('a', { href: `${BASE}teacher.html` }, 'Teacher guide'),
    h('button', { type: 'button', class: 'sp-link', onclick: () => { void openCredits(); } }, 'Credits'),
    hasProgress(state) ? h('button', { type: 'button', class: 'sp-link', onclick: confirmRestart }, 'Start again') : null);
}

function confirmRestart() {
  openModal({
    title: 'Start again?',
    body: [h('p', null, 'This clears your stamps and sentences on this device.')],
    actions: [
      { label: 'Keep my stamps', variant: 'ghost' },
      { label: 'Start again', variant: 'primary', onClick: () => { clearState(storage); state = defaultState(); justStamped = -1; atStart = true; render(); } },
    ],
  });
}

function go(next: SpotterState) {
  atStart = false;
  state = next;
  save();
  render();
}

// ---------------------------------------------------------------- Orbit Run (optional arcade game, built separately)

type OrbitMod = { mountOrbitRun?: (root: HTMLElement, o: { onExit(): void }) => () => void };
// import.meta.glob finds nothing (and the build still passes) until src/orbit-run/index.ts exists.
const orbitLoaders = import.meta.glob('../orbit-run/index.ts') as Record<string, () => Promise<OrbitMod>>;

function comingSoon(onExit: () => void): HTMLElement {
  const back = h('button', { type: 'button', class: 'sp-btn primary' }, 'Back');
  back.addEventListener('click', onExit);
  return h('section', { class: 'sp-card sp-coming-soon' }, h('div', { class: 'sp-coming' }, icon('satellite', { size: 56 }), h('strong', { id: 'sp-h1', tabindex: '-1' }, 'Orbit Run: coming soon'), h('span', null, 'This game is not ready yet. Try a mission.')), h('div', { class: 'sp-foot' }, back));
}

async function openOrbitRun() {
  runCleanups();
  atStart = false;
  const host = h('div', { class: 'sp-orbit' });
  clear(app);
  app.append(topBar(), h('main', { class: 'sp-main', id: 'sp-main' }, host), footer());
  const exit = () => { atStart = true; render(); };
  const load = Object.values(orbitLoaders)[0];
  const mod = load ? await load().catch(() => null) : null;
  if (mod?.mountOrbitRun) {
    const dispose = mod.mountOrbitRun(host, { onExit: exit });
    cleanup = typeof dispose === 'function' ? dispose : null;
  } else host.append(comingSoon(exit));
  document.title = 'Orbit Run | Satellite Spotter';
  (document.getElementById('sp-h1') ?? document.getElementById('sp-main'))?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function orbitCard(extraClass = ''): HTMLElement {
  const b = h('button', { type: 'button', class: `sp-orbit-card ${extraClass}`.trim() },
    icon('radar', { size: 56, color: '#7cc4ff' }),
    h('span', null, h('strong', null, 'Orbit Run: arcade game'), h('span', null, 'Fly a satellite. Match the right eye to the ground. Dodge space junk.')));
  b.addEventListener('click', () => { void openOrbitRun(); });
  return b;
}

// ---------------------------------------------------------------- start screen

function heroArt(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const wrap = document.createElementNS(ns, 'svg');
  wrap.setAttribute('viewBox', '0 0 420 300');
  wrap.setAttribute('class', 'sp-hero-art');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.innerHTML = `
    <defs><radialGradient id="sp-earth" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#2f78b8"/><stop offset=".6" stop-color="#1c4c86"/><stop offset="1" stop-color="#10284f"/></radialGradient></defs>
    <circle cx="210" cy="520" r="300" fill="url(#sp-earth)"/>
    <circle cx="210" cy="520" r="300" fill="none" stroke="#7cc4ff" stroke-opacity=".45" stroke-width="3"/>
    <path d="M70 250c30-18 54-16 76-4s46 10 70-6 60-14 92 8" fill="none" stroke="#4cc38a" stroke-width="12" stroke-linecap="round" stroke-opacity=".7"/>
    <path d="M300 62L240 215M300 62L330 214" stroke="#ffb547" stroke-opacity=".5" stroke-width="2" stroke-dasharray="5 6"/>
    <path d="M240 215Q285 228 330 214" fill="#ffb547" fill-opacity=".18"/>
    <g transform="translate(300 62) rotate(-18)">
      <rect x="-60" y="-14" width="42" height="28" rx="3" fill="#2f5fa8" stroke="#9fb0d4" stroke-width="2.5"/>
      <rect x="18" y="-14" width="42" height="28" rx="3" fill="#2f5fa8" stroke="#9fb0d4" stroke-width="2.5"/>
      <path d="M-44 -14v28M-30 -14v28M30 -14v28M44 -14v28" stroke="#9fb0d4" stroke-width="1.5" stroke-opacity=".6"/>
      <rect x="-18" y="-20" width="36" height="40" rx="6" fill="#e8eefc" stroke="#9fb0d4" stroke-width="2.5"/>
      <circle cx="0" cy="0" r="9" fill="#ffb547"/>
      <path d="M-6 26l6 12 6-12z" fill="#ffb547"/>
    </g>
    <g fill="#e8eefc" opacity=".8"><circle cx="40" cy="40" r="2"/><circle cx="120" cy="90" r="1.6"/><circle cx="380" cy="40" r="2.2"/><circle cx="355" cy="130" r="1.5"/><circle cx="70" cy="150" r="1.5"/></g>`;
  return wrap;
}

function startScreen(): Node {
  const resume = hasProgress(state);
  const startBtn = h('button', { type: 'button', class: 'sp-btn primary big', id: 'sp-start' }, resume ? resumeLabel(state) : 'Start mission 1', icon('arrow', { size: 28 }));
  startBtn.addEventListener('click', () => {
    if (resume) { go({ ...state, screen: state.screen === 'start' ? 'mission' : state.screen }); return; }
    go(advance(state));
  });
  const listen = listenButton(() => 'Satellite Spotter. Satellites watch Earth from space. Use them to check on our planet.');
  const picks = h('ol', { class: 'sp-preview', 'aria-label': 'The four missions' }, MISSIONS.map((m) => h('li', { class: state.stamps[m.n - 1] ? 'done' : '' },
    icon(({ ice: 'microwave', forest: 'colour', sea: 'radar', reef: 'heat' } as const)[m.id], { size: 44, color: EYES[m.bestEye].color }), h('span', null, `Mission ${m.n}`), h('strong', null, m.title))));
  return h('section', { class: 'sp-card sp-start' },
    h('div', { class: 'sp-start-text' },
      h('p', { class: 'sp-eyebrow' }, 'NSW Science Year 9'),
      h('h1', { id: 'sp-h1', tabindex: '-1' }, 'Satellite Spotter'),
      h('p', { class: 'sp-lede' }, 'Satellites watch Earth from space. Use them to check on our planet.'),
      h('div', { class: 'sp-start-actions' }, startBtn, listen),
      orbitCard(),
      resume && state.screen !== 'report' ? h('p', { class: 'sp-resume', role: 'status' }, `Your stamps are saved: ${stampCount(state)} of ${MISSION_COUNT}.`) : null,
      picks),
    h('div', { class: 'sp-start-art' }, heroArt()));
}

// ---------------------------------------------------------------- mission steps

const mission = (): Mission => MISSIONS[state.mission];
const next = () => go(advance(state));

function stepProblem(): Screen {
  const m = mission();
  const pair = images[m.id];
  const body: Node[] = [
    m.compare === 'sealevel' ? h('div', { class: 'sp-seaart' }, icon('sea', { size: 140, color: '#7cc4ff' }), h('span', null, 'Sea level: how high the sea is')) : singleImage(pair, 'after', `Satellite picture for ${m.title}`),
    newWordBox(),
  ].filter(Boolean) as Node[];
  const btn = primary('Next', next);
  btn.append(icon('arrow', { size: 26 }));
  return { eyebrow: STEP_NAMES[0], title: m.problem, sub: 'A satellite can help us find out.', body, speak: `${m.problem} A satellite can help us find out.`, primary: btn, className: 'step-problem' };
}

function stepEye(): Screen {
  const m = mission();
  const btn = primary('Next', next, true);
  btn.append(icon('arrow', { size: 26 }));
  const feedback = h('div', { class: 'sp-feedback', role: 'status', 'aria-live': 'polite' });
  const cards = h('div', { class: 'sp-eyes', role: 'group', 'aria-label': 'Four eyes. Pick the best one.' });
  let solved = false;
  const wrongSet = new Set<EyeId>();
  const els = new Map<EyeId, HTMLButtonElement>();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pick = (id: EyeId) => {
    if (solved) return;
    const eye = EYES[id];
    const ok = id === m.bestEye;
    const el = els.get(id)!;
    if (ok) {
      solved = true;
      el.classList.add('right'); el.setAttribute('aria-pressed', 'true');
      els.forEach((e, k) => { if (k !== id) { e.setAttribute('aria-disabled', 'true'); e.classList.add('off'); } });
      feedback.className = 'sp-feedback good';
      feedback.replaceChildren(icon('check', { size: 30 }), h('p', null, h('strong', null, 'Yes! '), `Because ${lowerFirst(m.reasons[id])}`));
      enable(btn);
      btn.focus({ preventScroll: true });
    } else {
      wrongSet.add(id);
      el.classList.add('wrong');
      if (!reduced) { el.classList.remove('wobble'); void el.offsetWidth; el.classList.add('wobble'); }
      el.setAttribute('aria-label', `${eye.name}. Not this one.`);
      const retry = h('button', { type: 'button', class: 'sp-btn small' }, 'Try again');
      retry.addEventListener('click', () => { feedback.className = 'sp-feedback'; feedback.replaceChildren(); const first = [...els.entries()].find(([k]) => !wrongSet.has(k)); (first ? first[1] : el).focus(); });
      feedback.className = 'sp-feedback bad';
      feedback.replaceChildren(icon('cross', { size: 30 }), h('p', null, h('strong', null, `Not the ${eye.name}. `), m.reasons[id]), retry);
      retry.focus({ preventScroll: true });
    }
  };
  EYE_IDS.forEach((id) => {
    const e = EYES[id];
    const b = h('button', { type: 'button', class: 'sp-eye', 'aria-pressed': 'false', style: `--eye:${e.color}` },
      icon(id, { size: 72, color: e.color }), h('strong', null, e.name), h('span', null, e.does));
    b.addEventListener('click', () => pick(id));
    els.set(id, b);
    cards.append(b);
  });
  const sub = NEW_WORDS[state.mission]?.[state.step] ? undefined : 'Tap the eye that can answer the problem.';
  return {
    eyebrow: STEP_NAMES[1], title: 'Which eye is best for this job?', sub,
    body: [newWordBox(), cards, feedback].filter(Boolean) as Node[],
    speak: `Which eye is best for this job? ${m.problem} ${EYE_IDS.map((i) => `${EYES[i].name}. ${EYES[i].does}`).join(' ')}`,
    primary: btn, className: 'step-eye',
  };
}

function stepScan(): Screen {
  const m = mission();
  const eye = EYES[m.bestEye];
  const btn = primary('Next', next, true);
  btn.append(icon('arrow', { size: 26 }));
  const host = h('div', { class: 'sp-globe', role: 'group', 'aria-label': 'Globe animation' });
  const status = h('p', { class: 'sp-scanstatus', role: 'status' }, 'Scanning…');
  const skip = h('button', { type: 'button', class: 'sp-btn ghost small' }, 'Skip');
  const handle: ScanHandle = mountScan(host, m, eye, {
    onDone: () => { status.textContent = `Scan done. ${eye.real.replace('Real example: ', 'Real satellite: ')}.`; skip.hidden = true; enable(btn); },
  });
  skip.addEventListener('click', () => { handle.skip(); btn.focus({ preventScroll: true }); });
  cleanup = () => handle.dispose();
  return {
    eyebrow: STEP_NAMES[2], title: 'Watch the satellite scan.', sub: eye.scanLine,
    body: [h('div', { class: 'sp-scanwrap' }, host, h('div', { class: 'sp-scanbar' }, status, skip))],
    speak: `Watch the satellite scan. ${eye.scanLine}`, primary: btn, className: 'step-scan',
  };
}

function stepCompare(): Screen {
  const m = mission();
  const btn = primary('Next', next, true);
  btn.append(icon('arrow', { size: 26 }));
  const readout = h('p', { class: 'sp-readout', role: 'status', 'aria-live': 'polite' });
  let moved = false;
  const touched = () => { if (!moved) { moved = true; enable(btn); } };
  const body: Node[] = [];
  let title = 'Slide the line. What changed?', sub: string;
  if (m.compare === 'images') {
    const pair = images[m.id];
    sub = 'Left is before. Right is after.';
    const slider = beforeAfter(pair, `Before and after pictures for ${m.title}`, () => touched());
    if (!pair) enable(btn);
    body.push(slider.el);
  } else if (!gmsl) {
    sub = 'The sea-level data is not ready yet.';
    body.push(imageComing('sea-level data'));
    enable(btn);
  } else {
    const data = gmsl;
    const chart = buildSeaChart(data);
    const range = h('input', { type: 'range', min: '0', max: '100', step: '1', value: '0', class: 'sp-sea-range', 'aria-label': 'Slide to move through the years from 1993 to now. Use the left and right arrow keys.' });
    const upd = () => { const p = Number(range.value); chart.set(p); readout.textContent = readoutAt(data, p); range.setAttribute('aria-valuetext', readoutAt(data, p)); if (p > 0) touched(); };
    range.addEventListener('input', upd);
    upd();
    const cm = Math.round(levelAtCm(data, latestYear(data) - 0.25));
    sub = `Real satellite data, 1993 to now. Today the sea is about ${cm} cm higher.`;
    title = 'Slide through the years. What changed?';
    body.push(h('div', { class: 'sp-sea' }, chart.el, range, readout,
      h('p', { class: 'sp-credit' }, `Data: NOAA satellite radar altimetry, global average. ${cm} cm is about the width of your hand.`)));
  }
  return { eyebrow: STEP_NAMES[3], title, sub, body, speak: `${title} ${sub}`, primary: btn, className: 'step-compare' };
}

function stepSay(): Screen {
  const m = mission();
  const done = !!state.stamps[state.mission];
  const frameHost = h('div', { class: 'sp-frame' });
  const stampHost = h('div', { class: 'sp-stampwrap' });
  const bonusHost = h('div', { class: 'sp-bonus' });
  const nextLabel = state.mission === MISSION_COUNT - 1 ? 'See my report card' : 'Next mission';
  const btn = h('button', { type: 'button', class: 'sp-btn primary' }, done ? nextLabel : 'Check my sentence', icon('arrow', { size: 26 }));
  let handle: ReturnType<typeof mountFrame>;
  let solvedNow = done;

  const showStamp = (animate: boolean) => {
    stampHost.replaceChildren(h('div', { class: `sp-stampbig${animate ? ' stamp-in' : ''}`, role: 'img', 'aria-label': `Mission ${m.n} stamp earned` },
      icon('stamp', { size: 84, color: '#ffb547' }), h('span', null, `Mission ${m.n} stamp`)));
    if (m.bonus) showBonus();
  };
  const showBonus = () => {
    const b = m.bonus!;
    const out = h('p', { class: 'sp-bonus-out', role: 'status', 'aria-live': 'polite' });
    const mk = (label: string, v: 'yes' | 'no') => {
      const x = h('button', { type: 'button', class: 'sp-btn' }, label);
      x.addEventListener('click', () => {
        if (v === b.answer) { out.className = 'sp-bonus-out good'; out.textContent = b.reveal; state.bonus = true; save(); }
        else { out.className = 'sp-bonus-out bad'; out.textContent = `${b.wrong} Try again.`; }
      });
      return x;
    };
    bonusHost.replaceChildren(h('h2', null, 'Bonus question'), h('p', { class: 'sp-bonus-q' }, b.question), h('div', { class: 'sp-bonus-btns' }, mk('Yes', 'yes'), mk('No', 'no')), out);
    if (state.bonus) { out.className = 'sp-bonus-out good'; out.textContent = b.reveal; }
  };

  btn.addEventListener('click', () => {
    if (solvedNow) { next(); return; }
    handle.check();
  });
  // mount after the host is in the DOM
  queueMicrotask(() => {
    handle = mountFrame(frameHost, m, {
      announce,
      initial: state.sentences[state.mission] ?? undefined,
      onSolved: (words) => {
        solvedNow = true;
        state = earnStamp(state, state.mission, words);
        justStamped = state.mission;
        save();
        btn.replaceChildren(nextLabel, icon('arrow', { size: 26 }));
        document.querySelector('.sp-stamps')?.replaceWith(stampSlots());
        showStamp(true);
        announce(`Mission ${m.n} stamp earned.`);
        btn.focus({ preventScroll: true });
      },
    });
    if (done) showStamp(false);
  });
  const sub = 'Tap a word, then tap a blank.';
  return {
    eyebrow: STEP_NAMES[4], title: 'Say what the satellite shows.', sub,
    body: [newWordBox(), frameHost, bonusHost].filter(Boolean) as Node[],
    footLeft: stampHost,
    speak: `Say what the satellite shows. ${sub} ${m.frame.parts.map((p) => (typeof p === 'number' ? 'blank' : p)).join('')}`,
    primary: btn, className: 'step-say',
  };
}

function missionScreen(): Node {
  const steps = [stepProblem, stepEye, stepScan, stepCompare, stepSay];
  const s = steps[state.step]();
  return h('div', { class: 'sp-stage' }, stepDots(), card(s));
}

// ---------------------------------------------------------------- report card

function reportScreen(): Node {
  const nameIn = h('input', { type: 'text', id: 'sp-name', class: 'sp-name', maxlength: '40', autocomplete: 'off', placeholder: 'Type your name (optional)', value: state.name });
  nameIn.addEventListener('input', () => { state.name = nameIn.value; save(); });
  const copied = h('span', { class: 'sp-copied', role: 'status', 'aria-live': 'polite' });
  const copy = h('button', { type: 'button', class: 'sp-btn' }, icon('copy', { size: 28 }), 'Copy');
  copy.addEventListener('click', async () => {
    const text = buildReportText(state);
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
      document.body.append(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    copied.textContent = 'Copied. You can paste it into a document.';
  });
  const print = h('button', { type: 'button', class: 'sp-btn primary' }, icon('print', { size: 28 }), 'Print');
  print.addEventListener('click', () => window.print());
  const listen = listenButton(() => `Mission report card. You earned ${stampCount(state)} stamps. ${FINISH_LINE}`);
  return h('section', { class: 'sp-card sp-report' },
    h('div', { class: 'sp-card-head' },
      h('div', { class: 'sp-card-title' }, h('p', { class: 'sp-eyebrow' }, 'Report card'), h('h1', { id: 'sp-h1', tabindex: '-1' }, 'Satellite Spotter report'),
        h('p', { class: 'sp-sub' }, `${stampCount(state)} of ${MISSION_COUNT} stamps earned.`)),
      listen),
    h('div', { class: 'sp-rep-meta' },
      h('label', { for: 'sp-name' }, 'Name'), nameIn, h('span', { class: 'sp-date' }, todayText())),
    h('ol', { class: 'sp-rep-list' }, MISSIONS.map((m, i) => {
      const t = missionSentence(state, i);
      return h('li', { class: state.stamps[i] ? 'ok' : 'todo' },
        h('span', { class: 'sp-rep-stamp' }, state.stamps[i] ? icon('stamp', { size: 52, color: '#ffb547' }) : h('em', null, 'Not yet')),
        h('div', null, h('strong', null, `Mission ${m.n}: ${m.title}`), h('p', null, t ?? 'Not finished yet. Go back and finish this mission.')));
    })),
    h('p', { class: 'sp-finish' }, FINISH_LINE),
    h('div', { class: 'sp-rep-actions no-print' }, print, copy,
      h('button', { type: 'button', class: 'sp-btn', onclick: () => { void openOrbitRun(); } }, icon('radar', { size: 28 }), 'Orbit Run'),
      h('button', { type: 'button', class: 'sp-btn ghost', onclick: confirmRestart }, icon('restart', { size: 28 }), 'Start again'), copied));
}

// ---------------------------------------------------------------- router

function render() {
  runCleanups();
  document.title = !atStart && state.screen === 'mission' ? `Mission ${state.mission + 1}: ${MISSIONS[state.mission].title} | Satellite Spotter` : 'Satellite Spotter | Ground Truth';
  if (atStart || state.screen === 'start') show(startScreen());
  else if (state.screen === 'report') show(reportScreen());
  else show(missionScreen());
}

async function boot() {
  const [imgs, sea] = await Promise.all([loadImages(), loadData('sealevel')]);
  images = imgs;
  gmsl = sea.ok ? sea.data.gmsl.filter((p) => p.t_year >= 1993) : null;
  render();
}

// Expose for the QA harness.
(window as unknown as { __spotter?: unknown }).__spotter = { get state() { return state; }, correctWords: (i: number) => correctWords(MISSIONS[i].frame) };
void boot();
