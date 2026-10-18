// Spiegazioni: fatti ricavati dalle linee del motore, su posizioni costruite apposta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainMove } from '../src/analysis/explain.js';
import { gameFromPgn } from '../src/analysis/game-model.js';
import { winPercent } from '../src/analysis/winpct.js';
import { formatExplanation } from '../src/ui/explanations.js';

const cp = (v) => ({ cp: v, mate: null });
const mate = (n) => ({ cp: null, mate: n });
function pe(lines) {
  const ls = lines.map(([score, pv], i) => ({ multipv: i + 1, depth: 14, score, pv }));
  return { fen: '', score: ls[0].score, terminal: null, winner: null, winPct: winPercent(ls[0].score), lines: ls, bestMove: ls[0].pv[0], depth: 14 };
}
const lastPly = (pgn) => gameFromPgn(pgn).plies.at(-1);

test('pezzo lasciato in presa', () => {
  const ply = lastPly('1. e4 e5 2. Ba6 *');
  const facts = explainMove({
    ply,
    classification: 'blunder',
    before: pe([[cp(30), ['g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3']]]),
    after: pe([[cp(-300), ['b7a6', 'g1f3', 'g8f6', 'd2d3', 'f8c5']]]),
  });
  assert.equal(facts[0].kind, 'hangs');
  assert.deepEqual(facts[0].piece, { piece: 'b', square: 'a6' });
  assert.equal(facts[0].loss, 3);
  const t = formatExplanation(facts[0]);
  assert.equal(t.text, "L'alfiere appena mosso in a6 resta in presa: si perdono 3 punti di materiale.");
  assert.equal(formatExplanation({ ...facts[0], piece: { piece: 'r', square: 'a6' }, loss: 1 }).text,
    'La torre appena mossa in a6 resta in presa: si perde 1 punto di materiale.');
  assert.match(t.line, /^2\. Aa6 bxa6 3\. Cf3/);
});

test('forchetta di cavallo', () => {
  // Il Nero sposta la donna che proteggeva c7: Cc7+ attacca re e torre
  const ply = lastPly('[FEN "r2qk3/8/8/1N6/8/8/8/6K1 b - - 0 1"]\n\n1... Qh4 *');
  const facts = explainMove({
    ply,
    classification: 'blunder',
    before: pe([[cp(0), ['d8d7', 'g1f2', 'e8e7', 'f2e3', 'a8c8']]]),
    after: pe([[cp(500), ['b5c7', 'e8d8', 'c7a8', 'h4e4', 'g1f1']]]),
  });
  assert.equal(facts[0].kind, 'allowsFork');
  assert.deepEqual(facts[0].forker, { piece: 'n', square: 'c7' });
  assert.deepEqual(facts[0].targets.map((t) => t.square).sort(), ['a8', 'e8']);
  assert.equal(facts[0].loss, 5);
  assert.match(formatExplanation(facts[0]).text, /forchetta: il cavallo in c7 attacca .*il re in e8/);
});

test('matto concesso e matto mancato, con la variante', () => {
  const nf6 = lastPly('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 *');
  const allows = explainMove({
    ply: nf6,
    classification: 'blunder',
    before: pe([[cp(-20), ['g7g6', 'h5f3', 'g8f6']]]),
    after: pe([[mate(1), ['h5f7']]]),
  });
  assert.equal(allows[0].kind, 'allowsMate');
  assert.equal(allows[0].mateIn, 1);
  assert.equal(formatExplanation(allows[0]).line, '3… Cf6 4. Dxf7#');

  const nc6 = lastPly('1. f3 e5 2. g4 Nc6 *');
  const misses = explainMove({
    ply: nc6,
    classification: 'blunder',
    before: pe([[mate(-1), ['d8h4']]]),
    after: pe([[cp(-80), ['d2d3', 'd7d5']]]),
  });
  assert.equal(misses[0].kind, 'missesMate');
  assert.equal(formatExplanation(misses[0]).line, '2… Dh4#');
});

test('materiale che la mossa migliore avrebbe vinto', () => {
  const ply = lastPly('[FEN "4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1"]\n\n1. Kf1 *');
  const facts = explainMove({
    ply,
    classification: 'blunder',
    before: pe([[cp(900), ['d2d5', 'e8e7', 'd5d4', 'e7e6', 'e1e2']]]),
    after: pe([[cp(-900), ['d5a5', 'f1g2', 'a5a2', 'g2g3', 'a2a3']]]),
  });
  assert.equal(facts[0].kind, 'missesMaterial');
  assert.equal(facts[0].gain, 9);
  assert.match(formatExplanation(facts[0]).line, /^1\. Txd5/);
});

test('scambio alla pari: nessuna spiegazione inventata', () => {
  // 3.Bxc6 dxc6: alfiere per cavallo, la linea non mostra perdita di materiale
  const ply = lastPly('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 *');
  const facts = explainMove({
    ply,
    classification: 'inaccuracy',
    before: pe([[cp(40), ['b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1']]]),
    after: pe([[cp(10), ['d7c6', 'e1g1', 'f7f6', 'd2d4', 'e5d4', 'f3d4', 'c6c5']]]),
  });
  assert.deepEqual(facts, []);
});

test('variante che finisce a metà di uno scambio: nessuna spiegazione sul materiale', () => {
  const ply = lastPly('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 *');
  const facts = explainMove({
    ply,
    classification: 'inaccuracy',
    before: pe([[cp(40), ['b5a4', 'g8f6', 'e1g1', 'f8e7', 'f1e1']]]),
    after: pe([[cp(10), ['d7c6', 'e1g1', 'f7f6', 'd2d4', 'e5d4']]]), // manca la ricattura
  });
  assert.deepEqual(facts, []);
});

test('Brilliant e Great: sacrificio e unica mossa', () => {
  const fen = '3rkb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR3R w k - 3 13';
  const ply = gameFromPgn(`[FEN "${fen}"]\n\n13. Rxd7 *`).plies[0];
  const brilliant = explainMove({
    ply,
    classification: 'brilliant',
    before: pe([[cp(510), ['d1d7']], [cp(300), ['b5d7']]]),
    after: pe([[cp(512), ['d8d7', 'h1d1', 'e7c5', 'g5f6']]]),
  });
  assert.equal(brilliant[0].kind, 'sacrifice');
  assert.equal(brilliant[0].amount, 2);

  const great = explainMove({
    ply,
    classification: 'great',
    before: pe([[cp(510), ['d1d7', 'd8d7']], [cp(150), ['b5d7', 'f6d7']]]),
    after: pe([[cp(512), ['d8d7']]]),
  });
  assert.equal(great[0].kind, 'onlyMove');
  assert.equal(formatExplanation(great[0]).text, 'Unica mossa buona: la seconda scelta del motore, Axd7+, vale +1.50 contro +5.10.');
});

test('le mosse buone non ricevono spiegazioni di errore', () => {
  const ply = lastPly('1. e4 e5 2. Ba6 *');
  const facts = explainMove({
    ply,
    classification: 'good',
    before: pe([[cp(30), ['g1f3']]]),
    after: pe([[cp(-300), ['b7a6', 'g1f3', 'g8f6', 'd2d4', 'e5d4']]]),
  });
  assert.deepEqual(facts, []);
});
