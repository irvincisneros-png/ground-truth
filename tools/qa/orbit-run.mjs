// Orbit Run QA: plays the game in headless Chrome, screenshots key moments, measures fps.
// Usage: GT_PORT=8803 node tools/qa/orbit-run.mjs [outdir]
import { launch, BASE, sleep } from './cdp.mjs';

const OUT = process.argv[2] || 'tools/qa/shots/orbit-run';
const URL = BASE + 'src/orbit-run/dev.html';
const c = await launch();
const O = (expr) => c.ev(`(()=>{const o=document.getElementById('app').__orbit;return ${expr}})()`);
const key = async (type, code, key = code) => c.send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: key === ' ' ? 32 : key.charCodeAt?.(0) || 0 });
const press = async (code, key) => { await key_(code, key); };
const key_ = async (code, k) => { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }); };
const hold = (down) => c.send('Input.dispatchKeyEvent', { type: down ? 'keyDown' : 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
const out = {};
try {
  // ---- landscape ----
  await c.viewport(1366, 768);
  await c.goto(URL); await sleep(1800);
  await c.shot(`${OUT}/01-start-1366.png`);
  await c.click('[data-act=play]'); await sleep(300);
  // fly: hold Space in a pulse pattern, keep the right eye
  let n = 0;
  const bot = async (secs) => { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) {
    const st = await O(`{a:o.game.a,seg:o.game.segments.find(s=>o.game.dist>=s.x0&&o.game.dist<s.x1)?.zone,sensor:o.game.sensor,over:o.game.over}`);
    const want = { ocean: '1', reef: '1', forest: '2', sea: '3', ice: '4' }[st.seg];
    if (want && ({ heat: '1', colour: '2', radar: '3', microwave: '4' }[st.sensor] !== want)) await key_('Digit' + want, want);
    // naive mid-band hold: climb under 0.5
    await hold(st.a < 0.5); await sleep(40); n++; } };
  console.error('bot start'); await bot(4); console.error('bot done'); await c.shot(`${OUT}/02-flight-collecting-1366.png`);
  out.fpsFlight = await O('o.fps');
  await O(`(o.ff(6),0)`); await bot(0.5); await c.shot(`${OUT}/03-flight-b-1366.png`);
  // cloud bank
  await O(`(()=>{const g=o.game;const cl=g.clouds.find(x=>x.x0>g.dist);g.dist=cl.x0+150;return 0})()`); await O('(o.game.sensor=\"heat\",0)'); await sleep(900);
  await c.shot(`${OUT}/04-cloud-1366.png`);
  // night
  await O(`(()=>{const g=o.game;const L=6400;g.dist=Math.ceil(g.dist/L-1)*L+L*0.68;return 0})()`); await O('(o.ff(0.2,true),0)'); await key_('Digit2', '2'); await sleep(700);
  await c.shot(`${OUT}/05-night-colour-1366.png`);
  await key_('Digit1', '1'); await sleep(700); await c.shot(`${OUT}/06-night-heat-1366.png`);
  // junk hit
  await hold(false);
  await O(`(()=>{const g=o.game;g.invuln=0;g.junk.push({id:9999,x:g.dist+330,a:g.a,r:24,vy:0,kind:1,rot:0.3,spin:0.3,hitT:0});return 0})()`);
  await sleep(900); await c.shot(`${OUT}/07-junk-incoming-or-hit-1366.png`);
  await O('(o.game.junk.forEach(j=>j.hitT===0&&j.x>o.game.dist&&(j.x=o.game.dist+140)),0)');
  await sleep(230); await c.shot(`${OUT}/08-hit-moment-1366.png`);
  // end run
  await O('(o.game.shields=0.0001,o.game.invuln=0,o.game.junk.push({id:9998,x:o.game.dist+10,a:o.game.a,r:24,vy:0,kind:0,rot:0,spin:0,hitT:0}),0)');
  await sleep(2200); await c.shot(`${OUT}/09-report-1366.png`);
  out.phaseAfter = await O('o.phase');
  out.best = await c.ev('localStorage.getItem("ground-truth:orbit-run:v1")');
  // pause
  await c.click('[data-act=again]'); await sleep(500); await key_('KeyP', 'p'); await sleep(300); await c.shot(`${OUT}/10-paused-1366.png`);
  out.paused = await O('o.phase'); await key_('Escape', 'Escape'); await sleep(200); out.resumed = await O('o.phase');
  // pointer hold climbs
  const a0 = await O('o.game.a');
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800, y: 250 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 800, y: 250, button: 'left', clickCount: 1 });
  await sleep(350); out.pointerClimb = await O('o.game.climb'); out.pointerDa = (await O('o.game.a')) - a0;
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 800, y: 250, button: 'left', clickCount: 1 });
  await sleep(100); out.pointerReleased = await O('o.game.climb');
  // eye button click
  await c.click('[data-sensor=radar]'); out.eyeClick = await O('o.game.sensor');
  // low quality fps
  await O('(o.setQuality(1),0)'); await sleep(1500); out.fpsQ1 = await O('o.fps'); await c.shot(`${OUT}/13-quality1-1366.png`); await O('(o.setQuality(3),0)');
  // fps measure
  await hold(false);
  await sleep(2500); out.fpsPlay = await O('o.fps'); out.quality = await O('o.quality');

  // ---- sensor-only mode via UI ----
  await c.goto(URL); await sleep(1200);
  await c.ev(`localStorage.removeItem('ground-truth:orbit-run:v1')`); await c.goto(URL); await sleep(1000);
  await c.click('.or-toggle'); await sleep(200); await c.shot(`${OUT}/11-start-easy-toggle-1366.png`);
  await c.click('[data-act=play]'); await sleep(200);
  await O('(o.ff(25,true),0)'); await key_('Digit1', '1'); await sleep(1200);
  await c.shot(`${OUT}/12-sensor-only-1366.png`);
  out.easyShields = await O('o.game.shields');

  // ---- portrait 375 ----
  await c.viewport(375, 740, true);
  await c.goto(URL); await sleep(1500); await c.shot(`${OUT}/20-start-375.png`);
  await c.click('[data-act=play]'); await sleep(300);
  await bot(3); await c.shot(`${OUT}/21-flight-375.png`);
  await O('(o.ff(12,true),0)'); await sleep(300); await c.shot(`${OUT}/22-flight2-375.png`);
  await O('(o.game.shields=0.0001,o.game.invuln=0,o.game.junk.push({id:9998,x:o.game.dist+10,a:o.game.a,r:24,vy:0,kind:0,rot:0,spin:0,hitT:0}),0)');
  await sleep(2200); await c.shot(`${OUT}/23-report-375.png`);
  out.phase375 = await O('o.phase');
  await c.viewport(1366, 768);
} catch (e) { console.error('QA error', e); }
finally {
  out.logs = c.logs;
  console.log(JSON.stringify(out, null, 1));
  await c.close();
}
