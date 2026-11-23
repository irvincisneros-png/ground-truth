// Keyboard-only run through the reef part and the Minister briefing (no mouse events).
import { launch, BASE, sleep } from './cdp.mjs';
const c = await launch(); const issues = [];
const desc = `(()=>{const a=document.activeElement;if(!a||a===document.body)return '';const l=a.closest('label');return (a.tagName+':'+(a.type||'')+':'+((l?l.textContent:a.textContent)||a.id||'')).replace(/\\s+/g,' ').slice(0,90)})()`;
async function tabTo(sub, max = 90) {
  for (let i = 0; i < max; i++) { await c.key('Tab', 'Tab', 9); const d = await c.ev(desc); if (process.env.KBDBG) console.log('   tab', d); if (d.includes(sub)) return d; }
  throw new Error('tab never reached: ' + sub);
}
const enter = () => c.key('Enter', 'Enter', 13);
const space = () => c.key(' ', 'Space', 32);
async function pickRadio(sub) { await tabTo(sub); await space(); }
async function radioN(first, n) { await tabTo(first); for (let i = 0; i < n; i++) await c.key('ArrowDown', 'ArrowDown', 40); if (!n) await space(); await sleep(200); }
async function press(sub) { await tabTo(sub); await enter(); await sleep(500); }
async function stage(n, f) { console.log('> ' + n); try { await f(); } catch (e) { issues.push(`${n}: ${e.message}`); console.log('  !! ' + e.message); await c.shot(`tools/qa/shots/kb-fail-${n}.png`); } }
const focusMain = () => c.ev(`document.querySelector('main').focus()`);
try {
  await c.viewport(1366, 768);
  await c.goto(BASE + '?unlock'); await c.ev('localStorage.clear()'); await c.goto('about:blank'); await c.goto(BASE + '?unlock#/reef'); await sleep(1500);
  await stage('reef predict', async () => { await focusMain(); await pickRadio('Southern GBR'); await tabTo('Guess'); await c.key('ArrowDown', 'ArrowDown', 40); await press('Commit prediction'); await c.shot('tools/qa/shots/kb-reef-flight.png'); });
  await stage('reef flight', async () => { await pickRadio('Torres Strait'); await press('Fly this survey'); await c.shot('tools/qa/shots/kb-reef-modal.png'); await enter(); await sleep(600); });
  await stage('reef reveal', async () => { await focusMain(); await press('Check against the ground'); });
  await stage('reef ground', async () => { await radioN('radio:The logger must be broken', 1); await press('Compare the peaks'); });
  await stage('reef compare', async () => {
    await tabTo('q-peak'); await c.type('14.6'); await tabTo('q-ratio'); await c.type('1.2'); await press('Check my numbers'); await press('Now the limits'); });
  await stage('reef limits', async () => { await tabTo('checkbox:DHW predicts risk'); await space(); await tabTo('checkbox:Each “reef” is a NOAA regional'); await space(); await press('Submit limitations'); await c.shot('tools/qa/shots/kb-reef-limits.png'); await press('On to the transfer cases'); console.log('  hash', await c.ev('location.hash')); });
  await c.goto(BASE + '?unlock#/briefing'); await sleep(1200);
  await stage('briefing', async () => {
    await focusMain(); await pickRadio('radio:Global sea level'); await tabTo('radio:No evidence'); await c.key('ArrowRight','ArrowRight',39); await c.key('ArrowRight','ArrowRight',39);
    await tabTo('checkbox:'); await space(); await tabTo('checkbox:'); await space();
    await radioN('radio:Short record', 0);
    await tabTo('TEXTAREA'); await c.type('Check the tide gauges.');
    await press('Send the briefing'); await c.shot('tools/qa/shots/kb-briefing-sent.png');
    console.log('  sent:', await c.ev("!!JSON.parse(localStorage.getItem('ground-truth:v1')).briefing.first"));
  });
} catch (e) { issues.push(e.message); }
console.log('ISSUES', issues); await c.close();
