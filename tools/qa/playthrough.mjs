// Full student playthrough (no ?unlock), headless Chrome over CDP.  usage: node tools/qa/playthrough.mjs [tag] [width]
import { launch, BASE, CH, sleep } from './cdp.mjs';
const tag = process.argv[2] || 'pt';
const W = Number(process.argv[3] || 1366), Hh = W < 600 ? 812 : 768;
const c = await launch();
const issues = [];
const note = (m) => { issues.push(m); console.log('  !! ' + m); };
const shot = (n, full = false) => c.shot(`tools/qa/shots/${tag}-${W}-${n}.png`, full);
const part = () => c.ev('location.hash');
const text = (sel = 'main') => c.ev(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`);
async function btn(label, opts = {}) {
  const p = await c.ev(`(()=>{const t=${JSON.stringify(label)};const e=[...document.querySelectorAll('button,a.btn')].filter(x=>x.offsetParent&&!x.disabled&&x.getAttribute('aria-disabled')!=='true'&&x.textContent.trim().includes(t))[${opts.nth ?? 0}];if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  if (!p) throw new Error('no enabled button: ' + label);
  await c.mouse(p[0], p[1]); await sleep(opts.wait ?? 350);
}
async function answer(legend, idx = 0) {
  const p = await c.ev(`(()=>{const f=[...document.querySelectorAll('fieldset')].filter(x=>x.offsetParent&&x.querySelector('legend')?.textContent.includes(${JSON.stringify(legend)}))[0];if(!f)return null;const l=f.querySelectorAll('label')[${idx}];l.scrollIntoView({block:'center'});const r=l.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  if (!p) throw new Error('no question: ' + legend);
  await c.mouse(p[0], p[1]); await sleep(200);
}
const overflow = async (label) => {
  const o = await c.ev(`(()=>{const de=document.documentElement;const bad=[...document.querySelectorAll('main *, header *, nav *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>de.clientWidth+2&&!e.closest('.data-table-wrap,.t-scroll,.rail,.gt-globe__labels,svg')}).slice(0,4).map(e=>e.tagName+'.'+String(e.className).slice(0,30));return {sw:de.scrollWidth,cw:de.clientWidth,bad}})()`);
  if (o.sw > o.cw + 1 || o.bad.length) note(`${label}: horizontal overflow ${JSON.stringify(o)}`);
};
const errs = () => { const l = c.logs.splice(0); l.forEach((x) => note('console: ' + x)); };
async function step(name, fn) {
  console.log('> ' + name);
  try { await fn(); } catch (e) { note(`STAGE ${name} FAILED: ${e.message.slice(0, 300)}`); await shot('fail-' + name.replace(/\W+/g, '_')).catch(() => {}); }
  errs();
}

try {
  await c.viewport(W, Hh, W < 600);
  await c.goto(CH); await c.ev('localStorage.clear()'); await c.goto(CH); await sleep(800);

  await step('launch', async () => {
    await shot('01-launch-fresh');
    const h1 = await text('h1'); console.log('  h1:', h1);
    await overflow('launch');
    await answer('What does a satellite actually record', 1);
    await btn('Lock in my answer');
    await shot('02-launch-locked');
    await btn('Begin the mission'); await sleep(1800);
    if (!(await part()).includes('sensor-lab')) note('launch did not move to sensor lab: ' + (await part()));
  });

  const checkQ = async () => {
    // answer the station's check question, trying options until right
    for (let i = 0; i < 4; i++) {
      const done = await c.ev(`!!document.querySelector('.sl-station:not([hidden]) .sl-option.is-right')`);
      if (done) return;
      const p = await c.ev(`(()=>{const l=[...document.querySelectorAll('.sl-station:not([hidden]) .sl-checkwrap:not([hidden]) .sl-option')].filter(x=>!x.classList.contains('is-wrong'))[0];if(!l)return null;l.scrollIntoView({block:'center'});const r=l.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!p) throw new Error('no check option');
      await c.mouse(p[0], p[1]); await sleep(300);
    }
  };
  const selTab = async (id) => { await c.click(`#sl-tab-${id}`); await sleep(1800); };
  const rectNS = (sel) => c.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height]})()`);
  const rect = (sel) => c.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2,r.width,r.height]})()`);

  await step('lab thermal', async () => {
    await sleep(1500); await shot('03-lab-thermal-start'); await overflow('lab');
    await rect('.sl-scene-stage'); const cl = await rectNS('.sl-cloud ellipse'); const px = await rectNS('.sl-pixbox');
    await c.drag(cl[0], cl[1], px[0], px[1]); await sleep(400);
    await shot('04-lab-thermal-covered');
    const dis = await c.ev(`document.querySelector('.sl-th-side .sl-btn--accent').disabled`);
    if (dis) note('thermal: gap-filled button still disabled after dragging the cloud over the reef');
    await btn('Show gap-filled product'); await sleep(500);
    await shot('05-lab-thermal-blend');
    await checkQ(); await sleep(400); await shot('06-lab-thermal-done', true);
    if (!(await c.ev(`!![...document.querySelectorAll('.sl-complete')].find(x=>!x.hidden)`))) note('thermal: no completion block');
  });

  await step('lab altimeter', async () => {
    await selTab('altimeter'); await sleep(800);
    const ok = await c.ev(`(()=>{const s=document.querySelector('#sl-alt-slider');for(let v=-8;v<=8;v+=0.05){s.value=v.toFixed(2);s.dispatchEvent(new Event('input',{bubbles:true}));if(document.querySelector('.sl-matchline.is-ok'))return v}return null})()`);
    console.log('  matched offset', ok); if (ok === null) note('altimeter: could not match eddy height with slider');
    await btn('Take 100'); await sleep(500);
    await shot('07-lab-altimeter');
    await checkQ(); await sleep(300); await shot('08-lab-altimeter-done', true);
  });

  await step('lab optical', async () => {
    await selTab('optical'); await sleep(800);
    for (const id of ['forest', 'burnt', 'bare', 'cloud', 'water']) {
      const ok = await c.ev(`(()=>{const i=document.querySelector('#sl-opt-${id}');if(!i)return false;i.click();return true})()`);
      if (!ok) { console.log('  no surf', id); continue; }
      await sleep(200);
    }
    await shot('09-lab-optical-spectrum');
    await c.ev(`document.querySelector('#sl-opt-night').click()`); await sleep(400);
    await shot('10-lab-optical-night');
    await checkQ(); await sleep(300); await shot('11-lab-optical-done', true);
  });

  await step('lab microwave', async () => {
    await selTab('microwave'); await sleep(800);
    const r = await rect('.sl-ice-canvas');
    for (const [fx, fy] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.6], [0.4, 0.8]]) await c.mouse(r[0] - r[2] / 2 + r[2] * fx, r[1] - r[3] / 2 + r[3] * fy);
    await c.ev(`(()=>{const s=document.querySelector('#sl-mw-th');s.value='40';s.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(300);
    await shot('12-lab-microwave-threshold');
    await btn('Optical camera'); await c.ev(`document.querySelector('#sl-mw-night').click()`); await sleep(400);
    await shot('13-lab-microwave-night');
    await checkQ(); await sleep(300); await shot('14-lab-microwave-done', true);
    const banner = await c.ev(`!![...document.querySelectorAll('.sl-banner')].find(x=>!x.hidden)`);
    if (!banner) note('lab: no all-four-complete banner');
  });

  await step('sensor continue', async () => {
    await btn('On to the reef investigation'); await sleep(1500);
    if (!(await part()).includes('reef')) note('did not reach reef: ' + (await part()));
  });

  await step('reef 0 predict', async () => {
    await shot('15-reef-predict'); await overflow('reef predict');
    await answer('bleached', 0); await answer('How sure', 1);
    await btn('Commit prediction'); await sleep(400);
    await shot('16-reef-predict-locked');
  });
  await step('reef 1 flight', async () => {
    await shot('17-reef-flight');
    await answer('Where do you send', 2);
    await btn('Fly this survey'); await sleep(500); await shot('18-reef-flight-modal');
    await btn('Fly now'); await sleep(700);
  });
  await step('reef 2 reveal', async () => {
    await shot('19-reef-reveal'); await shot('19b-reef-reveal-full', true); await overflow('reef reveal');
    const t = await text('main');
    for (const needle of ['regional virtual station', '0.97', '8.94']) if (!t.includes(needle)) note(`reef reveal missing text: ${needle}`);
    await btn('Check against the ground'); await sleep(600);
  });
  await step('reef 3 ground', async () => {
    await shot('20-reef-ground');
    await answer('Why do the two lines differ', 0); await sleep(400); await shot('21-reef-ground-answered');
    await btn('Compare the peaks'); await sleep(600);
  });
  await step('reef 4 compare', async () => {
    await shot('22-reef-compare');
    const d = await (await fetch('http://localhost:8800/ground-truth/data/reef.json')).json();
    const pk = d.reefs.map((r) => r.peakDhwBySummer['2024']).sort((a, b) => b - a);
    await c.ev(`(()=>{const set=(id,v)=>{const e=document.querySelector(id);e.focus();e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))};set('#q-peak','${pk[0]}');set('#q-ratio','${(pk[0] / pk[2]).toFixed(2)}')})()`);
    await btn('Check my numbers'); await sleep(400); await shot('23-reef-compare-checked');
    await btn('Now the limits'); await sleep(600);
  });
  await step('reef 5 limits', async () => {
    await shot('24-reef-limits');
    const hasScale = await c.ev(`[...document.querySelectorAll('.choice')].some(l=>/regional/i.test(l.textContent))`);
    if (!hasScale) note('limits: no regional-scale card');
    await answer('Limitations on what we can conclude', 1); await answer('Limitations on what we can conclude', 2);
    await btn('Submit limitations'); await sleep(500); await shot('25-reef-limits-done', true);
    await btn('On to the transfer cases'); await sleep(1500);
    if (!(await part()).includes('sea')) note('did not reach sea: ' + (await part()));
  });

  await step('sea', async () => {
    await shot('26-sea-0'); await overflow('sea');
    await answer('What does this pair', 0); await btn('Lock in my answer'); await sleep(300);
    await btn('Zoom out to the full record'); await sleep(600); await shot('27-sea-1');
    await answer('Pick the best conclusion', 2); await btn('Check my answer'); await sleep(300); await shot('28-sea-1-answered');
    await btn('Compare with a local gauge'); await sleep(600); await shot('29-sea-2');
    await answer('Why does the local gauge', 0); await btn('Check my answer'); await sleep(300);
    await btn('On to forests'); await sleep(1500);
    if (!(await part()).includes('forest')) note('did not reach forest: ' + (await part()));
  });
  await step('forest', async () => {
    await shot('30-forest-0'); await overflow('forest');
    await answer('which crop shows climate-linked loss', 0); await btn('Lock in my answer'); await sleep(300);
    await btn('Add the overlays'); await sleep(900); await shot('31-forest-1');
    await answer('Crop A: what is behind it', 0); await btn('Check my answer', { nth: 0 }); await sleep(300);
    await answer('Crop B: what is behind it', 1); await btn('Check my answer', { nth: 0 }); await sleep(300);
    await answer('What did the Black Summer', 0); await btn('Check my answer', { nth: 0 }); await sleep(300);
    await shot('32-forest-1-answered', true);
    await btn('Zoom out to the long record'); await sleep(700); await shot('33-forest-2');
    await btn('On to sea ice'); await sleep(1500);
    if (!(await part()).includes('ice')) note('did not reach ice: ' + (await part()));
  });
  await step('ice', async () => {
    await shot('34-ice-0'); await overflow('ice');
    await answer('Is that a trend', 0); await btn('Lock in my answer'); await sleep(300);
    await btn('See both poles'); await sleep(800); await shot('35-ice-1');
    await answer('Pick the best statement', 1); await btn('Check my answer'); await sleep(300);
    await btn('One more distinction'); await sleep(600); await shot('36-ice-2');
    await answer('Does melting sea ice raise sea level', 1); await btn('Check my answer'); await sleep(300);
    await btn('On to the Minister briefing'); await sleep(1500);
    if (!(await part()).includes('briefing')) note('did not reach briefing: ' + (await part()));
  });
  await step('briefing', async () => {
    await shot('37-briefing-0'); await overflow('briefing');
    await answer('Which claim will you brief', 1);
    await c.ev(`document.querySelector('input[name=strength][value="2"]').click()`); await sleep(200);
    await c.ev(`[...document.querySelectorAll('.ev-card input')].slice(0,3).forEach(i=>i.click())`); await sleep(200);
    await answer('What is the main weakness', 0);
    await c.ev(`(()=>{const t=document.querySelector('#free');t.value='Check the local tide gauges next.';t.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await shot('38-briefing-filled', true);
    await btn('Send the briefing'); await sleep(800); await shot('39-briefing-sent', true);
    await btn('See my debrief'); await sleep(1500);
    if (!(await part()).includes('debrief')) note('did not reach debrief: ' + (await part()));
  });
  await step('debrief', async () => {
    await shot('40-debrief'); await shot('40b-debrief-full', true); await overflow('debrief');
    const st = await c.ev('JSON.parse(localStorage.getItem("ground-truth:v1"))');
    const sum = Object.values(st.scores).reduce((a, b) => a + b, 0) + Object.values(st.sensorLab.stations || {}).filter((s) => s.done).length;
    const shown = await c.ev(`document.querySelector('.total-score')?.childNodes[0]?.textContent`);
    console.log('  stored total', sum, 'shown', shown); if (Number(shown) !== sum) note(`debrief total ${shown} != stored ${sum}`);
    const rows = await c.ev(`[...document.querySelectorAll('.score-row')].map(r=>r.innerText.replace(/\\n/g,' '))`);
    console.log('  rows', JSON.stringify(rows));
    await c.ev(`navigator.clipboard.writeText=async t=>{window.__copied=t}`);
    await btn('Copy summary'); await sleep(400);
    console.log('  copied:', JSON.stringify(await c.ev('window.__copied')));
    await c.ev(`document.querySelector('#student-name').focus()`); await c.type('Test Student'); await sleep(200);
    await c.send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(400);
    await c.shot(`tools/qa/shots/${tag}-${W}-41-print.png`);
    await c.send('Emulation.setEmulatedMedia', { media: '' });
  });

  await step('resume after reload', async () => {
    await c.goto(CH); await sleep(1500);
    const t = await text('main'); const h = await part();
    console.log('  after reload hash', h, '| welcome:', /welcome back/i.test(t));
    if (!/welcome back/i.test(t)) note('no welcome back note after reload');
    await shot('42-resume');
  });
  await step('draft', async () => {
    await c.goto(`${CH}?draft#/debrief`); await sleep(1500); await shot('43-debrief-draft', true);
    const t = await text('main'); console.log('  draft badge:', /draft/i.test(t));
  });
  await step('start again', async () => {
    await c.goto(CH); await sleep(1200);
    await btn('Start again', { nth: 0 }); await sleep(400); await shot('44-start-again-modal');
    await btn('Clear and start again'); await sleep(800);
    const ls = await c.ev('localStorage.getItem("ground-truth:v1")');
    const t = await text('h1'); console.log('  after start again h1:', t, 'part', await part());
    await shot('45-start-again-done');
  });
} finally {
  console.log('\nISSUES:', issues.length ? '\n' + issues.join('\n') : 'none');
  await c.close();
}
