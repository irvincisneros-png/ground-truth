// Orbit Run performance: fps and frame cost per quality tier, with the CPU throttled to stand in for a school Chromebook.
// Usage: GT_PORT=8805 GT_CDP_PORT=9477 node tools/qa/orbit-run-perf.mjs [throttle=4]
import { launch, BASE, sleep } from './cdp.mjs';
const RATE = Number(process.argv[2] || 4);
const c = await launch();
const O = (expr) => c.ev(`(()=>{const o=document.getElementById('app').__orbit;return ${expr}})()`);
const out = { throttle: RATE };
try {
  await c.viewport(1366, 768);
  await c.goto(BASE + 'src/orbit-run/dev.html'); await sleep(1500);
  const t0 = Date.now();
  while (await O('o.texturesBusy') && Date.now() - t0 < 60000) await sleep(100);
  out.texturesReadyMs = Date.now() - t0 + 1500;
  await c.click('[data-act=play]'); await sleep(300);
  for (const rate of [1, RATE]) {
    await c.send('Emulation.setCPUThrottlingRate', { rate });
    for (const q of [3, 2, 1]) {
      await O(`(o.setQuality(${q}),0)`);
      // a busy stretch: three zones, a cloud bank, junk, glint, collecting
      await O(`(()=>{const g=o.game;g.dist=640;g.t=10;g.easy=true;g.shields=3;let x=g.dist-500;g.segments=[['ocean',900],['forest',700],['sea',900],['ice',6000]].map(([zone,len],i)=>{const s={id:9000+i,zone,x0:x,x1:x+len,hinted:true,wrongT:0};x+=len;return s});g.nextZoneX=x;g.clouds=[{id:9100,x0:g.dist+250,x1:g.dist+900,hinted:true,seed:1234}];g.nextCloudX=g.dist+9000;g.junk=[[300,.8,0],[620,.2,1],[900,.7,2]].map(([dx,a,kind],i)=>({id:9200+i,x:g.dist+dx,a,r:23,vy:0,kind,rot:1,spin:.9,hitT:0}));g.nextJunkX=g.dist+9000;g.sensor='heat';return 0})()`);
      await sleep(600);
      // count real frames over 3 s, and time the draw itself
      const r = await c.ev(`new Promise((res)=>{const o=document.getElementById('app').__orbit;let n=0;const t0=performance.now();const tick=()=>{n++;if(performance.now()-t0<3000)requestAnimationFrame(tick);else res({fps:+(n*1000/(performance.now()-t0)).toFixed(1),drawMs:+o.drawMs.toFixed(2),quality:o.quality})};requestAnimationFrame(tick)})`);
      out[`x${rate}_q${q}`] = r;
    }
  }
  // how long the art takes to shade on a slow CPU (time-sliced, behind the start card), and the fps while it does
  await c.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await c.goto(BASE + 'src/orbit-run/dev.html');
  const t1 = Date.now(); let frames = 0;
  await c.ev(`(window.__n=0,(function f(){window.__n++;requestAnimationFrame(f)})(),0)`);
  while ((await O('o ? o.texturesBusy : true')) && Date.now() - t1 < 90000) await sleep(50);
  frames = await c.ev('window.__n');
  out[`x${RATE}_texturesReadyMs`] = Date.now() - t1 + 900; out[`x${RATE}_fpsWhileShading`] = +(frames * 1000 / (Date.now() - t1)).toFixed(1);
  await c.send('Emulation.setCPUThrottlingRate', { rate: 1 });
} catch (e) { console.error('perf error', e); out.error = String(e); }
finally { out.logs = c.logs; console.log(JSON.stringify(out, null, 1)); await c.close(); }
