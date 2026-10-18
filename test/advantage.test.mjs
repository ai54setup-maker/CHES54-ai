import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advantageOf, turningPoint } from '../src/analysis/advantage.js';
import { analyzeLine } from '../src/analysis/game-analyzer.js';
import { gameFromPgn } from '../src/analysis/game-model.js';
import { winPercent } from '../src/analysis/winpct.js';

/** Valutazione finta di una posizione: punteggio dal punto di vista del Bianco. */
const pe = (fen, cp, mate = null, bestMove = null) => {
  const score = { cp: mate == null ? cp : null, mate };
  return { fen, score, terminal: null, winner: null, winPct: winPercent(score), lines: [{ multipv: 1, depth: 10, score, pv: bestMove ? [bestMove] : [] }], bestMove, depth: 10 };
};

test('chi sta meglio: livelli in base alla win%', () => {
  assert.deepEqual(advantageOf(pe('x', 10)).level, 'equal');
  assert.equal(advantageOf(pe('x', 10)).side, null);
  const slight = advantageOf(pe('x', 60)); // win% ≈ 55,5
  assert.deepEqual([slight.side, slight.level], ['w', 'slight']);
  assert.equal(advantageOf(pe('x', -200)).level, 'clear'); // win% ≈ 32
  assert.equal(advantageOf(pe('x', -200)).side, 'b');
  assert.equal(advantageOf(pe('x', 900)).level, 'decisive');
  const m = advantageOf(pe('x', null, -3));
  assert.deepEqual([m.side, m.level, m.mate], ['b', 'mate', -3]);
  assert.equal(advantageOf({ terminal: 'checkmate', winner: 'w', winPct: 100 }).level, 'checkmate');
  assert.equal(advantageOf({ terminal: 'draw', winPct: 50 }).level, 'draw');
});

// 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#: valutazioni costruite a mano, per provare la logica
// (le valutazioni vere vengono da Stockfish).
const game = gameFromPgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
const fens = [game.startFen, ...game.plies.map((p) => p.fenAfter)];
const cps = [20, 30, 25, 10, 20, 30];
const best = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g7g6'];
const evals = new Map(fens.slice(0, 6).map((f, i) => [f, pe(f, cps[i], null, best[i])]));
evals.set(fens[6], pe(fens[6], null, 1, 'h5f7')); // dopo 3...Cf6: matto in 1 per il Bianco

test('analyzeLine: usa le valutazioni pronte, matto finale con le regole, mosse senza dati = null', () => {
  const r = analyzeLine(game, (f) => evals.get(f));
  assert.equal(r.positions.length, 8);
  assert.equal(r.positions[7].terminal, 'checkmate');
  assert.equal(r.moves[5].classification, 'blunder'); // 3...Cf6: da +0,30 a matto in 1
  assert.equal(r.moves[6].classification, 'best'); //    4.Dxf7#
  const partial = analyzeLine(game, (f) => (f === fens[3] ? null : evals.get(f)));
  assert.equal(partial.positions[3], null);
  assert.equal(partial.moves[2], null);
  assert.equal(partial.moves[3], null);
  assert.ok(partial.moves[4]);
});

test('dove il Nero ha iniziato a perdere vantaggio: il suo primo errore dopo il massimo', () => {
  const r = analyzeLine(game, (f) => evals.get(f));
  const tp = turningPoint(r.positions, r.moves, 'b');
  assert.equal(tp.moveIndex, 5); // 3...Cf6
  assert.ok(tp.peakWin - tp.nowWin >= 10);
  assert.equal(turningPoint(r.positions, r.moves, 'w'), null); // il Bianco non ha perso vantaggio
});

test('nessun punto di svolta se il calo è piccolo o dipende solo dall\'avversario', () => {
  const small = [pe('a', 0), pe('b', -20), pe('c', -40)];
  assert.equal(turningPoint(small, [null, null], 'w'), null);
  const p = [pe('a', 0), pe('b', 0), pe('c', -400)];
  const moves = [{ ply: { index: 0, color: 'w' }, classification: 'best', winLoss: 0 }, { ply: { index: 1, color: 'b' }, classification: 'best', winLoss: 0 }];
  assert.equal(turningPoint(p, moves, 'b'), null); // il Nero è salito, non sceso
  assert.equal(turningPoint(p, moves, 'w').moveIndex, 0); // nessun errore: la mossa che ha perso di più
});

test('analyzeLine con memoria: stesso risultato, e una valutazione nuova viene usata', () => {
  const memo = new Map();
  const plain = analyzeLine(game, (f) => evals.get(f));
  const first = analyzeLine(game, (f) => evals.get(f), null, memo);
  assert.deepEqual(first.moves.map((m) => m?.classification), plain.moves.map((m) => m?.classification));
  // La posizione dopo 3.Ac4 riceve una valutazione diversa: la mossa 3.Ac4 va ricalcolata
  const changed = new Map(evals);
  changed.set(fens[5], pe(fens[5], -900, null, 'g7g6'));
  const again = analyzeLine(game, (f) => changed.get(f), null, memo);
  assert.equal(again.moves[4].classification, 'blunder');
  assert.equal(again.moves[3], first.moves[3]); // invariata: stesso oggetto dalla memoria
});
