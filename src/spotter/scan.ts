/** "Watch it scan": the globe shows the right satellite flying and painting the map for about 7 seconds. */
import { createGlobe, SATELLITES, subSatellitePoint, withPass, type GlobeApi } from '../globe';
import type { Eye, Mission } from './missions';

const DURATION_SIM_S = 7000;   // about 1.2 orbits
const TIME_SCALE = 1000;       // sim seconds per real second, so about 7 s on screen
const T_MID = 3500;
const PLACE: Record<string, string> = { ice: 'Arctic', forest: 'NSW', sea: 'Pacific Ocean', reef: 'Great Barrier Reef' };

export interface ScanHandle { skip(): void; dispose(): void }

export function mountScan(host: HTMLElement, mission: Mission, eye: Eye, cb: { onDone: () => void }): ScanHandle {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let globe: GlobeApi;
  try {
    globe = createGlobe(host, {
      controls: false, quality: 'auto', timeScale: TIME_SCALE, startPlaying: !reduced,
      view: { lat: mission.view.lat, lon: mission.view.lon, dist: mission.view.dist },
      ariaLabel: `Globe. The ${eye.name} satellite flies over ${PLACE[mission.id]} and paints a map.`,
    });
  } catch {
    host.textContent = 'The globe could not start on this device. Press Next to carry on.';
    queueMicrotask(cb.onDone);
    return { skip() {}, dispose() {} };
  }
  const spec = SATELLITES[eye.satKey];
  // Re-phase the real orbit so it passes over the mission's place half way through the scan.
  const o1 = withPass(spec.orbit, T_MID, Math.max(-80, Math.min(80, mission.view.lat)), true);
  const p = subSatellitePoint(o1, T_MID);
  const orbit = { ...o1, raanDeg: o1.raanDeg + (mission.view.lon - p.lon) };

  globe.add({ kind: 'sat', id: 'sp-sat', label: eye.real.replace('Real example: ', ''), orbit, color: eye.color, model: eye.model, showOrbit: false, size: 1.25 });
  globe.add({ kind: 'marker', id: 'sp-place', lat: mission.view.lat, lon: mission.view.lon, label: PLACE[mission.id], color: '#e8eefc' });
  globe.setSimTime(0);
  globe.setDescription(`The ${eye.name} satellite flying over ${PLACE[mission.id]} and painting a map.`);

  let done = false;
  const paint = (t1: number) => {
    globe.remove('sp-track'); globe.remove('sp-swath');
    if (t1 < 60) return;
    if (spec.swathKm > 0) globe.add({ kind: 'swath', id: 'sp-swath', orbit, t0: 0, t1, widthKm: spec.swathKm, stepS: 60, color: eye.color, opacity: 0.45 });
    globe.add({ kind: 'track', id: 'sp-track', orbit, t0: 0, t1, stepS: 60, color: eye.color, width: 3, opacity: 0.95 });
  };
  const finish = () => {
    if (done) return;
    done = true;
    window.clearInterval(timer); window.clearTimeout(wall);
    globe.pause();
    globe.setSimTime(DURATION_SIM_S);
    paint(DURATION_SIM_S);
    cb.onDone();
  };
  const timer = window.setInterval(() => {
    const t = globe.getSimTime();
    if (t >= DURATION_SIM_S) finish(); else paint(t);
  }, 250);
  // If the tab was in the background, never get stuck: finish after 9 s of real time.
  const wall = window.setTimeout(finish, 9000);
  if (reduced) finish();

  return {
    skip: finish,
    dispose() { window.clearInterval(timer); window.clearTimeout(wall); globe.dispose(); },
  };
}
