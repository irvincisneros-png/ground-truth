import { h, clear } from '../ui/dom';
import { Button, Callout } from '../ui/components';
import { PartHeader, PartNav, type PartCtx, type PartMount } from './shared';

/** The interface the globe builder implements in src/parts/sensor-lab/index.ts. */
export interface SensorLabCtx {
  state: PartCtx['state'];
  save(): void;
  onDone(): void;
}
type MountSensorLab = (root: HTMLElement, ctx: SensorLabCtx) => () => void;

// A glob, not an import, so the build still works while the sensor lab does not exist yet.
const modules = import.meta.glob('./sensor-lab/index.ts') as Record<string, () => Promise<{ mountSensorLab?: MountSensorLab }>>;

export const mountSensor: PartMount = (root, ctx) => {
  const st = ctx.state.sensorLab;
  let cleanup: (() => void) | undefined;
  let alive = true;
  const holder = h('div');
  const nav = h('div');

  function paintNav() {
    clear(nav);
    nav.append(PartNav({ next: { label: 'On to the reef investigation', disabled: !st.done, onClick: () => ctx.finish('sensor-lab') }, hint: st.done ? undefined : 'Finish the four stations to continue' }),
      st.done ? h('span') : h('div', { class: 'row end no-print', style: 'margin-top:.5rem' }, Button('Skip the sensor lab', { variant: 'ghost', small: true, onClick: () => ctx.finish('sensor-lab') })));
  }

  root.append(
    PartHeader('Part 2 · Sensor lab · about 8 minutes', 'Four sensors, four different signals', 'Each station shows the raw signal a satellite records and how it becomes a number. There are no right or wrong sensors, only trade-offs.'),
    holder, nav);
  paintNav();

  const loader = Object.values(modules)[0];
  if (!loader) {
    holder.append(Callout('Sensor lab coming together', 'The four interactive stations are not installed in this build yet. You can carry on to the reef investigation.', 'warn'));
    return;
  }
  holder.append(h('p', { class: 'muted', role: 'status' }, 'Loading the sensor lab…'));
  loader().then((mod) => {
    if (!alive) return;
    clear(holder);
    if (typeof mod.mountSensorLab !== 'function') {
      holder.append(Callout('Sensor lab unavailable', 'The sensor lab did not start. You can carry on.', 'warn'));
      return;
    }
    cleanup = mod.mountSensorLab(holder, { state: ctx.state, save: ctx.save, onDone: () => { st.done = true; ctx.save(); paintNav(); } });
  }).catch(() => {
    if (!alive) return;
    clear(holder);
    holder.append(Callout('Sensor lab unavailable', 'The sensor lab could not load. You can carry on to the reef investigation.', 'warn'));
  });
  return () => { alive = false; cleanup?.(); };
};
