// Pilota un browser Chromium (Chrome, Brave, Edge, Chromium) senza finestra tramite il
// DevTools Protocol. Usa solo Node (WebSocket e fetch integrati, Node ≥ 22): nessuna dipendenza.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findBrowser() {
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

/** Avvia il browser headless e si collega alla prima scheda. */
export async function launch(browserPath, port) {
  const profile = mkdtempSync(join(tmpdir(), 'ches54-ui-'));
  const proc = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--lang=it-IT', '--accept-lang=it-IT,it',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 80 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); }
  }
  if (!targets) throw new Error('Il browser non risponde sul DevTools Protocol');
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  const errors = [];
  const listeners = new Map(); // evento CDP → callback (es. Fetch.requestPaused per simulare risposte di rete)
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method && listeners.has(m.method)) listeners.get(m.method)(m.params);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  });
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? expr);
    return r.result.result?.value;
  };
  const b = {
    send,
    ev,
    errors,
    on: (method, cb) => (cb ? listeners.set(method, cb) : listeners.delete(method)),
    text: (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText.replace(/\\s+/g, ' ').trim() ?? null`),
    click: (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`),
    async waitFor(expr, ms = 60000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await ev(expr)) return;
        await sleep(150);
      }
      throw new Error(`Tempo scaduto in attesa di: ${expr}`);
    },
    viewport: (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }),
    async screenshot(path) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(r.result.data, 'base64'));
    },
    async mouse(x, y) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
    },
    /** Clic su una casa della scacchiera, tenendo conto dell'orientamento. */
    async clickSquare(sq, boardId = 'board', flipped = null) {
      const r = await ev(`(() => { const e = document.getElementById(${JSON.stringify(boardId)}).getBoundingClientRect();
        return { x: e.left, y: e.top, s: e.width / 8, flipped: document.getElementById('evalbar').classList.contains('flipped') }; })()`);
      if (flipped != null) r.flipped = flipped; // scacchiere senza barra di valutazione (es. Problemi)
      const f = 'abcdefgh'.indexOf(sq[0]);
      const rk = Number(sq[1]) - 1;
      const x = r.flipped ? 7 - f : f;
      const y = r.flipped ? rk : 7 - rk;
      await b.mouse(r.x + (x + 0.5) * r.s, r.y + (y + 0.5) * r.s);
      await sleep(120);
    },
    async key(key, code, keyCode) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    },
    async close() {
      ws.close();
      const exited = new Promise((r) => proc.once('exit', r));
      proc.kill();
      await Promise.race([exited, sleep(3000)]);
      // Il profilo temporaneo si cancella quando il browser ha chiuso i suoi file
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
  return b;
}
