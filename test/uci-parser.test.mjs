import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInfoLine, parseBestMoveLine, isCompleteLine } from '../src/engine/uci-parser.js';

test('riga info completa con MultiPV e centipawn', () => {
  const info = parseInfoLine('info depth 16 seldepth 22 multipv 2 score cp -34 nodes 123456 nps 900000 hashfull 120 time 137 pv e7e5 g1f3 b8c6');
  assert.deepEqual(info, {
    multipv: 2, depth: 16, seldepth: 22, nodes: 123456, timeMs: 137,
    score: { cp: -34, mate: null }, bound: null, pv: ['e7e5', 'g1f3', 'b8c6'],
  });
  assert.ok(isCompleteLine(info));
});

test('punteggio di matto, positivo e negativo', () => {
  assert.deepEqual(parseInfoLine('info depth 20 multipv 1 score mate 3 pv d1h5').score, { cp: null, mate: 3 });
  assert.deepEqual(parseInfoLine('info depth 20 multipv 1 score mate -5 pv e1e2').score, { cp: null, mate: -5 });
});

test('lowerbound/upperbound: valutazione parziale, non utilizzabile', () => {
  const lo = parseInfoLine('info depth 12 multipv 1 score cp 50 lowerbound nodes 10 pv e2e4');
  assert.equal(lo.bound, 'lower');
  assert.equal(lo.pv[0], 'e2e4');
  assert.equal(isCompleteLine(lo), false);
  assert.equal(parseInfoLine('info depth 12 score cp 50 upperbound pv e2e4').bound, 'upper');
});

test('multipv assente vale 1; campo wdl ignorato', () => {
  const info = parseInfoLine('info depth 8 score cp 20 wdl 400 500 100 pv d2d4');
  assert.equal(info.multipv, 1);
  assert.deepEqual(info.pv, ['d2d4']);
});

test('righe senza pv o non-info', () => {
  assert.equal(isCompleteLine(parseInfoLine('info depth 0 score mate 0')), false);
  assert.equal(isCompleteLine(parseInfoLine('info depth 5 currmove e2e4 currmovenumber 1')), false);
  assert.equal(parseInfoLine('info string NNUE evaluation using nn-9067e33176e8.nnue'), null);
  assert.equal(parseInfoLine('readyok'), null);
});

test('bestmove', () => {
  assert.deepEqual(parseBestMoveLine('bestmove e2e4 ponder e7e5'), { bestMove: 'e2e4', ponder: 'e7e5' });
  assert.deepEqual(parseBestMoveLine('bestmove e7e8q'), { bestMove: 'e7e8q', ponder: null });
  assert.deepEqual(parseBestMoveLine('bestmove (none)'), { bestMove: null, ponder: null });
  assert.equal(parseBestMoveLine('info depth 1'), null);
});
