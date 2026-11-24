// Orbit Run visual audit: stages fixed scenes (zone, cloud, night, junk) and screenshots each one.
// GT_REDUCED=1 emulates prefers-reduced-motion.
// Usage: GT_PORT=8805 GT_CDP_PORT=9477 GT_CDP_PROFILE=/path node tools/qa/orbit-run-scenes.mjs outdir [only-prefix]
import { launch, BASE, sleep } from './cdp.mjs';

const OUT = process.argv[2] || 'tools/qa/shots/orbit-run-scenes';
const ONLY = process.argv[3] || '';
const URL = BASE + 'src/orbit-run/dev.html';
const c = await launch();
const O = (expr) => c.ev(`(()=>{const o=document.getElementById('app').__orbit;return ${expr}})()`);
const L = 6400;
const want = (n) => !ONLY || ONLY.split(',').some((p) => n.startsWith(p));
/** Stage a scene. phase = position in the orbit (0..1; night is 0.6..0.8). zones = [[zone, length]...] starting 500 behind the satellite. */
const scene = (o) => O(`(()=>{const g=o.game;const S=${JSON.stringify(o)};
  const k=S.orbit??0; g.dist=(k+S.phase)*${L}; g.orbit=k+1; g.t=10; g.easy=S.easy??true; g.over=false; g.shields=S.shields??3; g.invuln=0;
  let x=g.dist-500; g.segments=S.zones.map(([zone,len],i)=>{const s={id:9000+i,zone,x0:x,x1:x+len,hinted:S.nohint??true,wrongT:0};x+=len;return s});
  g.nextZoneX=x; g.clouds=(S.clouds||[]).map(([a,b],i)=>({id:9100+i,x0:g.dist+a,x1:g.dist+b,hinted:true,seed:1234+i*77}));
  g.nextCloudX=g.dist+6000; g.junk=(S.junk||[]).map(([dx,a,kind,r],i)=>({id:9200+i,x:g.dist+dx,a,r:r??23,vy:0,kind,rot:0.4+i,spin:0.9,hitT:0})); g.nextJunkX=g.dist+(S.junkAfter??6000);
  g.sensor=S.sensor; g.a=S.a??0.55; g.v=0; g.hint=null; g.combo=S.combo??0; g.mult=S.combo>=45?4:S.combo>=25?3:S.combo>=10?2:1; g.comboGap=0; if(S.score!=null)g.score=S.score; return 0})()`);
const shot = async (name, sc, wait = 700) => { if (!want(name)) return; await scene(sc); await sleep(wait); await c.shot(`${OUT}/${name}.png`); };
const out = {};
try {
  if (process.env.GT_REDUCED) await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await c.viewport(1366, 768);
  await c.goto(URL); await sleep(1800);
  await c.ev(`localStorage.removeItem('ground-truth:orbit-run:v1')`); await c.goto(URL); await sleep(1600);
  if (want('01')) await c.shot(`${OUT}/01-start.png`);
  await c.click('[data-act=play]'); await sleep(200);
  await O('(o.start(7),0)'); await sleep(2500);
  if (want('02')) await c.shot(`${OUT}/02-early-flight.png`);
  const Z = 4000;
  await shot('10-zone-ocean', { phase: 0.1, zones: [['ocean', Z]], sensor: 'heat', combo: 6 });
  await shot('11-zone-reef', { phase: 0.1, zones: [['reef', Z]], sensor: 'heat', combo: 6 });
  await shot('12-zone-forest', { phase: 0.1, zones: [['forest', Z]], sensor: 'colour', combo: 6 });
  await shot('13-zone-ice', { phase: 0.1, zones: [['ice', Z]], sensor: 'microwave', combo: 6 });
  await shot('14-zone-sea', { phase: 0.1, zones: [['sea', Z]], sensor: 'radar', combo: 6 });
  await shot('20-trans-ocean-sea', { phase: 0.1, zones: [['ocean', 1000], ['sea', Z]], sensor: 'heat' }, 500);
  await shot('21-trans-reef-forest', { phase: 0.1, zones: [['reef', 1000], ['forest', Z]], sensor: 'heat' }, 500);
  await shot('22-trans-sea-ice-ocean', { phase: 0.1, zones: [['sea', 900], ['ice', 500], ['ocean', Z]], sensor: 'radar' }, 500);
  await shot('23-wrong-hint', { phase: 0.1, zones: [['forest', Z]], sensor: 'radar', nohint: false }, 1500);
  await shot('30-cloud-heat-blocked', { phase: 0.1, zones: [['ocean', Z]], sensor: 'heat', clouds: [[-160, 520]] });
  await shot('31-cloud-radar-through', { phase: 0.1, zones: [['sea', Z]], sensor: 'radar', clouds: [[-160, 520]] });
  await shot('32-cloud-incoming', { phase: 0.1, zones: [['forest', Z]], sensor: 'colour', clouds: [[260, 900]] }, 500);
  await shot('40-dusk-terminator', { phase: 0.565, zones: [['forest', Z]], sensor: 'colour' }, 400);
  await shot('41-night-colour-blocked', { phase: 0.68, zones: [['forest', Z]], sensor: 'colour' });
  await shot('42-night-heat-ocean', { phase: 0.68, zones: [['ocean', 1100], ['ice', Z]], sensor: 'heat' });
  await shot('43-night-cloud-ice', { phase: 0.7, zones: [['ice', Z]], sensor: 'microwave', clouds: [[-100, 560]] });
  await shot('44-dawn', { phase: 0.815, zones: [['sea', Z]], sensor: 'radar' }, 400);
  await shot('50-junk-field', { phase: 0.1, zones: [['sea', Z]], sensor: 'radar', junk: [[150, 0.8, 0], [330, 0.25, 1], [520, 0.7, 2], [700, 0.4, 3]], easy: false, a: 0.5 }, 250);
  await shot('51-junk-near-miss', { phase: 0.1, zones: [['ocean', Z]], sensor: 'heat', junk: [[90, 0.72, 1, 26]], a: 0.5 }, 250);
  if (want('52')) { await scene({ phase: 0.1, zones: [['ocean', Z]], sensor: 'heat', junk: [[26, 0.5, 2, 26]], a: 0.5, easy: false }); await sleep(110); await c.shot(`${OUT}/52-junk-hit.png`); await sleep(350); await c.shot(`${OUT}/53-junk-hit-after.png`); }
  await shot('54-one-shield', { phase: 0.1, zones: [['reef', Z]], sensor: 'heat', shields: 1, combo: 4 }, 900);
  await shot('60-combo-x3', { phase: 0.1, zones: [['forest', Z]], sensor: 'colour', combo: 31, score: 412 }, 900);
  await shot('61-orbit4-fast', { phase: 0.3, orbit: 3, zones: [['sea', 900], ['forest', Z]], sensor: 'radar', combo: 12, junk: [[420, 0.75, 0], [456, 0.2, 3]], score: 903 }, 500);
  if (want('62')) { await scene({ phase: 0.9985, zones: [['ocean', Z]], sensor: 'heat' }); await sleep(600); await c.shot(`${OUT}/62-orbit-banner.png`); }
  if (want('63')) { await scene({ phase: 0.1, zones: [['ocean', Z]], sensor: 'heat', easy: false, a: 0.3 }); await c.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 }); await sleep(450); await c.shot(`${OUT}/63-climbing-thruster.png`); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 }); }
  // fps per quality tier, on a busy scene
  if (want('70')) for (const q of [3, 2, 1]) {
    await O(`(o.setQuality(${q}),0)`);
    await scene({ phase: 0.1, zones: [['reef', 900], ['forest', 900], ['ice', 900], ['sea', Z]], sensor: 'heat', clouds: [[200, 800]], junk: [[300, 0.8, 0], [600, 0.2, 1]], combo: 12 });
    await sleep(3200); out['fpsQ' + q] = +(await O('o.fps')).toFixed(1); out['qAfter' + q] = await O('o.quality');
    await c.shot(`${OUT}/70-quality${q}.png`);
  }
  await O('(o.setQuality(3),0)');
  if (want('80')) {
    await scene({ phase: 0.1, zones: [['ocean', Z]], sensor: 'heat' }); await sleep(300);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p', windowsVirtualKeyCode: 80 }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p', windowsVirtualKeyCode: 80 });
    await sleep(350); await c.shot(`${OUT}/80-paused.png`);
    await c.click('[data-act=resume]'); await sleep(200);
  }
  if (want('81')) {
    await O('(Object.assign(o.game.data,{temperature:84,forest:37,sea:52,ice:19}),o.game.score=318,o.game.easy=false,o.game.shields=0.0001,o.game.invuln=0,o.game.junk.push({id:9998,x:o.game.dist+10,a:o.game.a,r:24,vy:0,kind:0,rot:0,spin:0,hitT:0}),0)');
    await sleep(500); await c.shot(`${OUT}/81-game-over-moment.png`); await sleep(1800); await c.shot(`${OUT}/82-report.png`);
  }
  if (want('83')) {
    await c.goto(URL); await sleep(1400); await c.click('.or-toggle'); await sleep(250); await c.shot(`${OUT}/83-start-sensor-only.png`);
    await c.click('[data-act=play]'); await sleep(300);
    await scene({ phase: 0.1, zones: [['sea', 900], ['ice', Z]], sensor: 'radar', junk: [[380, 0.5, 1], [640, 0.62, 2]], easy: true }); await sleep(1100); await c.shot(`${OUT}/84-sensor-only-flight.png`);
  }
  // ---- portrait 375 ----
  if (want('9')) {
    await c.viewport(375, 740, true);
    await c.goto(URL); await sleep(1600); await c.shot(`${OUT}/90-start-375.png`);
    await c.click('[data-act=play]'); await sleep(300);
    await shot('91-reef-375', { phase: 0.1, zones: [['reef', 700], ['forest', Z]], sensor: 'heat', combo: 14, junk: [[150, 0.8, 0]] });
    await shot('92-hint-375', { phase: 0.1, zones: [['ice', Z]], sensor: 'heat', nohint: false, combo: 5 }, 1500);
    await shot('93-night-cloud-375', { phase: 0.68, zones: [['forest', Z]], sensor: 'colour', clouds: [[60, 500]] });
    await shot('94-sea-375', { phase: 0.1, zones: [['sea', 640], ['ocean', Z]], sensor: 'radar', junk: [[120, 0.3, 2]] });
    await O('(Object.assign(o.game.data,{temperature:84,forest:37,sea:52,ice:19}),o.game.score=318,o.game.easy=false,o.game.shields=0.0001,o.game.invuln=0,o.game.junk.push({id:9998,x:o.game.dist+10,a:o.game.a,r:24,vy:0,kind:0,rot:0,spin:0,hitT:0}),0)');
    await sleep(2300); await c.shot(`${OUT}/95-report-375.png`);
    await c.viewport(1366, 768);
  }
} catch (e) { console.error('QA error', e); out.error = String(e); }
finally {
  out.logs = c.logs;
  console.log(JSON.stringify(out, null, 1));
  await c.close();
}
