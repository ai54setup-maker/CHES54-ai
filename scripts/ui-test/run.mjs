// Test dell'interfaccia nel browser vero (headless). Non fa parte di `npm test` perché richiede
// un browser Chromium installato:
//
//   npm run test:ui                         # cerca Chrome, Brave, Edge o Chromium
//   CHROME_PATH=/percorso/browser npm run test:ui
//   npm run test:ui -- --screenshots dir    # salva anche le schermate
//
// Avvia server.py su una porta libera, apre l'app e verifica i flussi principali.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { findBrowser, launch, sleep } from './cdp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const shotsArg = process.argv.indexOf('--screenshots');
const shotsDir = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const freePort = () => new Promise((resolve) => {
  const s = createServer().listen(0, () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

const browserPath = findBrowser();
if (!browserPath) {
  console.error('Nessun browser Chromium trovato. Imposta CHROME_PATH con il percorso di Chrome, Brave, Edge o Chromium.');
  process.exit(2);
}

const httpPort = await freePort();
const server = spawn('python3', ['server.py', String(httpPort), '--no-browser'], { cwd: root, stdio: 'ignore' });
const b = await launch(browserPath, await freePort());
const url = `http://localhost:${httpPort}/`;
let failures = 0;
const results = [];

async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`✔ ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    failures++;
    results.push(`✖ ${name}\n    ${err.message.split('\n').join('\n    ')}`);
  }
  console.log(results.at(-1));
}
const shot = async (name) => { if (shotsDir) await b.screenshot(`${shotsDir}/${name}.png`); };
const moveButton = (i) => `[...document.querySelectorAll('#movelist .mv')][${i}].click()`;

try {
  await b.viewport(1280, 900);
  for (let i = 0; i < 40; i++) {
    try { await fetch(url); break; } catch { await sleep(150); }
  }
  await b.send('Page.navigate', { url });
  // L'app è pronta quando ha disegnato la scheda attiva (i pulsanti esistono già nell'HTML)
  await b.waitFor(`!!document.querySelector('.tabs .active')`);

  await step('avvio: scheda Revisione, nessuna analisi senza partita', async () => {
    assert.equal(await b.text('.tabs .active'), 'Revisione');
    assert.equal(await b.ev(`document.getElementById('review-input').hidden`), false);
    await sleep(800);
    assert.equal(await b.ev(`document.querySelectorAll('.arrows g').length`), 0);
    await shot('01-input');
  });

  await step('PGN non valido: messaggio chiaro', async () => {
    await b.ev(`document.getElementById('pgn-text').value = '1. e4 e5 2. Ke3'; document.getElementById('btn-analyze').click()`);
    assert.match(await b.text('#review-error'), /Mossa non legale: 2\. Ke3/);
  });

  let summary;
  await step('revisione della partita di esempio', async () => {
    await b.click('#btn-example');
    await b.waitFor(`document.getElementById('pgn-text').value.includes('Morphy')`);
    await b.click('#review-depth button:nth-child(2)'); // Normale (14)
    await b.click('#btn-analyze');
    await b.waitFor(`!document.getElementById('review-summary').hidden`, 120000);
    summary = await b.text('#review-summary');
    // Stessi numeri dell'analisi da terminale (analisi riproducibile)
    assert.match(summary, /84,9 Precisione 68,5/);
    assert.match(summary, /C41 · Philidor Defense/);
    assert.equal(await b.ev(`document.querySelectorAll('#movelist .cls-icon').length`), 33);
    await shot('02-summary');
  });

  await step('scheda mossa, spiegazione e icona sulla scacchiera', async () => {
    await b.ev(moveButton(29)); // 15... Cxd7
    await sleep(300);
    const card = await b.text('#move-card');
    assert.match(card, /15… Cxd7 Errore grave/);
    assert.match(card, /Permette all'avversario di dare matto in 2\. Variante: 15… Cxd7 16\. Db8\+ Cxb8 17\. Td8#/);
    assert.equal(await b.ev(`document.querySelector('.badge svg')?.getAttribute('aria-label')`), 'Errore grave');
    await b.ev(moveButton(24)); // 13. Txd7
    await sleep(300);
    assert.match(await b.text('#move-card'), /13\. Txd7 Brillante/);
    await shot('03-move');
  });

  await step('navigazione: tastiera e grafico', async () => {
    await b.key('ArrowRight', 'ArrowRight', 39);
    await sleep(150);
    assert.match(await b.text('#move-card .mc-title'), /^13… Txd7/);
    await b.key('Home', 'Home', 36);
    await sleep(150);
    assert.match(await b.text('#move-card'), /Posizione iniziale/);
    const g = await b.ev(`(() => { const r = document.getElementById('eval-graph').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    await b.mouse(g.x + g.w - 2, g.y + g.h / 2);
    await sleep(200);
    assert.match(await b.text('#move-card .mc-title'), /^17\. Td8#/);
  });

  await step('linee del motore della posizione mostrata', async () => {
    await b.ev(moveButton(24));
    await b.waitFor(`(document.getElementById('depth-info').textContent || '').includes('✓')`, 30000);
    assert.equal(await b.ev(`document.querySelectorAll('#lines .eline:not(.placeholder)').length`), 3);
    await b.click('#lines-control button:nth-child(3)'); // 5 linee
    await b.waitFor(`document.querySelectorAll('#lines .eline:not(.placeholder)').length === 5`, 30000);
    await b.click('#lines-control button:nth-child(2)');
  });

  await step('ritenta la mossa: linee nascoste, giudizio del motore, soluzione', async () => {
    await b.ev(moveButton(17)); // 9... b5 (Errore)
    await sleep(200);
    await b.click('#btn-retry-this');
    await sleep(200);
    assert.match(await b.text('#lines'), /Linee nascoste/);
    assert.equal(await b.ev(`document.querySelectorAll('.arrows g').length`), 0);
    assert.equal(await b.ev(`document.getElementById('evalbar').classList.contains('flipped')`), true, 'scacchiera girata verso il Nero');
    await b.clickSquare('e7');
    await b.clickSquare('c7'); // Dc7, la mossa del motore
    await b.waitFor(`!!document.querySelector('#move-card [data-act="again"]')`, 30000);
    assert.match(await b.text('#move-card .mc-feedback'), /Dc7: esatto/);
    await shot('04-retry');
    await b.click('#move-card [data-act="solution"]');
    await sleep(150);
    assert.equal(await b.ev(`!!document.querySelector('.arrows line[stroke-dasharray]')`), true);
    await b.click('#move-card [data-act="exit"]');
    await sleep(200);
    assert.equal(await b.ev(`document.getElementById('evalbar').classList.contains('flipped')`), false);
  });

  await step('variante dalla revisione → analisi libera', async () => {
    await b.click('#nav-first');
    await sleep(150);
    await b.clickSquare('d2');
    await b.clickSquare('d4');
    await sleep(300);
    assert.equal(await b.text('.tabs .active'), 'Analisi');
    await b.ev(`(() => { document.getElementById('move-text').value = 'Cf6'; document.getElementById('move-form').requestSubmit(); })()`);
    await sleep(200);
    assert.equal(await b.text('#movelist'), '1. d4 Cf6');
    await b.waitFor(`(document.getElementById('depth-info').textContent || '').includes('✓')`, 30000);
    await shot('05-analysis');
  });

  await step('telefono: nessuno scorrimento orizzontale', async () => {
    await b.click('#tab-review');
    await b.viewport(390, 844, true);
    await sleep(400);
    assert.equal(await b.ev(`document.documentElement.scrollWidth <= 390`), true);
    await shot('06-mobile');
    await b.viewport(1280, 900);
  });

  await step('ricarica: revisione ripristinata', async () => {
    await b.send('Page.reload');
    await b.waitFor(`!!document.getElementById('review-summary') && !document.getElementById('review-summary').hidden`, 10000);
    assert.equal(await b.text('#review-summary'), summary);
  });

  await step('nessun errore nella console', async () => {
    assert.deepEqual(b.errors, []);
  });
} finally {
  await b.close();
  server.kill();
}

console.log(`\n${results.length - failures} superati, ${failures} falliti`);
process.exit(failures ? 1 : 0);
