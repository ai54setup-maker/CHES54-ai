// Test dell'interfaccia nel browser vero (headless). Non fa parte di `npm test` perché richiede
// un browser Chromium installato:
//
//   npm run test:ui                         # cerca Chrome, Brave, Edge o Chromium
//   CHROME_PATH=/percorso/browser npm run test:ui
//   npm run test:ui -- --screenshots dir    # salva anche le schermate
//
// Avvia server.py su una porta libera, apre l'app e verifica i flussi principali.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  await step('scacchiera: a1 e h8 scure, h1 e a8 chiare', async () => {
    // Scacchiera dal lato del Bianco: la prima casa disegnata è a8, l'ultima h1
    const color = (sq) => b.ev(`(() => {
      const index = (8 - ${Number(sq[1])}) * 8 + ${'abcdefgh'.indexOf(sq[0])};
      return document.querySelectorAll('#board .sq')[index].classList.contains('dark') ? 'scura' : 'chiara';
    })()`);
    assert.deepEqual([await color('a1'), await color('h8'), await color('h1'), await color('a8')], ['scura', 'scura', 'chiara', 'chiara']);
  });

  await step('PGN non valido: messaggio chiaro', async () => {
    await b.ev(`document.getElementById('pgn-text').value = '1. e4 e5 2. Ke3'; document.getElementById('btn-analyze').click()`);
    assert.match(await b.text('#review-error'), /Mossa non legale: 2\. Ke3/);
  });

  let summary;
  const libItems = `document.querySelectorAll('#dlg-library .lib-item')`;
  const libSearch = (text) => b.ev(`(() => { const i = document.querySelector('#dlg-library .lib-search');
    i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input')); })()`);
  const libCount = () => b.ev(`${libItems}.length`);

  await step('libreria: elenco, filtri per categoria e ricerca per nome', async () => {
    const index = await (await fetch(`${url}data/examples/index.json`)).json();
    await b.click('#btn-library');
    await b.waitFor(`${libItems}.length > 0`, 10000);
    assert.equal(await libCount(), index.games.length);
    const first = await b.text('#dlg-library .lib-item');
    assert.match(first, /Anderssen – Lionel Kieseritzky/);
    assert.match(first, /1851 · Londra/);
    assert.match(first, /C33 · King's Gambit Accepted/); // apertura calcolata dal nostro OpeningBook
    await b.click('#dlg-library .chip[data-category="carlsen"]');
    const carlsen = index.games.filter((g) => g.categories.includes('carlsen')).length;
    assert.equal(await libCount(), carlsen);
    assert.equal(await b.ev(`[...${libItems}].every((el) => el.textContent.includes('Carlsen'))`), true);
    await b.click('#dlg-library .chip[data-category=""]');
    await libSearch('polgar'); // senza accento: trova "Polgár"
    assert.equal(await libCount(), 1);
    await libSearch('zzz');
    assert.equal(await libCount(), 0);
    assert.match(await b.text('#dlg-library .lib-count'), /0 partite/);
    await libSearch('');
    await shot('02-library');
  });

  await step('revisione della partita scelta nella libreria', async () => {
    await b.click('.lib-close');
    await b.click('#review-depth button:nth-child(2)'); // Normale (14)
    await b.click('#btn-library');
    await libSearch('morphy');
    await b.click('#dlg-library .lib-item[data-id="morphy-opera-1858"]');
    await b.waitFor(`document.getElementById('pgn-text').value.includes('Morphy')`);
    assert.equal(await b.ev(`document.getElementById('dlg-library').open`), false);
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
    assert.equal(await b.text('.tabs .active'), 'Analisi partita');
    await b.ev(`(() => { document.getElementById('move-text').value = 'Cf6'; document.getElementById('move-form').requestSubmit(); })()`);
    await sleep(200);
    assert.equal(await b.text('#movelist'), '1. d4 Cf6');
    await b.waitFor(`(document.getElementById('depth-info').textContent || '').includes('✓')`, 30000);
    await shot('05-analysis');
  });

  await step('telefono (375 px): nessuno scorrimento orizzontale, libreria a tutto schermo', async () => {
    await b.click('#tab-review');
    await b.viewport(375, 812, true);
    await sleep(400);
    assert.equal(await b.ev(`document.documentElement.scrollWidth <= 375`), true);
    await shot('06-mobile');
    await b.ev(`document.getElementById('btn-library').click()`);
    await b.waitFor(`${libItems}.length > 0`, 10000);
    await sleep(200);
    const box = await b.ev(`(() => {
      const d = document.getElementById('dlg-library').getBoundingClientRect();
      const list = document.querySelector('#dlg-library .lib-list');
      const items = [...document.querySelectorAll('#dlg-library .lib-item, #dlg-library .chip, #dlg-library .lib-close')];
      return { w: d.width, h: d.height, overflowX: list.scrollWidth > list.clientWidth,
        minTouch: Math.min(...items.map((el) => el.getBoundingClientRect().height)) };
    })()`);
    assert.equal(box.w, 375);
    assert.equal(box.h, 812);
    assert.equal(box.overflowX, false);
    assert.ok(box.minTouch >= 40, `elemento toccabile alto solo ${box.minTouch} px`);
    await shot('07-mobile-library');
    await b.click('.lib-close');
    await b.viewport(1280, 900);
  });

  await step('ricarica: revisione ripristinata', async () => {
    await b.send('Page.reload');
    await b.waitFor(`!!document.getElementById('review-summary') && !document.getElementById('review-summary').hidden`, 10000);
    assert.equal(await b.text('#review-summary'), summary);
  });

  await step('sezioni Lezioni e Problemi: vista propria, ripristino, barra in basso sul telefono', async () => {
    await b.click('#tab-lessons');
    assert.equal(await b.text('.tabs .active'), 'Lezioni');
    assert.equal(await b.text('#section-title'), 'Lezioni');
    assert.equal(await b.ev(`document.getElementById('view-board').hidden`), true);
    assert.equal(await b.ev(`document.getElementById('view-lessons').hidden`), false);
    await b.send('Page.reload');
    await b.waitFor(`!!document.querySelector('.tabs .active')`);
    assert.equal(await b.text('.tabs .active'), 'Lezioni');
    await b.click('#tab-puzzles');
    assert.equal(await b.ev(`document.getElementById('view-puzzles').hidden`), false);
    await b.viewport(375, 812, true);
    await sleep(300);
    assert.equal(await b.ev(`document.documentElement.scrollWidth <= 375`), true);
    const tabs = await b.ev(`[...document.querySelectorAll('.tabs button')].map((el) => {
      const r = el.getBoundingClientRect();
      return { h: r.height, inside: r.left >= 0 && r.right <= 375 && r.bottom <= 812 };
    })`);
    assert.equal(tabs.length, 5);
    assert.ok(tabs.every((t) => t.h >= 40 && t.inside), JSON.stringify(tabs));
    await shot('08-mobile-puzzles');
    await b.viewport(1280, 900);
    // Ritorno alla Revisione: la partita analizzata è ancora lì
    await b.click('#tab-review');
    assert.equal(await b.ev(`document.getElementById('view-board').hidden`), false);
    assert.equal(await b.ev(`document.getElementById('review-summary').hidden`), false);
  });

  await step('problemi: mossa sbagliata con risposta del motore, indizio, soluzione, serie', async () => {
    await b.click('#tab-puzzles');
    await b.waitFor(`document.querySelectorAll('#pz-themes .chip').length > 0`, 10000);
    await b.click('#pz-themes [data-id="mateIn2"]');
    await b.click('#pz-levels [data-id="easy"]');
    const playing = `/trova la mossa/.test(document.getElementById('pz-title').textContent)`;
    // Problema mostrato: soluzione letta dai dati, mossa sbagliata = una mossa legale qualsiasi diversa
    const current = () => b.ev(`(async () => {
      const id = document.querySelector('#pz-source a').textContent.slice(1);
      const d = await (await fetch('data/puzzles/puzzles.json')).json();
      const p = d.puzzles.find((x) => x.id === id);
      const { Chess } = await import('./lib/chess.js');
      const moves = p.moves.split(' ');
      const c = new Chess(p.fen);
      c.move({ from: moves[0].slice(0, 2), to: moves[0].slice(2, 4), promotion: moves[0][4] });
      const wrong = c.moves({ verbose: true }).find((m) => m.from + m.to !== moves[1].slice(0, 4) && !m.promotion
        && !new Chess(c.fen()).move(m.san).san.endsWith('#'));
      return { id, color: c.turn(), solution: moves.slice(1), wrong: wrong.from + wrong.to };
    })()`);
    const solve = async (info) => {
      const sq = (s) => b.clickSquare(s, 'pz-board', info.color === 'b');
      for (let i = 0; i < info.solution.length; i += 2) {
        await b.waitFor(playing, 5000);
        const m = info.solution[i];
        // dopo l'indizio il pezzo è già selezionato
        if (!(await b.ev(`!!document.querySelector('#pz-board .sq.sel')`))) await sq(m.slice(0, 2));
        await sq(m.slice(2, 4));
      }
    };
    await b.waitFor(playing, 10000);
    let info = await current();
    const sq = (s) => b.clickSquare(s, 'pz-board', info.color === 'b');
    await sq(info.wrong.slice(0, 2));
    await sq(info.wrong.slice(2, 4));
    await b.waitFor(`document.getElementById('pz-card').dataset.state === 'wrong'`, 5000);
    await b.waitFor(`/Stockfish risponde/.test(document.getElementById('pz-feedback').textContent)`, 30000);
    assert.equal(await b.ev(`document.querySelectorAll('#pz-board .arrows g').length`), 1);
    await b.click('#pz-retry');
    await b.click('#pz-hint');
    assert.equal(await b.ev(`!!document.querySelector('#pz-board .sq.sel')`), true);
    await solve(info);
    await b.waitFor(`document.getElementById('pz-card').dataset.state === 'done'`, 5000); // completato, ma non al primo colpo
    assert.match(await b.text('#pz-feedback'), /Soluzione:/);
    assert.equal(await b.text('#pz-streak'), '0');
    await shot('09-puzzle');
    // Il prossimo, risolto al primo colpo: serie 1
    await b.click('#pz-next');
    await b.waitFor(`document.querySelector('#pz-source a').textContent.slice(1) !== ${JSON.stringify(info.id)}`, 5000);
    await b.waitFor(playing, 10000);
    info = await current();
    await solve(info);
    await b.waitFor(`document.getElementById('pz-card').dataset.state === 'solved'`, 5000);
    assert.equal(await b.text('#pz-streak'), '1');
    assert.equal(await b.text('#pz-solved'), '1');
    await shot('10-puzzle-solved');
    await b.click('#tab-review');
  });

  await step('problema del giorno: risolto, serie di giorni', async () => {
    await b.click('#tab-puzzles');
    await b.waitFor(`document.getElementById('pz-daily-btn').textContent === 'Risolvi'`, 10000);
    await b.click('#pz-daily-btn');
    await b.waitFor(`/^Problema del giorno/.test(document.getElementById('pz-meta').textContent)`, 5000);
    await b.waitFor(`/trova la mossa/.test(document.getElementById('pz-title').textContent)`, 10000);
    // Soluzione mostrata: il problema del giorno conta come fatto (come su Lichess)
    await b.click('#pz-solution');
    await b.waitFor(`document.getElementById('pz-card').dataset.state === 'done'`, 15000);
    assert.equal(await b.text('#pz-daily-title'), 'Problema del giorno: fatto!');
    assert.equal(await b.text('#pz-daily-sub'), '1 giorno di fila');
    assert.equal(await b.text('#pz-daily-btn'), 'Rivedi');
    await b.click('#tab-review');
  });

  await step('partite online: errori, Lichess e Chess.com (risposte simulate), revisione della partita scelta', async () => {
    const pgn = (w, bl, res, date) => `[Event "Rated blitz game"]\n[Site "https://lichess.org/x"]\n[White "${w}"]\n[Black "${bl}"]\n[Result "${res}"]\n[UTCDate "${date}"]\n[TimeControl "180+2"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# ${res}\n`;
    const replies = {
      'https://lichess.org/api/games/user/Mario_77': ['application/x-chess-pgn', pgn('Mario_77', 'Anna', '1-0', '2026.10.21') + '\n' + pgn('Luca', 'Mario_77', '1-0', '2026.10.20')],
      'https://api.chess.com/pub/player/mario_77/games/archives': ['application/json', JSON.stringify({ archives: ['https://api.chess.com/pub/player/mario_77/games/2026/10', 'https://api.chess.com/pub/player/mario_77/games/2026/11'] })],
      'https://api.chess.com/pub/player/mario_77/games/2026/10': ['application/json', JSON.stringify({ games: [{ rules: 'chess', end_time: 2, pgn: pgn('Mario_77', 'Bea', '1-0', '2026.10.18') }] })],
    };
    await b.send('Fetch.enable', { patterns: [{ urlPattern: 'https://lichess.org/*' }, { urlPattern: 'https://api.chess.com/*' }] });
    const asked = [];
    b.on('Fetch.requestPaused', ({ requestId, request }) => {
      const base = request.url.split('?')[0];
      asked.push({ url: base, accept: request.headers.Accept ?? request.headers.accept });
      const r = replies[base];
      b.send('Fetch.fulfillRequest', {
        requestId, responseCode: r ? 200 : 404,
        responseHeaders: [{ name: 'Content-Type', value: r?.[0] ?? 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
        body: Buffer.from(r?.[1] ?? '{"error":"Not found"}').toString('base64'),
      });
    });
    try {
      await b.click('#tab-review');
      await b.ev(`document.getElementById('btn-new-review')?.click()`);
      const search = (user) => b.ev(`(() => { document.getElementById('on-user').value = ${JSON.stringify(user)}; document.getElementById('on-form').requestSubmit(); })()`);
      await b.ev(`document.getElementById('btn-online').click()`);
      await b.click('#on-source [data-source="lichess"]');
      await search('../admin');
      assert.match(await b.text('#on-error'), /nome utente valido/);
      assert.equal(asked.length, 0); // un nome non valido non parte nemmeno
      await search('nessuno');
      await b.waitFor(`/non trovato/.test(document.getElementById('on-error').textContent)`, 5000);
      await search('Mario_77');
      await b.waitFor(`document.querySelectorAll('#on-list .lib-item').length === 2`, 5000);
      assert.equal(asked.at(-1).accept, 'application/x-chess-pgn');
      assert.equal(await b.ev(`document.querySelector('#on-list .lib-item').dataset.outcome`), 'win');
      assert.equal(await b.ev(`document.querySelectorAll('#on-list .lib-item')[1].dataset.outcome`), 'loss');
      await shot('13-online');
      await b.click('#on-source [data-source="chesscom"]');
      await search('Mario_77');
      await b.waitFor(`document.querySelectorAll('#on-list .lib-item').length === 1`, 5000);
      assert.match(await b.text('#on-list'), /Bea/);
      await b.click('#on-list .lib-item');
      await b.waitFor(`!document.getElementById('review-summary').hidden`, 60000);
      assert.match(await b.text('#review-summary'), /Mario_77.*Bea/);
    } finally {
      b.on('Fetch.requestPaused', null);
      await b.send('Fetch.disable');
      // Il 404 dell'utente inesistente è voluto: il browser lo registra in console
      // (anche il mese 2026/11 di Chess.com, che manca apposta: va saltato)
      b.errors.splice(0, b.errors.length, ...b.errors.filter((e) => !e.includes('/api/games/user/nessuno') && !e.includes('/games/2026/11')));
    }
  });

  await step('i tuoi errori: salvati dalla revisione, ripassati, giudicati da Stockfish', async () => {
    // Revisione di Mario_77 (Bianco) – Bea del passo precedente: il Nero ha sbagliato con 3...Cf6??
    await b.waitFor(`!!document.querySelector('[data-save="b"]')`, 5000);
    assert.match(await b.text('[data-save="w"]'), /\(tu\)/); // Mario_77 è il nome cercato online
    await b.click('[data-save="b"]');
    await b.waitFor(`/salvati/.test(document.querySelector('[data-save="b"]').textContent)`, 5000);
    await b.click('#tab-puzzles');
    await b.waitFor(`/1 da ripassare/.test(document.getElementById('pz-mine-sub').textContent)`, 10000);
    await b.click('#pz-mine-btn');
    await b.waitFor(`/I tuoi errori/.test(document.getElementById('pz-meta').textContent)`, 5000);
    const sq = (s) => b.clickSquare(s, 'pz-board', true); // tocca al Nero
    await sq('g8'); await sq('f6'); // la stessa mossa della partita
    await b.waitFor(`document.getElementById('pz-card').dataset.state === 'wrong'`, 10000);
    assert.match(await b.text('#pz-feedback'), /stessa mossa della partita/);
    await b.click('#pz-retry');
    await sq('d8'); await sq('e7'); // De7: non è la prima scelta, ma Stockfish la giudica buona
    await b.waitFor(`document.getElementById('pz-card').dataset.state === 'done' || document.getElementById('pz-card').dataset.state === 'solved'`, 60000);
    assert.match(await b.text('#pz-feedback'), /Buona mossa/);
    await shot('14-mistakes');
    await b.click('#tab-review');
  });

  await step('gioca contro Stockfish: mossa e risposta, annulla, ripresa dopo il ricaricamento, abbandono e revisione', async () => {
    await b.click('#tab-play');
    await b.waitFor(`!document.getElementById('pl-setup').hidden`, 5000);
    await b.click('#pl-color [data-value="w"]');
    await b.click('#pl-level [data-value="1"]');
    assert.match(await b.text('#pl-level-hint'), /Skill Level 0/);
    await b.click('#pl-start');
    const sq = (s) => b.clickSquare(s, 'pl-board', false);
    const replied = `/^Tocca a te/.test(document.getElementById('pl-status').textContent)
      && document.querySelector('#pl-moves li')?.children[2]?.textContent !== ''`;
    await sq('e2'); await sq('e4');
    await b.waitFor(replied, 30000);
    await b.click('#pl-undo');
    assert.equal(await b.ev(`document.querySelectorAll('#pl-moves li').length`), 0);
    await sq('d2'); await sq('d4');
    await b.waitFor(replied, 30000);
    // La partita in corso resta dopo il ricaricamento della pagina
    await b.send('Page.reload');
    await b.waitFor(`!!document.querySelector('.tabs .active') && !document.getElementById('pl-card').hidden`, 10000);
    assert.equal(await b.text('.tabs .active'), 'Gioca');
    assert.match(await b.text('#pl-moves'), /^1\. d4/);
    await b.click('#pl-resign');
    assert.match(await b.text('#pl-status'), /Hai perso \(abbandono\)/);
    await shot('15-play');
    await b.click('#pl-review');
    await b.waitFor(`!document.getElementById('review-summary').hidden`, 60000);
    assert.equal(await b.text('.tabs .active'), 'Revisione');
    assert.match(await b.text('#review-summary'), /Tu.*Stockfish \(livello 1\)/);
  });

  await step('condivisione: il link riapre la stessa revisione con lo stesso risultato', async () => {
    await b.click('#tab-review');
    await b.waitFor(`!document.getElementById('review-summary').hidden`, 10000);
    const before = await b.text('#review-summary');
    const link = await b.ev(`new Promise((resolve) => {
      navigator.clipboard.writeText = async (t) => resolve(t);
      document.getElementById('btn-share').click();
    })`);
    assert.match(link, /\?section=revisione#r=z[A-Za-z0-9_-]+&d=\d+$/);
    await b.send('Page.navigate', { url: link });
    await b.waitFor(`document.readyState === 'complete' && !!document.querySelector('.tabs .active')`, 10000);
    await b.waitFor(`!document.getElementById('review-summary').hidden`, 60000);
    assert.equal(await b.text('#review-summary'), before);
    assert.equal(await b.ev(`location.hash`), ''); // un ricaricamento non rifà la revisione
  });

  await step('lezioni: indice, spiegazione con dimostrazione, esercizio sbagliato e giusto, lezione completata', async () => {
    await b.click('#tab-lessons');
    await b.waitFor(`document.querySelectorAll('#ls-groups .ls-item').length > 0`, 10000);
    const total = await b.ev(`document.querySelectorAll('#ls-groups .ls-item').length`);
    assert.ok(total >= 10, `solo ${total} lezioni`);
    await shot('11-lessons');
    await b.click('#ls-groups .ls-item[data-id="fork"]');
    assert.equal(await b.text('#ls-step-count'), 'Passo 1 di 4');
    await b.click('#ls-next');
    // Dimostrazione Ce7+: parte da sola, poi compaiono le due frecce
    await b.waitFor(`document.querySelectorAll('#ls-board .arrows g').length === 2`, 5000);
    assert.equal(await b.ev(`!!document.querySelector('#ls-board .sq.check')`), true);
    await b.click('#ls-next');
    const sq = (s, flipped = false) => b.clickSquare(s, 'ls-board', flipped);
    await sq('b5'); await sq('d4'); // sbagliata
    await b.waitFor(`document.getElementById('ls-card').dataset.state === 'wrong'`, 5000);
    await b.waitFor(`/Stockfish risponde/.test(document.getElementById('ls-feedback').textContent)`, 30000);
    await b.click('#ls-retry');
    await sq('b5'); await sq('c7'); // forchetta
    await b.waitFor(`document.getElementById('ls-card').dataset.state === 'solved'`, 5000);
    assert.match(await b.text('#ls-feedback'), /Cc7\+/);
    await shot('12-lesson-solved');
    await b.click('#ls-next');
    await b.click('#ls-solution'); // ultimo esercizio: soluzione mostrata
    await b.waitFor(`document.getElementById('ls-card').dataset.state === 'solved'`, 5000);
    assert.equal(await b.text('#ls-next'), 'Completa la lezione');
    await b.click('#ls-next');
    assert.match(await b.text('#ls-meta'), /inchiodatura/i); // si apre la lezione successiva
    await b.click('#ls-back');
    assert.match(await b.text('#ls-progress-text'), /^1 di /);
    assert.equal(await b.ev(`document.querySelector('.ls-item[data-id="fork"]').classList.contains('done')`), true);
    // Esercizio con più risposte giuste, dal lato del Nero
    await b.click('#ls-groups .ls-item[data-id="scholars-mate"]');
    await b.click('#ls-next');
    await b.click('#ls-next');
    await sq('g8', true); await sq('f6', true); // Cf6?? permette Dxf7#
    await b.waitFor(`/Dxf7#/.test(document.getElementById('ls-feedback').textContent)`, 30000);
    await b.click('#ls-retry');
    await sq('d8', true); await sq('e7', true); // De7: accettata
    await b.waitFor(`document.getElementById('ls-card').dataset.state === 'solved'`, 5000);
    await b.click('#ls-back');
    await b.click('#tab-review');
  });

  await step('informazioni e licenze (avvisi GPLv3)', async () => {
    await b.click('#btn-about');
    const about = await b.text('#dlg-about');
    assert.match(about, /GNU General Public License versione 3/);
    assert.match(about, /senza alcuna garanzia/);
    assert.match(about, /github\.com\/nmrugg\/stockfish\.js\/tree\/v17\.1\.0/);
    const license = await (await fetch(`${url}LICENSE`)).text();
    assert.match(license, /GNU GENERAL PUBLIC LICENSE\s+Version 3/);
    await b.click('#about-close');
  });

  // ---------- Analisi partita ----------
  const typeMove = (m) => b.ev(`(() => { document.getElementById('move-text').value = ${JSON.stringify(m)};
    document.getElementById('move-form').requestSubmit(); })()`);
  const gameCard = () => b.text('#game-move-card');
  // Solo il testo delle mosse (senza i simboli delle categorie)
  const movesText = () => b.ev(`[...document.querySelectorAll('#movelist li')]
    .map((li) => [...li.querySelectorAll('.num, .mv > span:last-child')].map((e) => e.textContent).join(' ')).join(' ')`);

  await step('analisi partita: impostazione con colore e nomi', async () => {
    await b.click('#tab-analysis');
    await b.click('#btn-reset'); // "Nuova partita": non cancella nulla finché non si preme Inizia
    assert.equal(await b.ev(`document.getElementById('game-setup').hidden`), false);
    assert.equal(await b.ev(`document.getElementById('setup-back').hidden`), false);
    await b.click('#setup-color button:nth-child(2)'); // Nero
    await b.ev(`document.getElementById('setup-white').value = 'Mario'; document.getElementById('setup-black').value = 'Anna'`);
    await b.click('#btn-setup-start');
    await sleep(200);
    assert.equal(await b.ev(`document.getElementById('evalbar').classList.contains('flipped')`), true, 'scacchiera dal lato del Nero');
    assert.equal(await b.text('#tag-bottom'), 'Anna (tu)');
    assert.equal(await b.text('#tag-top'), 'Mario');
    assert.match(await gameCard(), /Posizione iniziale/);
  });

  await step('analisi partita: mosse veloci, 3 linee, classificazione e punto di svolta', async () => {
    for (const m of ['e4', 'e5', 'Dh5', 'Cc6', 'Ac4', 'Cf6']) await typeMove(m); // senza attendere: l'analisi precedente si annulla
    assert.equal(await movesText(), '1. e4 e5 2. Dh5 Cc6 3. Ac4 Cf6');
    await b.waitFor(`/Errore grave/.test(document.getElementById('game-move-card').innerText)`, 60000);
    assert.match(await gameCard(), /3… Cf6 Errore grave/);
    assert.match(await gameCard(), /Migliore: \S+/);
    await b.waitFor(`(document.getElementById('depth-info').textContent || '').includes('✓')`, 60000);
    assert.equal(await b.ev(`document.querySelectorAll('#lines .eline:not(.placeholder)').length`), 3);
    assert.match(await b.text('#adv-card'), /Il Bianco ha il matto in 1/);
    // Tutte le posizioni vengono valutate in sottofondo: il grafico cresce fino all'ultima
    await b.waitFor(`document.querySelectorAll('#movelist .cls-icon').length === 6`, 90000);
    assert.match(await b.text('#adv-card'), /Hai iniziato a perdere vantaggio con 3… Cf6/);
    assert.equal(await b.ev(`!!document.querySelector('#eval-graph .dot-turning')`), true);
    assert.equal(await b.ev(`!!document.querySelector('.badge svg')`), true);
    await shot('08-game');
    await typeMove('Dxf7#');
    await b.waitFor(`/Scacco matto: vince il Bianco/.test(document.getElementById('adv-card').innerText)`, 30000);
  });

  await step('allenatore: suggerimento dimostrato, freccia, variante, livello Indizio, spegnimento', async () => {
    await b.click('#btn-undo'); // torna alla posizione dopo 3... Cf6 (tocca al Bianco)
    await b.waitFor(`/matto in 1/.test(document.getElementById('coach-body').innerText)`, 60000);
    assert.match(await b.text('#coach-body'), /Attenzione: l'avversario ha il matto in 1 \(Dxf7#\)/);
    await b.click('#coach-body .coach-hint');
    await sleep(150);
    assert.match(await b.text('#coach-body'), /Variante del motore: 4\. Dxf7#/);
    assert.equal(await b.ev(`document.querySelectorAll('.arrows line').length`), 1, 'solo la freccia del suggerimento');
    await shot('11-coach');
    await b.click('#coach-level button:nth-child(1)'); // Indizio
    await sleep(150);
    assert.match(await b.text('#coach-body'), /C'è un matto per il Bianco: cercala!/);
    assert.match(await b.text('#lines'), /Linee nascoste/);
    assert.equal(await b.ev(`document.querySelectorAll('.arrows line').length`), 0);
    await b.click('#coach-body .coach-hint'); // tocco = soluzione
    await sleep(150);
    assert.match(await b.text('#coach-body'), /Dxf7#/);
    await b.click('#coach-level button:nth-child(2)'); // Soluzione
    await b.ev(`document.getElementById('coach-on').click()`);
    await sleep(150);
    assert.match(await b.text('#coach-body'), /Allenatore spento/);
    await b.ev(`document.getElementById('coach-on').click()`);
    await b.click('#btn-redo');
    await sleep(150);
  });

  await step('analisi partita: annulla e ripeti', async () => {
    await b.click('#btn-undo');
    await sleep(150);
    assert.equal(await movesText(), '1. e4 e5 2. Dh5 Cc6 3. Ac4 Cf6');
    assert.equal(await b.ev(`document.getElementById('btn-redo').disabled`), false);
    await b.click('#btn-redo');
    await sleep(150);
    assert.match(await movesText(), /4\. Dxf7#$/);
    assert.equal(await b.ev(`document.getElementById('btn-redo').disabled`), true);
  });

  await step('analisi partita: variante da un punto qualsiasi e ritorno alla linea principale', async () => {
    await b.ev(moveButton(4)); // dopo 3. Ac4
    await sleep(150);
    await typeMove('g6');
    await sleep(200);
    assert.equal(await b.ev(`document.getElementById('variation-bar').hidden`), false);
    assert.match(await b.text('#variation-text'), /al posto di 3… Cf6/);
    assert.equal(await movesText(), '1. e4 e5 2. Dh5 Cc6 3. Ac4 g6');
    await b.click('#btn-var-main');
    await sleep(150);
    assert.equal(await b.ev(`document.getElementById('variation-bar').hidden`), true);
    assert.match(await movesText(), /3\. Ac4 Cf6 4\. Dxf7#$/);
  });

  await step('analisi partita: PGN con i nomi e revisione completa', async () => {
    await b.click('#btn-io');
    const pgn = await b.ev(`document.getElementById('io-pgn').value`);
    assert.match(pgn, /\[White "Mario"\]/);
    assert.match(pgn, /\[Black "Anna"\]/);
    assert.match(pgn, /4\. Qxf7#/);
    await b.click('#io-close');
    await b.click('#btn-review-this');
    assert.equal(await b.text('.tabs .active'), 'Revisione');
    await b.waitFor(`!document.getElementById('review-summary').hidden`, 120000);
    assert.match(await b.text('#review-summary'), /Mario.*Anna/);
  });

  await step('analisi partita: parti da una posizione (FEN)', async () => {
    await b.click('#tab-analysis');
    await b.click('#btn-reset');
    await b.ev(`document.getElementById('setup-fen-box').open = true; document.getElementById('setup-fen').value = 'non una fen'`);
    await b.click('#btn-setup-start');
    assert.match(await b.text('#setup-error'), /FEN non valida/);
    await b.click('#setup-color button:nth-child(1)'); // Bianco
    await b.ev(`document.getElementById('setup-fen').value = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'`);
    await b.click('#btn-setup-start');
    await sleep(200);
    assert.equal(await b.ev(`document.getElementById('game-setup').hidden`), true);
    await b.waitFor(`/matto in 1/.test(document.getElementById('adv-card').innerText)`, 30000);
    await typeMove('Td8#');
    await b.waitFor(`/Scacco matto: vince il Bianco \\(tu\\)/.test(document.getElementById('adv-card').innerText)`, 30000);
  });

  await step('analisi partita sul telefono (375 px)', async () => {
    await b.viewport(375, 812, true);
    await sleep(400);
    assert.equal(await b.ev(`document.documentElement.scrollWidth <= 375`), true);
    const small = await b.ev(`[...document.querySelectorAll('#analysis-tools .btn, #move-form .btn, .navbar .btn, #coach-level button, .coach-hint, .switch, .tabs button')]
      .filter((el) => el.getClientRects().length && el.getBoundingClientRect().height < 40).length`); // solo elementi visibili
    assert.equal(small, 0, 'pulsanti troppo piccoli per il dito');
    await shot('09-game-mobile');
    await b.click('#btn-reset');
    await sleep(200);
    assert.equal(await b.ev(`document.documentElement.scrollWidth <= 375`), true);
    await shot('10-setup-mobile');
    await b.click('#setup-back');
    await b.viewport(1280, 900);
  });

  await step('teoria delle aperture: continuazioni dal dataset, una mossa giocata con un tocco', async () => {
    await b.click('#tab-analysis');
    await b.click('#btn-reset');
    await b.ev(`document.getElementById('setup-fen-box').open = false; document.getElementById('setup-fen').value = ''`);
    await b.click('#setup-color button:nth-child(1)');
    await b.click('#btn-setup-start');
    await b.waitFor(`!document.getElementById('opening-card').hidden`, 10000);
    assert.match(await b.text('#opening-count'), /continuazioni/);
    await b.ev(`[...document.querySelectorAll('#opening-moves .opening-move')].find((x) => x.querySelector('b').textContent === 'e4').click()`);
    await b.waitFor(`document.getElementById('movelist').textContent.includes('e4')`, 5000);
    assert.match(await b.text('#movelist'), /^1\. e4/);
    assert.match(await b.text('#opening-name'), /^B00 · King's Pawn/);
    assert.ok(await b.ev(`[...document.querySelectorAll('#opening-moves b')].some((x) => x.textContent === 'e5')`));
    await shot('16-openings');
  });

  await step('i tuoi dati: esportazione e importazione di un backup', async () => {
    await b.click('#tab-review');
    await b.ev(`document.getElementById('btn-about').click()`);
    // Esportazione: si legge il file prodotto (senza scaricarlo davvero)
    await b.send('Browser.setDownloadBehavior', { behavior: 'deny' }); // niente file scaricati davvero durante il test
    const exported = await b.ev(`new Promise((resolve) => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = (blob) => { URL.createObjectURL = orig; blob.text().then(resolve); return orig(blob); };
      document.getElementById('data-export').click();
    })`);
    const backup = JSON.parse(exported);
    assert.equal(backup.app, 'CHES54.com');
    assert.ok('lessonsDone' in backup.data, 'mancano i progressi delle lezioni');
    // Importazione: un backup con tutte le lezioni base completate
    backup.data.lessonsDone = JSON.stringify(['hanging', 'fork', 'pin']);
    const file = join(tmpdir(), `ches54-backup-test-${process.pid}.json`);
    writeFileSync(file, JSON.stringify(backup));
    const { root: docRoot } = (await b.send('DOM.getDocument')).result;
    const { nodeId } = (await b.send('DOM.querySelector', { nodeId: docRoot.nodeId, selector: '#data-import' })).result;
    await b.send('DOM.setFileInputFiles', { nodeId, files: [file] });
    await b.waitFor(`/Sostituisci i miei dati/.test(document.getElementById('data-msg').textContent)`, 5000);
    await b.ev(`[...document.querySelectorAll('#data-msg button')].find((x) => x.textContent === 'Sostituisci i miei dati').click()`);
    await sleep(500);
    await b.waitFor(`document.readyState === 'complete' && !!document.querySelector('.tabs .active')`, 10000);
    await b.click('#tab-lessons');
    await b.waitFor(`/^3 di /.test(document.getElementById('ls-progress-text').textContent)`, 10000);
    // Un file estraneo viene rifiutato con un messaggio
    writeFileSync(file, '{"app":"Altro"}');
    await b.ev(`document.getElementById('btn-about').click()`);
    const { root: r2 } = (await b.send('DOM.getDocument')).result;
    const { nodeId: n2 } = (await b.send('DOM.querySelector', { nodeId: r2.nodeId, selector: '#data-import' })).result;
    await b.send('DOM.setFileInputFiles', { nodeId: n2, files: [file] });
    await b.waitFor(`/non è un backup di CHES54/.test(document.getElementById('data-msg').textContent)`, 5000);
    await b.ev(`document.getElementById('about-close').click()`);
  });

  await step('audio: musica lofi (accesa, ripresa dopo il ricaricamento, spenta) e suono delle mosse', async () => {
    const stats = `({ ...window.__ches54Audio })`;
    await b.click('#tab-analysis');
    await b.click('#btn-audio');
    assert.equal(await b.ev(`document.getElementById('audio-panel').hidden`), false);
    assert.equal(await b.ev(`document.getElementById('sfx-on').checked`), true);  // suoni accesi di base
    assert.equal(await b.ev(`document.getElementById('music-on').checked`), false); // musica spenta di base
    await b.click('#music-on');
    await b.waitFor(`document.getElementById('btn-audio').classList.contains('playing')`, 3000);
    const before = (await b.ev(stats)).musicSteps;
    await sleep(1500);
    assert.ok((await b.ev(stats)).musicSteps >= before + 4, 'la musica non programma nuove note');
    // Ricaricamento: la preferenza resta e la musica riparte al primo tocco
    await b.send('Page.reload');
    await b.waitFor(`document.readyState === 'complete' && !!document.querySelector('.tabs .active')`, 10000);
    assert.equal(await b.ev(`document.getElementById('btn-audio').classList.contains('playing')`), false);
    await b.mouse(640, 450);
    await b.waitFor(`document.getElementById('btn-audio').classList.contains('playing')`, 3000);
    await b.click('#btn-audio');
    await b.click('#music-on');
    assert.equal(await b.ev(`document.getElementById('btn-audio').classList.contains('playing')`), false);
    await b.ev(`document.body.click()`); // chiude il pannello
    assert.equal(await b.ev(`document.getElementById('audio-panel').hidden`), true);
    // Suono di una mossa (Analisi partita: nuova partita, 1.e4)
    await b.click('#btn-reset');
    await sleep(200);
    await b.click('#setup-color button:nth-child(1)');
    await b.click('#btn-setup-start');
    await sleep(300);
    const sounds = (await b.ev(stats)).moveSounds;
    await b.clickSquare('e2'); await b.clickSquare('e4');
    await b.waitFor(`document.getElementById('movelist').textContent.includes('e4')`, 3000);
    await b.waitFor(`window.__ches54Audio.moveSounds > ${sounds}`, 3000);
  });

  await step('versione inglese: nessun testo italiano visibile nelle sezioni, notazione inglese', async () => {
    await b.click('#tab-review');
    await b.click('#btn-lang');
    await sleep(300);
    await b.waitFor(`document.readyState === 'complete' && !!document.querySelector('.tabs .active')`, 10000);
    assert.equal(await b.ev(`document.documentElement.lang`), 'en');
    assert.equal(await b.text('.tabs .active'), 'Review');
    // Parole che in un testo inglese non dovrebbero comparire (nomi propri e di aperture esclusi)
    const ITALIAN = /\b(della|delle|degli|il|lo|gli|una|uno|che|con|sono|mossa|mosse|partita|partite|Tocca|Revisione|Problemi|Lezioni|Gioca|Allenatore|Livello|Nessun[ao]?|Indietro|Avanti|Soluzione|Indizio|Bianco|Nero|scacchiera|Precisione|profondità|Valutazione|perdita|Annulla|Chiudi)\b/;
    const visibleItalian = () => b.ev(`(() => {
      const re = ${ITALIAN};
      const bad = document.body.innerText.split('\\n').map((l) => l.trim()).filter((l) => l && re.test(l));
      for (const d of document.querySelectorAll('dialog[open]')) bad.push(...d.innerText.split('\\n').filter((l) => re.test(l)));
      return bad;
    })()`);
    const check = async (where) => assert.deepEqual(await visibleItalian(), [], where);
    try {
    await b.waitFor(`!document.getElementById('review-summary').hidden`, 30000);
    await check('Review');
    await b.click('#tab-analysis');
    await sleep(500);
    await check('Game analysis');
    await b.click('#tab-play');
    await sleep(300);
    await check('Play');
    await b.click('#tab-lessons');
    await b.waitFor(`document.querySelectorAll('#ls-groups .ls-item').length > 0`, 10000);
    await check('Lessons index');
    await b.click('#ls-groups .ls-item[data-id="fork"]');
    await b.click('#ls-next');
    assert.equal(await b.text('#ls-title'), 'Ne7+'); // notazione inglese
    await check('Lesson');
    await b.click('#ls-back');
    await b.click('#tab-puzzles');
    await b.waitFor(`/to move/.test(document.getElementById('pz-title').textContent)`, 10000);
    await check('Puzzles');
    await b.click('#tab-review');
    await b.ev(`document.getElementById('btn-library')?.click()`);
    await b.waitFor(`document.querySelectorAll('#dlg-library .lib-item').length > 0`, 10000);
    assert.match(await b.text('#dlg-library .lib-item'), /moves/);
    await check('Library');
    await shot('17-english');
    await b.click('.lib-close');
    await b.ev(`document.getElementById('btn-about').click()`);
    await check('About');
    await b.ev(`document.getElementById('about-close').click()`);
    } finally {
      // Ritorno all'italiano per le prove successive (anche se questa fallisce)
      await b.ev(`localStorage.setItem('ches54:lang', 'it')`);
      await b.send('Page.reload');
      await b.waitFor(`document.readyState === 'complete' && document.documentElement.lang === 'it' && !!document.querySelector('.tabs .active')`, 10000);
    }
  });

  await step('link diretto a una sezione e tastiera nelle lezioni', async () => {
    await b.send('Page.navigate', { url: `${url}?section=lezioni` });
    await b.waitFor(`document.querySelectorAll('#ls-groups .ls-item').length > 0`, 10000);
    assert.equal(await b.text('.tabs .active'), 'Lezioni');
    await b.click('#ls-groups .ls-item[data-id="pin"]');
    await b.key('ArrowRight', 'ArrowRight', 39);
    assert.equal(await b.text('#ls-step-count'), 'Passo 2 di 3');
    await b.key('ArrowLeft', 'ArrowLeft', 37);
    assert.equal(await b.text('#ls-step-count'), 'Passo 1 di 3');
  });

  await step('nessun errore nella console', async () => {
    assert.deepEqual(b.errors, []);
  });

  // Ultima prova: spegne davvero il server (l'emulazione "offline" del browser non vale per il service worker).
  await step('offline: a server spento lezioni, problemi e motore funzionano dalla cache', async () => {
    await b.waitFor(`navigator.serviceWorker && navigator.serviceWorker.controller !== null`, 30000);
    server.kill();
    await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r)));
    await b.send('Page.navigate', { url: `${url}?section=problemi` });
    await b.waitFor(`document.readyState === 'complete'`, 15000);
    // Controprova: un file mai salvato in cache non arriva
    assert.equal(await b.ev(`fetch('README.md', { cache: 'no-store' }).then((r) => r.ok, () => false)`), false);
    await b.waitFor(`/trova la mossa/.test(document.getElementById('pz-title')?.textContent ?? '')`, 15000);
    await b.click('#tab-lessons');
    await b.waitFor(`document.querySelectorAll('#ls-groups .ls-item').length > 0`, 10000);
    // Il motore (worker + wasm) parte dalla cache e risponde con una mossa
    const best = await b.ev(`new Promise((resolve) => {
      const w = new Worker('engine/stockfish.js');
      w.onmessage = (e) => { if (String(e.data).startsWith('bestmove')) { w.terminate(); resolve(String(e.data)); } };
      w.postMessage('uci'); w.postMessage('position startpos'); w.postMessage('go depth 8');
      setTimeout(() => resolve('timeout'), 15000);
    })`);
    assert.match(best, /^bestmove [a-h][1-8][a-h][1-8]/);
  });
} finally {
  await b.close();
  server.kill();
}

console.log(`\n${results.length - failures} superati, ${failures} falliti`);
process.exit(failures ? 1 : 0);
