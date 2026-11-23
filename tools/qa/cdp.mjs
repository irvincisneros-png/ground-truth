// Minimal Chrome DevTools Protocol driver (Node 22 built-ins only).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const BASE = `http://localhost:${process.env.GT_PORT || 8800}/ground-truth/`;
export const CH = BASE + 'challenge.html';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

export async function launch() {
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--use-angle=metal', '--enable-unsafe-swiftshader', '--no-first-run', '--user-data-dir=/tmp/gt-qa-profile', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const logs = []; const handlers = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); }
    else if (d.method && handlers.has(d.method)) handlers.get(d.method)(d.params);
    else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(`[${d.params.type}] ` + d.params.args.map((a) => a.value ?? a.description).join(' '));
    else if (d.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('[log] ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  const api = {
    proc, send, logs,
    on(method, fn) { handlers.set(method, fn); },
    async viewport(w, h, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); },
    async goto(url) { await send('Page.navigate', { url }); await sleep(900); },
    async ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + ' :: ' + expr.slice(0, 120));
      return r.result.value;
    },
    async shot(path, full = false) {
      mkdirSync(dirname(path), { recursive: true });
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
      writeFileSync(path, Buffer.from(r.data, 'base64'));
    },
    async click(sel) { // real mouse click at element centre
      const p = await api.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!p) throw new Error('click: no element ' + sel);
      await api.mouse(p[0], p[1]);
    },
    async clickText(text, scope = 'button,a,label,[role=button]') {
      const p = await api.ev(`(()=>{const t=${JSON.stringify(text)};const e=[...document.querySelectorAll(${JSON.stringify(scope)})].find(x=>x.offsetParent&&x.textContent.trim().includes(t));if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!p) throw new Error('clickText: ' + text);
      await api.mouse(p[0], p[1]);
    },
    async mouse(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(250);
    },
    async drag(x0, y0, x1, y1) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 10; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / 10, y: y0 + ((y1 - y0) * i) / 10, button: 'left', buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1 });
      await sleep(300);
    },
    async key(key, code = key, vk = 0, modifiers = 0) {
      const text = key.length === 1 ? key : key === 'Enter' ? '\r' : undefined;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
      await sleep(80);
    },
    async type(text) { await send('Input.insertText', { text }); await sleep(80); },
    async close() { try { ws.close(); } catch {} proc.kill('SIGKILL'); },
  };
  return api;
}
