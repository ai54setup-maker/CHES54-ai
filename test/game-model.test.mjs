import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, withMoveAt, truncateGame, gameToPgn, gameFromPgn } from '../src/analysis/game-model.js';

test('partita costruita mossa per mossa, varianti e troncamento', () => {
  let g = createGame();
  g = withMoveAt(g, 0, 'e4');
  g = withMoveAt(g, 1, { from: 'e7', to: 'e5' });
  g = withMoveAt(g, 2, 'Nf3');
  assert.deepEqual(g.plies.map((p) => p.san), ['e4', 'e5', 'Nf3']);
  // Giocare dopo la seconda semimossa scarta il seguito
  const v = withMoveAt(g, 2, 'Bc4');
  assert.deepEqual(v.plies.map((p) => p.san), ['e4', 'e5', 'Bc4']);
  assert.deepEqual(g.plies.map((p) => p.san), ['e4', 'e5', 'Nf3'], 'la partita originale non cambia');
  assert.equal(withMoveAt(g, 3, 'e4'), null, 'mossa illegale');
  assert.equal(truncateGame(g, 1).plies.length, 1);
});

test('fine partita riconosciuta anche costruendo la partita', () => {
  let g = createGame();
  for (const [i, san] of ['f3', 'e5', 'g4', 'Qh4#'].entries()) g = withMoveAt(g, i, san);
  assert.equal(g.ending, 'checkmate');
  assert.equal(truncateGame(g, 3).ending, null);
});

test('PGN: andata e ritorno, anche da una FEN', () => {
  const src = '[White "A"]\n[Black "B"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
  const g = gameFromPgn(src);
  const back = gameFromPgn(gameToPgn(g));
  assert.deepEqual(back.plies.map((p) => p.uci), g.plies.map((p) => p.uci));
  assert.equal(back.headers.White, 'A');
  assert.equal(back.result, '0-1');

  const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
  const promo = withMoveAt(createGame(fen), 0, 'a8=Q+');
  const again = gameFromPgn(gameToPgn(promo));
  assert.equal(again.startFen, fen);
  assert.equal(again.plies[0].uci, 'a7a8q');
});
