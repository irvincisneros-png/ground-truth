// Orbit Run QA: power-ups, boost badge, warm-up vs late junk. Usage: GT_PORT=8806 node tools/qa/orbit-run-power.mjs outdir
import { launch, BASE, sleep } from './cdp.mjs';
const OUT = process.argv[2] || 'tools/qa/shots/orbit-run-power';
const c = await launch();
const O = (expr) => c.ev(`(()=>{const o=document.getElementById('app').__orbit;return ${expr}})()`);
try {
  for (const [w, h, tag] of [[1366, 768, '1366'], [375, 740, '375']]) {
    await c.viewport(w, h);
    await c.goto(BASE + 'src/orbit-run/dev.html'); await sleep(1500);
    await c.click('[data-act=play]'); await sleep(2500);
    // three power-ups lined up ahead, at mid band
    await O(`(()=>{const g=o.game;g.junk=[];g.powerUps=[{id:9001,x:g.dist+260,a:0.5,kind:'repair',got:0},{id:9002,x:g.dist+480,a:0.62,kind:'solar',got:0},{id:9003,x:g.dist+700,a:0.4,kind:'boost',got:0}];g.nextPowerX=g.dist+5000;g.a=0.15;g.v=0;return 0})()`);
    await sleep(250); await c.shot(`${OUT}/p1-powerups-${tag}.png`);
    await O(`(()=>{const g=o.game;g.boost=6;g.a=0.4;g.powerUps=[{id:9010,x:g.dist+4,a:g.a,kind:'boost',got:0}];return 0})()`);
    await sleep(350); await c.shot(`${OUT}/p2-boost-${tag}.png`);
    // late game: jump to orbit 6
    await O(`(()=>{const g=o.game;g.dist=6400*6;g.junk=[];g.nextJunkX=g.dist+300;g.powerUps=[];g.nextPowerX=g.dist+3000;g.segments=[{id:1,zone:'forest',x0:g.dist-500,x1:g.dist+800,hinted:true,wrongT:0}];g.nextZoneX=g.dist+800;g.clouds=[];g.nextCloudX=g.dist+4000;g.shields=3;g.invuln=99;g.a=0.5;return 0})()`);
    await sleep(3500); await c.shot(`${OUT}/p3-late-${tag}.png`);
  }
  console.log(JSON.stringify(c.logs));
} catch (e) { console.log('QA error', e); }
await c.close();
