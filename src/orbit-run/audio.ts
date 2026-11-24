/**
 * Synthesised sound effects and background music (no audio files). The context is only created after a
 * user gesture. Music is a generative loop that gets busier and faster as the difficulty climbs.
 */
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
  power(): void;
  drain(): void;
  /** Start or resume the music loop. */
  musicOn(): void;
  /** Fade the music out (pause, game over, leaving). */
  musicOff(): void;
  /** 0 (calm) to 1 (intense). */
  setIntensity(d: number): void;
  dispose(): void;
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let lastCollect = 0, lastDrain = 0;
  // music state
  let music: GainNode | null = null, musicWanted = false, timer = 0, nextT = 0, stepN = 0, intensity = 0, noise: AudioBuffer | null = null;
  const ensure = (): AudioContext | null => {
    if (!sfx.enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.18; master.connect(ctx.destination);
        music = ctx.createGain(); music.gain.value = 0; music.connect(master);
      } catch { return null; }
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
  /* ---------- music: A minor, i - VI - III - VII, one bar each ---------- */
  const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
  const ARP = [0, 1, 2, 1, 2, 0, 2, 1];
  const note = (dest: AudioNode, f: number, t: number, dur: number, type: OscillatorType, gain: number, cutoff = 0) => {
    const c = ctx!; const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; o.connect(lp); lp.connect(g); } else o.connect(g);
    g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  };
  const pad = (dest: AudioNode, f: number, t: number, dur: number, gain: number) => {
    const c = ctx!; const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 14;
    lp.type = 'lowpass'; lp.frequency.value = 700 + intensity * 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  };
  const hat = (dest: AudioNode, t: number, gain: number) => {
    const c = ctx!;
    if (!noise) { noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.08), c.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noise; hp.type = 'highpass'; hp.frequency.value = 7000;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(dest); src.start(t); src.stop(t + 0.08);
  };
  const kick = (dest: AudioNode, t: number, gain: number) => {
    const c = ctx!; const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.25);
  };
  /** Schedules eighth notes a little ahead of time (standard Web Audio look-ahead scheduling). */
  const schedule = () => {
    if (!ctx || !music) return;
    const eighth = 30 / (100 + 26 * intensity);
    while (nextT < ctx.currentTime + 0.15) {
      const t = Math.max(nextT, ctx.currentTime + 0.01);
      const bar = Math.floor(stepN / 8) % 4, e = stepN % 8, ch = CHORDS[bar];
      if (e === 0) { for (const n of ch) pad(music, midi(n), t, eighth * 8, 0.035); }
      if (e === 0 || e === 4 || (intensity > 0.45 && (e === 3 || e === 7))) note(music, midi(ch[0] - 24), t, eighth * 1.6, 'sine', 0.22);
      const arpOn = intensity > 0.12 || e % 2 === 0;
      if (arpOn) note(music, midi(ch[ARP[e]] + 12 + (intensity > 0.7 && e >= 4 ? 12 : 0)), t, eighth * 0.9, 'triangle', 0.05 + intensity * 0.03, 1800 + intensity * 2500);
      if (intensity > 0.25 && e % 2 === 1) hat(music, t, 0.05 + intensity * 0.04);
      if (intensity > 0.5 && (e === 0 || e === 4)) kick(music, t, 0.35);
      nextT += eighth; stepN++;
    }
  };
  const fade = (to: number, secs: number) => {
    if (!ctx || !music) return;
    const g = music.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + secs);
  };
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = 0; } };

  const sfx: Sfx = {
    enabled: false,
    setEnabled(on) {
      sfx.enabled = on;
      if (on) { ensure(); tone(520, 780, 0.12, 'sine', 0.4); if (musicWanted) sfx.musicOn(); }
      else { const w = musicWanted; sfx.musicOff(); musicWanted = w; }
    },
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
    power() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.12, 'triangle', 0.32, i * 0.06)); },
    drain() {
      const c = ensure(); if (!c) return;
      if (c.currentTime - lastDrain < 0.7) return;
      lastDrain = c.currentTime;
      tone(220, 160, 0.18, 'square', 0.12); tone(220, 160, 0.18, 'square', 0.12, 0.22);
    },
    musicOn() {
      musicWanted = true;
      const c = ensure(); if (!c || !music) return;
      if (!timer) { nextT = c.currentTime + 0.05; timer = window.setInterval(schedule, 25); schedule(); }
      fade(0.55, 0.8);
    },
    musicOff() {
      musicWanted = false;
      fade(0, 0.4);
      stopTimer();
    },
    setIntensity(d) { intensity = Math.max(0, Math.min(1, d)); },
    dispose() { stopTimer(); try { void ctx?.close(); } catch { /* ignore */ } ctx = null; master = null; music = null; },
  };
  return sfx;
}
