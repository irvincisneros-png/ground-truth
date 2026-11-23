/**
 * Sensor lab: four stations (thermal IR, radar altimeter, optical multispectral, passive microwave),
 * each showing raw signal -> derived quantity, then a trade-off card and a one-question check.
 */
import './sensor-lab.css';
import { createGlobe, type GlobeApi } from '../../globe';
import { CHECKS, STATIONS, TRADEOFFS, type StationDef, type StationId } from './data';
import type { LegendItem, Station, StationEnv, StationFactory, StationState } from './station';
import { checkCard, h, tradeoffCard } from './ui';
import { createThermalStation } from './stations/thermal';
import { createAltimeterStation } from './stations/altimeter';
import { createOpticalStation } from './stations/optical';
import { createMicrowaveStation } from './stations/microwave';

export interface SensorLabCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  save(): void;
  onDone(): void;
}

interface SensorLabState { stations: Record<StationId, StationState>; last?: StationId }

const FACTORIES: Record<StationId, StationFactory> = {
  thermal: createThermalStation,
  altimeter: createAltimeterStation,
  optical: createOpticalStation,
  microwave: createMicrowaveStation,
};

const emptyStation = (): StationState => ({ interactionDone: false, done: false, flags: {} });

function ensureState(root: Record<string, unknown>): SensorLabState {
  const cur = (root.sensorLab ?? {}) as Partial<SensorLabState>;
  const stations = (cur.stations ?? {}) as Partial<Record<StationId, StationState>>;
  for (const d of STATIONS) {
    const st = stations[d.id] ?? emptyStation();
    st.flags = st.flags ?? {};
    stations[d.id] = st;
  }
  cur.stations = stations as Record<StationId, StationState>;
  root.sensorLab = cur;
  return cur as SensorLabState;
}

export function mountSensorLab(root: HTMLElement, ctx: SensorLabCtx): () => void {
  const lab = ensureState(ctx.state ?? (ctx.state = {}));
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const gp = params.get('globe');

  // ------------------------------------------------------------ layout
  const wrap = h('div', { class: 'sl-root' });
  const live = h('div', { class: 'sl-sr', role: 'status', 'aria-live': 'polite' });
  const tablist = h('div', { class: 'sl-tabs', role: 'tablist', 'aria-label': 'Sensor stations' });
  const progress = h('div', { class: 'sl-progress', 'aria-live': 'polite' });
  const top = h('header', { class: 'sl-top' }, h('div', { class: 'sl-brand' }, h('span', { class: 'sl-brand-k' }, 'Sensor lab'), h('span', { class: 'sl-brand-t' }, 'Raw signal to derived measurement')), tablist, progress);

  const globeHost = h('div', { class: 'sl-globe' });
  const caption = h('p', { class: 'sl-gcap' });
  const legend = h('ul', { class: 'sl-legend', 'aria-label': 'Globe key' });
  const gtitle = h('div', { class: 'sl-ghead' }, h('span', { class: 'sl-dot' }), h('span', null, 'Orbit view'), h('span', { class: 'sl-ghead-sub' }, 'Drag to turn the globe. Arrow keys also rotate; plus and minus zoom.'));
  const globePanel = h('section', { class: 'sl-gpanel', 'aria-label': 'Orbit view' }, gtitle, globeHost, h('div', { class: 'sl-gfoot' }, caption, legend));
  const stationPanel = h('section', { class: 'sl-spanel' });
  wrap.append(top, h('div', { class: 'sl-main' }, globePanel, stationPanel), live);
  root.appendChild(wrap);

  const globe: GlobeApi = createGlobe(globeHost, {
    quality: gp === 'low' ? 'low' : 'auto',
    force2d: gp === '2d',
    view: { lat: -8, lon: 140, dist: 4.2 },
    timeScale: 300,
    ariaLabel: 'Orbit view of the Earth. Drag or use the arrow keys to rotate, plus and minus to zoom.',
  });

  const announce = (m: string) => { live.textContent = ''; window.setTimeout(() => { live.textContent = m; }, 30); };
  const setLegend = (items: LegendItem[]) => {
    legend.replaceChildren(...items.map((i) => h('li', null, h('i', { class: `sl-sw sl-sw--${i.kind ?? 'area'}`, style: `--c:${i.color}` }), i.label)));
  };

  // ------------------------------------------------------------ stations
  const sections = new Map<StationId, HTMLElement>();
  const stations = new Map<StationId, Station>();
  const built = new Set<StationId>();
  const tabs = new Map<StationId, HTMLButtonElement>();
  const builders = new Map<StationId, () => void>();
  const revealers = new Map<StationId, () => void>();
  let active: StationId | null = null;
  const banner = h('div', { class: 'sl-banner', hidden: true, role: 'status' });

  let doneFired = STATIONS.every((d) => lab.stations[d.id].done);
  const doneCount = () => STATIONS.filter((d) => lab.stations[d.id].done).length;
  const updateProgress = () => {
    const n = doneCount();
    progress.replaceChildren(
      h('span', { class: 'sl-prog-n' }, `${n} / 4`),
      h('span', { class: 'sl-pips', 'aria-hidden': 'true' }, ...STATIONS.map((d) => h('i', { class: lab.stations[d.id].done ? 'on' : '' }))),
      h('span', { class: 'sl-prog-l' }, 'stations complete'),
    );
    STATIONS.forEach((d) => {
      const t = tabs.get(d.id)!;
      t.dataset.done = String(lab.stations[d.id].done);
    });
    if (n === 4) {
      banner.hidden = false;
      banner.replaceChildren(
        h('div', null, h('strong', null, 'All four stations complete. '), 'You now know what each satellite really measures, and what it cannot see.'),
      );
      const btn = h('button', { type: 'button', class: 'sl-btn sl-btn--accent' }, 'Continue to the reef investigation');
      btn.addEventListener('click', () => ctx.onDone());
      banner.append(btn);
    } else banner.hidden = true;
  };

  const buildSection = (def: StationDef, idx: number): HTMLElement => {
    const st = lab.stations[def.id];
    const sec = h('article', { class: 'sl-station', id: `sl-st-${def.id}`, role: 'tabpanel', 'aria-labelledby': `sl-tab-${def.id}`, hidden: true });
    const head = h('header', { class: 'sl-sthead' },
      h('div', { class: 'sl-kicker' }, `Station ${idx + 1} of 4`, h('span', null, '·'), def.variable),
      h('h2', null, def.tab),
      h('p', { class: 'sl-lede' }, def.headline),
      h('ol', { class: 'sl-flow', 'aria-label': 'What the sensor gives us and what we work out' },
        h('li', null, h('span', null, 'Raw signal'), h('strong', null, def.raw)),
        h('li', { class: 'sl-flow-arrow', 'aria-hidden': 'true' }, '→'),
        h('li', null, h('span', null, 'Derived quantity'), h('strong', null, def.derived))));
    const interact = h('section', { class: 'sl-interact', 'aria-label': `${def.tab} interaction` });
    const tradeWrap = h('section', { class: 'sl-block sl-tradewrap', hidden: true, 'aria-label': 'Trade-off card' },
      h('h3', null, h('span', { class: 'sl-tag' }, 'Trade-offs'), `What ${def.tab.toLowerCase()} is good and bad at`), tradeoffCard(TRADEOFFS[def.id]));
    const checkWrap = h('section', { class: 'sl-block sl-checkwrap', hidden: true });
    const complete = h('section', { class: 'sl-block sl-complete', hidden: true });
    sec.append(head, interact, tradeWrap, checkWrap, complete);

    const next = () => STATIONS.find((d) => !lab.stations[d.id].done && d.id !== def.id);
    const markDone = () => {
      st.done = true;
      ctx.save();
      updateProgress();
      showComplete();
      announce(`${def.tab} station complete. ${doneCount()} of 4 done.`);
      if (doneCount() === 4 && !doneFired) { doneFired = true; ctx.onDone(); }
    };
    const showComplete = () => {
      complete.hidden = false;
      complete.replaceChildren(h('strong', null, `${def.tab} complete.`));
      const n = next();
      if (n) {
        const b = h('button', { type: 'button', class: 'sl-btn' }, `Next station: ${n.tab}`);
        b.addEventListener('click', () => select(n.id, true));
        complete.append(b);
      }
    };
    const reveal = () => {
      tradeWrap.hidden = false;
      if (!checkWrap.hidden) return;
      checkWrap.hidden = false;
      checkWrap.replaceChildren(checkCard(CHECKS[def.id], st.check, () => {
        if (!st.check) st.check = { attempts: 0, firstCorrect: false, solved: false };
        st.check.solved = true;
        markDone();
      }, (res) => {
        st.check = { attempts: res.attempts, firstCorrect: res.firstCorrect, solved: false };
        ctx.save();
      }));
      if (st.done) showComplete();
    };
    revealers.set(def.id, reveal);

    const env: StationEnv = {
      id: def.id, globe, host: interact, state: st, save: () => ctx.save(), announce,
      setCaption: (t) => { if (active === def.id) caption.textContent = t; },
      setLegend: (i) => { if (active === def.id) setLegend(i); },
      interactionDone: () => {
        if (!st.interactionDone) {
          st.interactionDone = true;
          ctx.save();
          announce('Interaction complete. The trade-off card and a check question are now below.');
        }
        const first = tradeWrap.hidden;
        reveal();
        if (first) window.setTimeout(() => tradeWrap.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }), 250);
      },
    };
    builders.set(def.id, () => {
      if (built.has(def.id)) return;
      built.add(def.id);
      stations.set(def.id, FACTORIES[def.id](env));
      if (st.interactionDone) reveal();
    });
    return sec;
  };

  STATIONS.forEach((d, i) => {
    const sec = buildSection(d, i);
    sections.set(d.id, sec);
    stationPanel.appendChild(sec);
    const tab = h('button', { type: 'button', class: 'sl-tab', role: 'tab', id: `sl-tab-${d.id}`, 'aria-controls': `sl-st-${d.id}`, 'aria-selected': 'false', tabindex: '-1' },
      h('span', { class: 'sl-tab-n' }, String(i + 1)), h('span', { class: 'sl-tab-t' }, h('strong', null, d.tab), h('em', null, d.variable)), h('span', { class: 'sl-tick', 'aria-hidden': 'true' }, '✓'));
    tab.addEventListener('click', () => select(d.id, true));
    tab.addEventListener('keydown', (e) => {
      const k = e.key;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)) return;
      e.preventDefault();
      const ix = k === 'Home' ? 0 : k === 'End' ? STATIONS.length - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + STATIONS.length) % STATIONS.length;
      select(STATIONS[ix].id, true);
      tabs.get(STATIONS[ix].id)!.focus();
    });
    tabs.set(d.id, tab);
    tablist.appendChild(tab);
  });
  stationPanel.appendChild(banner);

  function select(id: StationId, user: boolean): void {
    if (active === id) return;
    if (active) stations.get(active)?.leave();
    active = id;
    lab.last = id;
    STATIONS.forEach((d) => {
      const on = d.id === id;
      sections.get(d.id)!.hidden = !on;
      const t = tabs.get(d.id)!;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    builders.get(id)!();
    const def = STATIONS.find((d) => d.id === id)!;
    caption.textContent = def.globeCaption;
    legend.replaceChildren();
    globe.clear();
    stations.get(id)!.enter();
    stationPanel.scrollTop = 0;
    if (user) { ctx.save(); announce(`${def.tab} station`); }
  }

  updateProgress();
  const firstUndone = STATIONS.find((d) => !lab.stations[d.id].done);
  select(lab.last && STATIONS.some((d) => d.id === lab.last) ? lab.last : (firstUndone ?? STATIONS[0]).id, false);

  // ------------------------------------------------------------ cleanup
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (active) stations.get(active)?.leave();
    stations.forEach((s) => s.dispose());
    globe.dispose();
    wrap.remove();
  };
}
