import type { SensorId } from './content';
import { SENSOR_ORDER } from './content';

export interface InputOpts {
  stage: HTMLElement;
  onSensor(id: SensorId): void;
  onPause(): void;
  /** True while a run is actually being flown (keys only steer then). */
  isPlaying(): boolean;
}
export interface InputHandle { climbing(): boolean; release(): void; dispose(): void }

const CLIMB_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);

export function attachInput(o: InputOpts): InputHandle {
  const keys = new Set<string>();
  const pointers = new Set<number>();
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) o.onPause(); e.preventDefault(); return; }
    if (!o.isPlaying()) return;
    if (CLIMB_KEYS.has(e.code)) { keys.add(e.code); e.preventDefault(); return; }
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (m && !e.repeat) { o.onSensor(SENSOR_ORDER[Number(m[1]) - 1]); e.preventDefault(); }
  };
  const onKeyUp = (e: KeyboardEvent) => { if (keys.delete(e.code) && CLIMB_KEYS.has(e.code)) e.preventDefault(); };
  const onDown = (e: PointerEvent) => {
    if (!o.isPlaying()) return;
    if ((e.target as HTMLElement).closest('button, a, input, label')) return;
    pointers.add(e.pointerId);
    try { o.stage.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    e.preventDefault();
  };
  const onUp = (e: PointerEvent) => { pointers.delete(e.pointerId); };
  const clear = () => { keys.clear(); pointers.clear(); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clear);
  o.stage.addEventListener('pointerdown', onDown);
  o.stage.addEventListener('pointerup', onUp);
  o.stage.addEventListener('pointercancel', onUp);
  o.stage.addEventListener('lostpointercapture', onUp);
  return {
    climbing: () => keys.size > 0 || pointers.size > 0,
    release: clear,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
      o.stage.removeEventListener('pointerdown', onDown);
      o.stage.removeEventListener('pointerup', onUp);
      o.stage.removeEventListener('pointercancel', onUp);
      o.stage.removeEventListener('lostpointercapture', onUp);
    },
  };
}
