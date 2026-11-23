import { launch, BASE, sleep } from './cdp.mjs';
const c = await launch();
try {
  for (const [w, h, m] of [[1366, 768, false], [375, 812, true]]) {
    await c.viewport(w, h, m);
    await c.goto(`${BASE}teacher.html`); await sleep(1500);
    console.log(w, JSON.stringify(await c.ev('({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,over:[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&!e.closest(".t-scroll")).slice(0,5).map(e=>e.tagName+"."+e.className)})')));
    await c.shot(`tools/qa/shots/teacher-${w}.png`);
    await c.shot(`tools/qa/shots/teacher-${w}-full.png`, true);
  }
  console.log(c.logs.join('\n'));
} finally { await c.close(); }
