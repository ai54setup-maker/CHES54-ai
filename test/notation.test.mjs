import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../lib/chess.js';
import { parseUserMove, toItalian, uciLineToSan, numberedLine } from '../src/ui/notation.js';

test('mosse scritte dall\'utente in italiano, inglese e coordinate', () => {
  const c = new Chess();
  for (const [txt, san] of [['d3', 'd3'], ['e5', 'e5'], ['Cf3', 'Nf3'], ['Cc6', 'Nc6'], ['g2g3', 'g3'], ['f8-c5', 'Bc5'], ['Ag2', 'Bg2'], ['d6', 'd6'], ['0-0', 'O-O']]) {
    const m = parseUserMove(c, txt);
    assert.ok(m, `non riconosciuta: ${txt}`);
    assert.equal(c.move(m).san, san, txt);
  }
  assert.equal(parseUserMove(new Chess(), 'e5'), null, 'il bianco non può giocare e5');
});

test('notazione italiana', () => {
  assert.equal(toItalian('exd8=Q+'), 'exd8=D+');
  assert.deepEqual(uciLineToSan(new Chess().fen(), ['g1f3', 'b8c6']), ['Cf3', 'Cc6']);
});

test('linea numerata', () => {
  const start = new Chess().fen();
  assert.equal(numberedLine(start, ['e2e4', 'e7e5', 'g1f3']), '1. e4 e5 2. Cf3');
  const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  assert.equal(numberedLine(afterE4, ['e7e5', 'g1f3', 'b8c6']), '1… e5 2. Cf3 Cc6');
  assert.equal(numberedLine(start, ['e2e4', 'e7e5', 'g1f3'], 2), '1. e4 e5');
});
