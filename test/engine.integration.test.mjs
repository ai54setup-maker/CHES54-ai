// Test con il vero Stockfish (WASM eseguito in Node). Richiede qualche secondo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/engine/engine.js';
import { nodeTransport } from '../src/engine/node-transport.js';

const SCRIPT = fileURLToPath(new URL('../engine/stockfish.js', import.meta.url));
const engine = new Engine(nodeTransport(SCRIPT));
after(() => engine.terminate());

test('posizione iniziale: 3 linee distinte, valutazione vicina alla parità', async () => {
  const r = await engine.analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 10, multiPv: 3 });
  assert.equal(r.lines.length, 3);
  assert.equal(new Set(r.lines.map((l) => l.pv[0])).size, 3);
  assert.ok(r.depth >= 10);
  assert.ok(Math.abs(r.lines[0].score.cp) < 100, `valutazione inattesa: ${r.lines[0].score.cp}`);
  assert.equal(r.bestMove, r.lines[0].pv[0]);
});

test('matto in 1 per il Nero: punteggio -M1 dal punto di vista del Bianco', async () => {
  // Matto dell'imbecille: dopo 1.f3 e5 2.g4 il Nero gioca Dh4#
  const r = await engine.analyze('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2', { depth: 6, multiPv: 1 });
  assert.deepEqual(r.lines[0].score, { cp: null, mate: -1 });
  assert.equal(r.bestMove, 'd8h4');
});

test('posizione di matto: nessuna linea', async () => {
  const r = await engine.analyze('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', { depth: 6, multiPv: 1 });
  assert.deepEqual(r.lines, []);
  assert.equal(r.bestMove, null);
});

test('limite di tempo e cache', async () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  const t0 = Date.now();
  const r = await engine.analyze(fen, { depth: 40, multiPv: 2, movetimeMs: 300 });
  assert.ok(Date.now() - t0 < 3000, 'il limite di tempo non è stato rispettato');
  assert.equal(r.lines.length, 2);
  const again = await engine.analyze(fen, { depth: 40, multiPv: 2, movetimeMs: 300 });
  assert.equal(again.fromCache, true);
});
