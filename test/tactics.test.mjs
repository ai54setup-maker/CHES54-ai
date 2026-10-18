// Allenatore: ogni tipo di tattica su una posizione nota, con il vero Stockfish (WASM in Node),
// più i casi negativi: posizioni tranquille e "tattiche" che perdono materiale non vanno segnalate.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/engine/engine.js';
import { nodeTransport } from '../src/engine/node-transport.js';
import { positionEval } from '../src/analysis/game-analyzer.js';
import { coachHints, recognizeTactic, nullMoveFen } from '../src/analysis/tactics.js';
import { ANALYSIS_CONFIG } from '../src/config/analysis.js';

const engine = new Engine(nodeTransport(fileURLToPath(new URL('../engine/stockfish.js', import.meta.url))));
after(() => engine.terminate());
const DEPTH = 12;

/** Suggerimenti per una posizione, con le stesse analisi dell'app (MultiPV 3 + mossa nulla). */
async function hintsFor(fen) {
  const pe = positionEval(await engine.analyze(fen, { depth: DEPTH, multiPv: 3 }));
  const nf = nullMoveFen(fen);
  const threat = nf ? positionEval(await engine.analyze(nf, { depth: ANALYSIS_CONFIG.coach.threatDepth, multiPv: 1 })) : null;
  return coachHints({ fen, pe, threat });
}
const only = (hints, kind) => {
  assert.equal(hints.length >= 1, true, 'nessun suggerimento');
  assert.equal(hints[0].kind, kind, `atteso ${kind}, trovato ${hints.map((h) => h.kind).join(', ')}`);
  return hints[0];
};
const pieces = (h) => h.targets.map((t) => t.piece).sort().join('');

test('matto: Td8# (matto in 1)', async () => {
  const h = only(await hintsFor('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'), 'mate');
  assert.equal(h.move, 'd1d8');
  assert.equal(h.mateIn, 1);
  assert.equal(h.threat, false);
});

test('forchetta: Ce7+ attacca re e donna', async () => {
  const h = only(await hintsFor('2q3k1/5ppp/8/3N4/8/8/5PP1/6K1 w - - 0 1'), 'fork');
  assert.equal(h.move, 'd5e7');
  assert.equal(pieces(h), 'kq');
  assert.ok(h.gain >= 2);
});

test('inchiodatura: Te1 inchioda la donna al re', async () => {
  const h = only(await hintsFor('4k3/8/8/4q3/8/8/5PPP/R4K2 w - - 0 1'), 'pin');
  assert.equal(h.move, 'a1e1');
  assert.deepEqual(h.targets.map((t) => t.piece), ['q', 'k']);
});

test('infilata: Th7+ attacca il re e, dietro, la donna (e il Nero minacciava a sua volta Da1+)', async () => {
  const hints = await hintsFor('8/q3k3/8/8/8/8/5PP1/2K4R w - - 0 1');
  const h = only(hints, 'skewer');
  assert.equal(hints[1]?.threat, true);
  assert.equal(hints[1]?.move, 'a7a1');
  assert.equal(h.move, 'h1h7');
  assert.deepEqual(h.targets.map((t) => t.piece), ['k', 'q']);
});

test('attacco di scoperta: Cc6+ libera l\'alfiere contro la donna', async () => {
  const h = only(await hintsFor('1k6/6q1/8/8/3N4/8/1B4PP/6K1 w - - 0 1'), 'discovered');
  assert.equal(h.move, 'd4c6');
  assert.deepEqual(h.attacker, { piece: 'b', square: 'b2' });
  assert.deepEqual(h.targets, [{ piece: 'q', square: 'g7' }]);
});

test('pezzo in presa: Axe5 cattura il cavallo indifeso', async () => {
  const h = only(await hintsFor('4k3/6pp/8/4n3/8/2B5/6PP/6K1 w - - 0 1'), 'hanging');
  assert.equal(h.move, 'c3e5');
  assert.deepEqual(h.targets, [{ piece: 'n', square: 'e5' }]);
});

test('minaccia dell\'avversario: il cavallo in e4 è attaccato dal pedone', async () => {
  const hints = await hintsFor('4kb2/6pp/8/3p4/4N3/8/6PP/6K1 w - - 0 1');
  const t = hints.find((h) => h.threat);
  assert.ok(t, `nessuna minaccia: ${JSON.stringify(hints.map((h) => h.kind))}`);
  assert.equal(t.kind, 'hanging');
  assert.equal(t.side, 'b');
  assert.equal(t.move, 'd5e4');
  assert.equal(hints.some((h) => !h.threat), false, 'salvare il cavallo non è una "tattica"');
});

test('negativo: posizione iniziale e posizione tranquilla → nessun suggerimento', async () => {
  assert.deepEqual(await hintsFor('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), []);
  assert.deepEqual(await hintsFor('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'), []);
});

test('negativo: una forchetta che perde materiale non è segnalata', async () => {
  // Cc7+ attacca re e torre, ma la donna in d8 cattura il cavallo
  const fen = 'r2qk3/8/8/1N6/8/8/6PP/6K1 w - - 0 1';
  assert.equal(recognizeTactic(fen, ['b5c7', 'd8c7', 'g1f2', 'c7c5', 'f2e2']), null);
  const hints = await hintsFor(fen);
  assert.equal(hints.some((h) => h.kind === 'fork'), false);
});

test('negativo: forchetta "vera" sulla scacchiera ma il motore preferisce altro → niente', () => {
  // Riconoscitore senza guadagno di materiale lungo la linea: nessun nome
  assert.equal(recognizeTactic('2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', ['g1f1', 'c8c1', 'f1e2']), null);
});

test('mossa nulla: non si fa se chi muove è sotto scacco; en passant azzerato', () => {
  assert.equal(nullMoveFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'), null);
  assert.equal(nullMoveFen('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2'), 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2');
});
