// Screenshot every part with ?unlock at 1366x768 and 375x812.  usage: node tools/qa/shots.mjs [tag]
import { launch, BASE, CH, sleep } from './cdp.mjs';
const tag = process.argv[2] || 'a';
const parts = ['launch', 'sensor-lab', 'reef', 'sea', 'forest', 'ice', 'briefing', 'debrief'];
const c = await launch();
try {
  for (const [w, h, m] of [[1366, 768, false], [375, 812, true]]) {
    await c.viewport(w, h, m);
    for (const p of parts) {
      await c.goto(`${CH}?unlock#/${p}`); await c.ev('location.reload()'); await sleep(1800);
      const o = await c.ev('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight})');
      console.log(w, p, JSON.stringify(o));
      await c.shot(`tools/qa/shots/${tag}-${p}-${w}.png`);
    }
  }
  console.log(c.logs.join('\n'));
} finally { await c.close(); }
