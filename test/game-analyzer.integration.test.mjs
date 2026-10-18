// Analisi di partite intere con il vero Stockfish (profondità bassa per restare veloci).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/engine/engine.js';
import { nodeTransport } from '../src/engine/node-transport.js';
import { gameFromPgn } from '../src/analysis/game-model.js';
import { OpeningBook } from '../src/analysis/openings.js';
import { analyzeGame } from '../src/analysis/game-analyzer.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const engine = new Engine(nodeTransport(root('engine/stockfish.js')));
const book = new OpeningBook(JSON.parse(readFileSync(root('data/openings/openings.json'), 'utf8')));
after(() => engine.terminate());

const settings = { depth: 10, multiPv: 2, movetimeMs: null };

test('Matto del barbiere: errore che subisce matto, matto dato, precisioni', async () => {
  const game = gameFromPgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
  const progress = [];
  const a = await analyzeGame(game, engine, { book, settings, onProgress: (d, t) => progress.push(`${d}/${t}`) });
  assert.equal(a.moves.length, 7);
  assert.equal(progress.at(-1), '8/8');

  const nf6 = a.moves[5];
  assert.equal(nf6.ply.san, 'Nf6');
  assert.equal(nf6.classification, 'blunder');
  assert.notEqual(nf6.bestSan, 'Nf6'); // il motore indica una difesa di f7 (g6 o Qe7)
  assert.equal(nf6.isBest, false);
  assert.deepEqual(nf6.after.score, { cp: null, mate: 1 });

  const qxf7 = a.moves[6];
  assert.equal(qxf7.after.terminal, 'checkmate');
  assert.equal(qxf7.after.winner, 'w');
  assert.ok(['best', 'great', 'brilliant'].includes(qxf7.classification));
  assert.equal(qxf7.accuracy, 100);

  assert.ok(a.opening, 'apertura riconosciuta');
  assert.ok(a.bookPlies >= 2);
  assert.ok(a.players.b.accuracy < a.players.w.accuracy);
  assert.equal(a.players.b.counts.blunder, 1);
  assert.ok(a.keyMoments.some((k) => k.index === 5), 'il blunder è un momento chiave');
});

test('Partita dell\'Opera: i sacrifici famosi sono Brilliant', async () => {
  const game = gameFromPgn(readFileSync(root('data/examples/opera-game.pgn'), 'utf8'));
  const a = await analyzeGame(game, engine, { book, settings: { ...settings, depth: 14 } });
  const bySan = (san) => a.moves.find((m) => m.ply.san === san && m.ply.color === 'w');
  assert.equal(a.opening.eco, 'C41');
  assert.equal(bySan('Qb8+').classification, 'brilliant');
  assert.equal(bySan('Rd8#').after.terminal, 'checkmate');
  assert.equal(a.result, '1-0');
});

test('Ritenta la mossa: un\'alternativa migliore viene riconosciuta', async () => {
  const { evaluateAttempt, retryCandidates } = await import('../src/analysis/retry.js');
  const game = gameFromPgn('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0');
  const a = await analyzeGame(game, engine, { book, settings });
  assert.deepEqual(retryCandidates(a), [5]);
  assert.deepEqual(retryCandidates(a, 'w'), []);

  const good = await evaluateAttempt({ analysis: a, index: 5, move: a.moves[5].bestSan, engine });
  assert.equal(good.isBest, true);
  assert.equal(good.improved, true);
  assert.ok(['best', 'great', 'brilliant', 'excellent'].includes(good.classification));

  const bad = await evaluateAttempt({ analysis: a, index: 5, move: 'a6', engine });
  assert.equal(bad.classification, 'blunder');
  assert.equal(bad.after.lines[0].pv[0], 'h5f7', 'il motore mostra il matto');
  assert.equal(await evaluateAttempt({ analysis: a, index: 5, move: 'Ke2', engine }), null);
});
