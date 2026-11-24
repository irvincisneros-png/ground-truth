/** Optional synthesised blips (no files). Off by default; the context is only created after a user gesture. */
export interface Sfx {
  enabled: boolean;
  setEnabled(on: boolean): void;
  collect(combo: number): void;
  hit(): void;
  edge(): void;
  switchEye(): void;
  hint(): void;
  orbit(): void;
  over(): void;
  dispose(): void;
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let lastCollect = 0;
  const ensure = (): AudioContext | null => {
    if (!sfx.enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.18; master.connect(ctx.destination); } catch { return null; }
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };
  const tone = (f0: number, f1: number, dur: number, type: OscillatorType = 'sine', gain = 0.5, delay = 0) => {
    const c = ensure(); if (!c || !master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  };
  const sfx: Sfx = {
    enabled: false,
    setEnabled(on) { sfx.enabled = on; if (on) { ensure(); tone(520, 780, 0.12, 'sine', 0.4); } },
    collect(combo) {
      const c = ensure(); if (!c) return;
      if (c.currentTime - lastCollect < 0.07) return;
      lastCollect = c.currentTime;
      const steps = [0, 2, 4, 7, 9, 12];
      const f = 523.25 * Math.pow(2, steps[Math.min(steps.length - 1, Math.floor(combo / 4))] / 12);
      tone(f, f * 1.5, 0.09, 'triangle', 0.32);
    },
    hit() { tone(180, 50, 0.35, 'sawtooth', 0.6); },
    edge() { tone(240, 120, 0.15, 'square', 0.25); },
    switchEye() { tone(660, 880, 0.05, 'square', 0.18); },
    hint() { tone(440, 440, 0.08, 'sine', 0.2); },
    orbit() { tone(523, 523, 0.1, 'triangle', 0.35); tone(659, 659, 0.1, 'triangle', 0.35, 0.1); tone(784, 784, 0.16, 'triangle', 0.35, 0.2); },
    over() { tone(392, 196, 0.5, 'triangle', 0.4); },
    dispose() { try { void ctx?.close(); } catch { /* ignore */ } ctx = null; master = null; },
  };
  return sfx;
}
