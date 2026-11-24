/** Orbit Run: mount point. `mountOrbitRun(root, { onExit })` returns a cleanup function. */
import './orbit-run.css';
import { DATA_LABEL, DATA_ORDER, DATA_SENSOR, FACTS, SENSORS, SENSOR_ORDER, ZONES } from './content';
import type { SensorId } from './content';
import { DT, difficultyAt, createGame, loadSave, recordRun, segmentAt, setSensor, step, writeSave, ORBIT_LEN } from './game';
import type { GameState } from './game';
import { attachInput } from './input';
import { createSfx } from './audio';
import { EYE_ICON, ICON, svg } from './icons';
import { computeView, createFx, fxEvents, fxUpdate, render, texturesBusy } from './render';
import type { Quality, View } from './render';

type Phase = 'start' | 'playing' | 'paused' | 'over';
const $ = <T extends HTMLElement>(r: ParentNode, sel: string) => r.querySelector(sel) as T;

export function mountOrbitRun(root: HTMLElement, opts: { onExit(): void }): () => void {
  const store = (() => { try { return window.localStorage; } catch { return null; } })();
  let save = loadSave(store);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const sfx = createSfx();
  sfx.enabled = save.sound;

  // which eye reads which ground: the one thing to remember (shown on the start and pause cards)
  const legend = `<div class="or-legend" role="list" aria-label="Which eye reads what">${SENSOR_ORDER.map((id) => `<div class="or-leg" role="listitem" style="--c:${SENSORS[id].color}"><span class="or-key">${SENSORS[id].key}</span>${svg(EYE_ICON[id], 'or-leg-icon')}<span class="or-leg-text"><b>${SENSORS[id].label}</b><small>${Object.values(ZONES).filter((z) => z.sensor === id).map((z, i) => (i ? z.label.toLowerCase() : z.label)).join(', ')}</small></span></div>`).join('')}</div>`;

  root.classList.add('or-root');
  if (root.getBoundingClientRect().height < 300) root.style.height = '100dvh';
  root.innerHTML = `
    <div class="or-stage">
      <canvas class="or-canvas" role="img" aria-label="Orbit Run game area. Hold to climb. Keys 1 to 4 switch sensor."></canvas>
      <div class="or-tools">
        <button class="or-tool" data-act="sound" type="button" aria-pressed="false" aria-label="Sound"></button>
        <button class="or-tool" data-act="pause" type="button" aria-label="Pause">${svg(ICON.pause)}</button>
      </div>
      <div class="or-overlay" data-ov="start">
        <div class="or-card or-start">
          <div class="or-start-main">
            <h1 class="or-title">Orbit Run</h1>
            <p class="or-line">Match the right eye to the ground below. Dodge the space junk.</p>
            <button class="or-btn or-primary" data-act="play" type="button">Play</button>
            <button class="or-toggle" data-act="easy" type="button" role="switch" aria-checked="false"><span class="or-switch"><span></span></span><span class="or-toggle-text"><b>Sensor-only mode</b><small>The satellite flies itself</small></span></button>
            <div class="or-best" data-el="best"></div>
            <button class="or-link" data-act="exit" type="button">Back to missions</button>
          </div>
          <div class="or-start-how">
            ${legend}
            <div class="or-climb" aria-label="Hold Space, the mouse or a finger to climb"><span class="or-key or-key-wide">Space</span>${svg(ICON.mouse)}${svg(ICON.touch)}<span class="or-climb-cap">${svg(ICON.up, 'or-ctl-arrow')} Hold to climb</span></div>
            <p class="or-note"><b>The wrong eye drains your power.</b> Don't touch the top or bottom.</p>
            <p class="or-note">Clouds block the heat and colour cameras. Night blocks the colour camera.</p>
          </div>
        </div>
      </div>
      <div class="or-overlay" data-ov="paused" hidden>
        <div class="or-card or-card-small">
          <h2 class="or-h2">Paused</h2>
          ${legend}
          <button class="or-btn or-primary" data-act="resume" type="button">Resume</button>
          <button class="or-link" data-act="exit" type="button">Back to missions</button>
        </div>
      </div>
      <div class="or-overlay" data-ov="over" hidden>
        <div class="or-card or-report" role="dialog" aria-label="Data report">
          <h2 class="or-h2">Data report</h2>
          <p class="or-reason" data-el="reason"></p>
          <div class="or-rows" data-el="rows"></div>
          <div class="or-sum"><div><span>Score</span><b data-el="score">0</b></div><div><span>Orbits</span><b data-el="orbits">0</b></div><div><span>Junk hits</span><b data-el="hits">0</b></div></div>
          <div class="or-newbest" data-el="newbest" hidden>New best score</div>
          <p class="or-fact" data-el="fact"></p>
          <div class="or-actions"><button class="or-btn or-primary" data-act="again" type="button">Fly again</button><button class="or-btn" data-act="exit" type="button">Back to missions</button></div>
        </div>
      </div>
      <div class="or-sr" aria-live="polite" data-el="live"></div>
    </div>
    <div class="or-bar" role="group" aria-label="Sensors">
      ${SENSOR_ORDER.map((id) => `<button class="or-eye" type="button" data-sensor="${id}" style="--c:${SENSORS[id].color}" aria-pressed="false" aria-label="${SENSORS[id].label}, key ${SENSORS[id].key}"><span class="or-eye-key">${SENSORS[id].key}</span>${svg(EYE_ICON[id], 'or-eye-icon')}<span class="or-eye-name">${SENSORS[id].label}</span><span class="or-eye-count" data-count="${SENSORS[id].data}">0</span></button>`).join('')}
    </div>`;

  const stage = $<HTMLElement>(root, '.or-stage');
  const canvas = $<HTMLCanvasElement>(root, '.or-canvas');
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const ov = { start: $<HTMLElement>(root, '[data-ov=start]'), paused: $<HTMLElement>(root, '[data-ov=paused]'), over: $<HTMLElement>(root, '[data-ov=over]') };
  const soundBtn = $<HTMLButtonElement>(root, '[data-act=sound]');
  const pauseBtn = $<HTMLButtonElement>(root, '[data-act=pause]');
  const easyBtn = $<HTMLButtonElement>(root, '.or-toggle');
  const live = $<HTMLElement>(root, '[data-el=live]');
  const eyes = [...root.querySelectorAll<HTMLButtonElement>('.or-eye')];
  const counts = [...root.querySelectorAll<HTMLElement>('.or-eye-count')];

  let phase: Phase = 'start';
  let easy = save.easy;
  let game: GameState = createGame(1, true);
  const newAttract = () => { game = createGame(++attractSeed, true); for (let i = 0; i < 540; i++) { attractAi(); step(game, DT, false); game.events.length = 0; } };
  let attract = true;
  let attractSeed = 1;
  let view: View = computeView(800, 500, 1);
  const fx = createFx(reduced);
  let raf = 0, last = 0, acc = 0, overTimer = 0;
  let frameEma = 1 / 60, lowFor = 0, lastHint = '';
  let suggested: SensorId | null = null;
  let drawMs = 0; // smoothed cost of drawing one frame (QA only)
  let disposed = false;
  let quality: Quality = 3;

  const input = attachInput({
    stage,
    isPlaying: () => phase === 'playing',
    onSensor: (id) => pick(id),
    onPause: () => { if (phase === 'playing') pause(); else if (phase === 'paused') resume(); },
  });

  function setSensorUi() {
    eyes.forEach((b) => { const on = b.dataset.sensor === game.sensor; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  }
  function updateCounts() {
    counts.forEach((el) => {
      const k = el.dataset.count as keyof GameState['data']; const n = String(game.data[k]);
      if (el.textContent === n) return;
      const up = Number(n) > Number(el.textContent); el.textContent = n;
      if (up && !reduced && phase === 'playing' && quality > 1) el.animate?.([{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 170, easing: 'ease-out' }); // each data point lands on its counter
    });
  }
  function setSoundUi() {
    soundBtn.innerHTML = svg(sfx.enabled ? ICON.soundOn : ICON.soundOff);
    soundBtn.setAttribute('aria-pressed', String(sfx.enabled));
    soundBtn.setAttribute('aria-label', sfx.enabled ? 'Sound on' : 'Sound off');
  }
  function setEasyUi() { easyBtn.setAttribute('aria-checked', String(easy)); easyBtn.classList.toggle('on', easy); }
  function setBestUi() {
    const b = easy ? save.bestEasy : save.best;
    $(root, '[data-el=best]').textContent = b > 0 ? `Best score: ${b}` : '';
  }
  function show(which: 'start' | 'paused' | 'over' | null) {
    (Object.keys(ov) as (keyof typeof ov)[]).forEach((k) => { ov[k].hidden = k !== which; });
  }
  function setPhase(p: Phase) {
    phase = p;
    root.dataset.phase = p;
    pauseBtn.hidden = p !== 'playing';
    if (p === 'playing' && !attract) sfx.musicOn(); else sfx.musicOff();
  }

  function pick(id: SensorId) {
    if (phase !== 'playing' || attract) return;
    if (game.sensor !== id) { setSensor(game, id); setSensorUi(); }
  }
  function startRun(seed?: number) {
    attract = false;
    game = createGame(seed ?? ((Date.now() ^ (Math.random() * 0x7fffffff)) | 0), easy);
    fx.particles = []; fx.orbs = []; fx.shake = 0; fx.hitFlash = 0; fx.banner = 0;
    input.release();
    setPhase('playing'); show(null); setSensorUi(); updateCounts();
    acc = 0;
  }
  function pause() { if (phase !== 'playing') return; input.release(); setPhase('paused'); show('paused'); $<HTMLElement>(ov.paused, '[data-act=resume]').focus(); }
  function resume() { if (phase !== 'paused') return; setPhase('playing'); show(null); acc = 0; last = 0; (document.activeElement as HTMLElement | null)?.blur?.(); }
  function finishRun() {
    const { save: sv, isBest } = recordRun(store, game.score, game.easy);
    save = { ...sv, sound: sfx.enabled, easy };
    writeSave(store, save);
    const rows = $(root, '[data-el=rows]');
    rows.innerHTML = DATA_ORDER.map((k) => `<div class="or-row" style="--c:${SENSORS[DATA_SENSOR[k]].color}">${svg(EYE_ICON[DATA_SENSOR[k]], 'or-row-icon')}<span>${DATA_LABEL[k]}</span><b>${game.data[k]}</b></div>`).join('');
    $(root, '[data-el=score]').textContent = String(game.score);
    $(root, '[data-el=orbits]').textContent = (game.dist / ORBIT_LEN).toFixed(1);
    $(root, '[data-el=hits]').textContent = String(game.junkHits);
    $(root, '[data-el=reason]').textContent = game.endReason === 'power' ? 'Out of power. Use the right eye to keep it charged.' : 'Shields gone. Dodge the junk and stay off the edges.';
    $<HTMLElement>(root, '[data-el=newbest]').hidden = !(isBest && game.score > 0);
    $(root, '[data-el=fact]').textContent = FACTS[(sv.runs - 1) % FACTS.length];
    setPhase('over'); show('over'); updateCounts();
    $<HTMLElement>(ov.over, '[data-act=again]').focus();
  }

  /* ---------- clicks ---------- */
  const onClick = (e: Event) => {
    const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!t) return;
    const act = t.dataset.act;
    const eye = t.dataset.sensor as SensorId | undefined;
    if (eye) { pick(eye); sfx.switchEye(); if ((e as MouseEvent).detail > 0) t.blur(); return; }
    if (act === 'play' || act === 'again') { sfx.setEnabled(sfx.enabled); startRun(); }
    else if (act === 'easy') { easy = !easy; save.easy = easy; writeSave(store, save); setEasyUi(); setBestUi(); }
    else if (act === 'sound') { sfx.setEnabled(!sfx.enabled); save.sound = sfx.enabled; writeSave(store, save); setSoundUi(); }
    else if (act === 'pause') pause();
    else if (act === 'resume') resume();
    else if (act === 'exit') { cleanup(); opts.onExit(); }
  };
  root.addEventListener('click', onClick);
  const onVis = () => { if (document.hidden) { if (phase === 'playing') pause(); } else { last = 0; } };
  document.addEventListener('visibilitychange', onVis);

  /* ---------- sizing ---------- */
  const resize = () => {
    const r = stage.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, quality === 1 ? 1 : 2);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    view = computeView(r.width, r.height, dpr);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  /* ---------- loop ---------- */
  function attractAi() {
    const seg = segmentAt(game, game.dist + 260);
    const want = ZONES[seg.zone].sensor;
    if (game.sensor !== want) setSensor(game, want);
  }
  function frame(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    // adaptive quality
    frameEma += (dt - frameEma) * 0.08;
    if (texturesBusy()) { lowFor = 0; frameEma = Math.min(frameEma, 1 / 50); } // art is still being drawn: not a fair fps sample
    else if (phase === 'playing' || phase === 'start') {
      if (1 / frameEma < 45 && quality > 1) { lowFor += dt; if (lowFor > 1.5) { quality = (quality - 1) as Quality; fx.quality = quality; lowFor = 0; frameEma = 1 / 60; resize(); } }
      else lowFor = Math.max(0, lowFor - dt);
    }
    const stepping = phase === 'playing' || phase === 'start' || (phase === 'over' && overTimer > 0);
    let climbing = false;
    if (phase === 'playing' || phase === 'start') {
      acc += dt;
      climbing = phase === 'playing' && input.climbing();
      while (acc >= DT) {
        if (attract) attractAi();
        step(game, DT, climbing);
        acc -= DT;
        const live = phase === 'playing' && !attract;
        if (live && game.draining) sfx.drain();
        if (game.events.length) {
          fxEvents(fx, game, view, game.events);
          if (live) for (const e of game.events) {
            if (e.type === 'collect') sfx.collect(e.combo);
            else if (e.type === 'hit') sfx.hit();
            else if (e.type === 'edge') sfx.edge();
            else if (e.type === 'hint') sfx.hint();
            else if (e.type === 'orbit') sfx.orbit();
            else if (e.type === 'power') sfx.power();
            else if (e.type === 'over' && phase === 'playing') { sfx.over(); overTimer = 1.0; }
          }
          game.events.length = 0;
        }
        if (attract && game.over) newAttract();
      }
      sfx.setIntensity(difficultyAt(game.dist));
      if (game.over && phase === 'playing') { setPhase('over'); }
    }
    if (phase === 'over' && stepping) {
      overTimer -= dt;
      if (overTimer <= 0) { overTimer = 0; finishRun(); }
    }
    const d0 = performance.now();
    fxUpdate(fx, game, view, phase === 'paused' ? 0 : dt, climbing);
    render(ctx, game, view, fx, climbing, easy ? save.bestEasy : save.best, phase !== 'start');
    drawMs += (performance.now() - d0 - drawMs) * 0.05;
    if (phase !== 'paused') {
      updateCounts();
      if (!attract && game.hint && game.hint.text !== lastHint) { lastHint = game.hint.text; live.textContent = lastHint; }
      if (!game.hint) lastHint = '';
      // a hint that names an eye also lights that eye's button
      const want = !attract && phase === 'playing' && game.hint ? Object.values(ZONES).find((z) => z.hint === game.hint!.text)?.sensor ?? null : null;
      const sug = want && want !== game.sensor ? want : null;
      if (sug !== suggested) { suggested = sug; eyes.forEach((b) => b.classList.toggle('suggest', b.dataset.sensor === sug)); }
    }
    if (!attract && phase === 'playing' && !eyes.some((b) => b.classList.contains('on') && b.dataset.sensor === game.sensor)) setSensorUi();
  }

  newAttract();
  setSoundUi(); setEasyUi(); setBestUi(); setPhase('start'); show('start');
  resize();
  setSensorUi();
  raf = requestAnimationFrame(frame);
  // dev/QA hook (read-only access to state, plus a seed-able start)
  (root as HTMLElement & { __orbit?: unknown }).__orbit = { get game() { return game; }, get phase() { return phase; }, get quality() { return quality; }, get fps() { return 1 / frameEma; }, get drawMs() { return drawMs; }, get texturesBusy() { return texturesBusy(); }, start: startRun, ff(sec: number, pilot = true) { const was = game.easy; if (pilot) game.easy = true; for (let i = 0; i < sec / DT; i++) { step(game, DT, false); game.events.length = 0; } game.easy = was; }, setQuality(q: Quality) { quality = q; fx.quality = q; resize(); } };

  function cleanup() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    input.dispose();
    ro.disconnect();
    root.removeEventListener('click', onClick);
    document.removeEventListener('visibilitychange', onVis);
    sfx.dispose();
    root.classList.remove('or-root');
    root.removeAttribute('data-phase');
    root.innerHTML = '';
    delete (root as HTMLElement & { __orbit?: unknown }).__orbit;
  }
  return cleanup;
}
