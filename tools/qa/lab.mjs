// Sensor lab layout shots at 1366x768: each station, both thermal platforms. usage: node tools/qa/lab.mjs tag
import { launch, BASE, CH, sleep } from './cdp.mjs';
const tag = process.argv[2] || 'lab';
const c = await launch();
try {
  await c.viewport(1366, 768);
  await c.goto(`${CH}?unlock#/sensor-lab`); await c.ev('localStorage.clear()'); await c.ev('location.reload()'); await sleep(2500);
  const tabs = ['thermal', 'altimeter', 'optical', 'microwave'];
  for (const t of tabs) {
    await c.click(`#sl-tab-${t}`); await sleep(2800);
    await c.shot(`tools/qa/shots/${tag}-${t}.png`);
    if (t === 'thermal') {
      await c.clickText('VIIRS'); await sleep(2800); await c.ev('window.scrollTo(0,0)'); await c.shot(`tools/qa/shots/${tag}-thermal-viirs.png`);
    }
  }
  console.log(c.logs.join('\n'));
} finally { await c.close(); }
