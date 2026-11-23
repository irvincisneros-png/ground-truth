// Play all four Satellite Spotter missions through to the report card and screenshot every step.
// Usage: GT_PORT=8802 node tools/qa/spotter.mjs 1366x768 [outdir] [--all]
import { launch, BASE, sleep } from './cdp.mjs';
import { readFileSync, existsSync } from 'node:fs';

const [W, H] = (process.argv[2] || '1366x768').split('x').map(Number);
const OUT = process.argv[3] || `tools/qa/shots/spotter-${W}`;
const ALL = process.argv.includes('--all');
const c = await launch();
const pad = (n) => String(n).padStart(2, '0');
let k = 0;
const shot = async (name, full = false) => { await c.shot(`${OUT}/${pad(++k)}-${name}.png`, full); };
const next = async () => { await sleep(400); await c.ev("document.querySelector('.sp-foot .sp-btn.primary').click()"); await sleep(500); };
// --fixtures <dir>: answer /spotter/* requests with synthetic LAYOUT-ONLY pictures (never shipped, never in public/).
const fxDir = process.argv.includes('--fixtures') ? process.argv[process.argv.indexOf('--fixtures') + 1] : null;
if (fxDir) {
  const pair = (id, b, a, cap) => ({ id, before: { file: `${id}-before.webp`, label: b, date: b }, after: { file: `${id}-after.webp`, label: a, date: a }, caption: cap, credit: 'QA layout fixture', licence: 'not real' });
  const json = JSON.stringify([pair('ice', '1984', '2023', 'Arctic'), pair('forest', 'Oct 2019', 'Jan 2020', 'NSW forest'), pair('reef', '2021', '2024', 'Great Barrier Reef')]);
  c.on('Fetch.requestPaused', async (p) => {
    const u = new URL(p.request.url);
    const m = u.pathname.match(/\/spotter\/(.+)$/);
    if (m && m[1] === 'images.json') return c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(json).toString('base64') });
    const f = m && `${fxDir}/${m[1].replace('.webp', '.png')}`;
    if (f && existsSync(f)) return c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: readFileSync(f).toString('base64') });
    return c.send('Fetch.continueRequest', { requestId: p.requestId });
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/spotter/*' }] });
}
const errors = [];
try {
  await c.viewport(W, H, W < 500);
  await c.goto(BASE + 'index.html');
  await c.ev('localStorage.clear()');
  await c.goto(BASE + 'index.html');
  await sleep(800);
  await shot('start');
  await c.click('#sp-start'); await sleep(600);
  const missions = ALL ? [0, 1, 2, 3] : [0, 1, 2, 3];
  for (const m of missions) {
    const tag = `m${m + 1}`;
    const detail = m === 0 || ALL;
    await shot(`${tag}-1-problem`);
    await next();
    // wrong eye first, then the right one
    const best = await c.ev(`['heat','radar','colour','microwave'][${[3, 2, 1, 0][m]}]`); // placeholder, replaced below
    const names = ['Heat camera', 'Radar ruler', 'Colour camera', 'Microwave eye'];
    const right = ['Microwave eye', 'Colour camera', 'Radar ruler', 'Heat camera'][m];
    const wrong = names.find((n) => n !== right);
    await c.clickText(wrong, '.sp-eye'); await sleep(200);
    await shot(`${tag}-2-eye-wrong`);
    await c.clickText(right, '.sp-eye'); await sleep(300);
    await shot(`${tag}-2-eye-right`);
    await next();
    await sleep(2200);
    await shot(`${tag}-3-scan-mid`);
    await sleep(7500);
    await shot(`${tag}-3-scan-done`);
    await next();
    await sleep(500);
    await c.ev(`(()=>{const r=document.querySelector('.sp-ba-range, .sp-sea-range'); if(r){r.focus(); r.value=${m === 2 ? 60 : 62}; r.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await sleep(300);
    await shot(`${tag}-4-compare-mid`);
    await c.ev(`(()=>{const r=document.querySelector('.sp-ba-range, .sp-sea-range'); if(r){r.value=${m === 2 ? 100 : 80}; r.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await sleep(300);
    if (detail) await shot(`${tag}-4-compare-end`);
    await next();
    await sleep(500);
    await shot(`${tag}-5-say-empty`);
    const words = await c.ev(`window.__spotter.correctWords(${m})`);
    // fill blank 1 wrongly on purpose (first chip that is not correct), check, see wobble
    const wrongWord = await c.ev(`(()=>{const row=document.querySelectorAll('.sp-chiprow')[0];return [...row.querySelectorAll('.sp-chip')].map(x=>x.textContent).find(t=>t!==${JSON.stringify(words[0])})})()`);
    for (let i = 0; i < words.length; i++) {
      const w = i === 0 ? wrongWord : words[i];
      await c.clickText(w, `.sp-chiprow:nth-child(${i + 1}) .sp-chip`); await sleep(120);
      if (i === 0) await shot(`${tag}-5-say-picked`);
      await c.click(`#blank-${i}`); await sleep(120);
    }
    await shot(`${tag}-5-say-filled`);
    await c.click('.sp-foot .sp-btn.primary'); await sleep(250);
    await shot(`${tag}-5-say-wobble`);
    await sleep(1300);
    await c.clickText(words[0], '.sp-chiprow:nth-child(1) .sp-chip'); await sleep(120);
    await c.click('#blank-0'); await sleep(150);
    await c.click('.sp-foot .sp-btn.primary'); await sleep(900);
    await shot(`${tag}-5-say-stamp`);
    if (m === 3) {
      await sleep(600);
      await c.ev("[...document.querySelectorAll('.sp-bonus-btns .sp-btn')].find(b=>b.textContent==='Yes').click()"); await sleep(200);
      await c.ev("[...document.querySelectorAll('.sp-bonus-btns .sp-btn')].find(b=>b.textContent==='No').click()"); await sleep(300);
      await shot(`${tag}-5-bonus`);
    }
    await next();
    await sleep(500);
  }
  await c.ev(`(()=>{const n=document.getElementById('sp-name'); n.focus();})()`);
  await c.type('Sam'); await sleep(200);
  await shot('report', true);
  console.log('state', JSON.stringify(await c.ev('window.__spotter.state')));
  console.log('page errors:', c.logs.length ? c.logs.join('\n') : 'none');
} catch (e) {
  console.error('FAILED', e.message);
  await shot('failure').catch(() => {});
  console.log(c.logs.join('\n'));
  process.exitCode = 1;
} finally {
  await c.close();
}
