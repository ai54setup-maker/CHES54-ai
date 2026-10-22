// "I tuoi errori": estrazione dalla revisione, unione senza doppioni, ripasso a scatole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mistakesFromReview, mergeMistakes, reviewQueue, recordResult, isGoodAttempt, LEARNED_BOX } from '../src/analysis/my-mistakes.js';

const pe = (fen) => ({ fen, score: { cp: 0, mate: null }, winPct: 50, bestMove: 'e2e4', depth: 14, terminal: null, winner: null,
  lines: [{ multipv: 1, depth: 14, score: { cp: 0, mate: null }, pv: Array(20).fill('e2e4') }] });
const move = (color, uci, classification, i) => ({
  ply: { color, uci, san: uci, fenBefore: `fen${i}`, moveNumber: i, to: uci.slice(2), captured: undefined },
  classification, bestMove: classification === 'blunder' && i === 9 ? null : 'a2a3', bestSan: 'a3', winLoss: 20, before: pe(`fen${i}`),
});
const analysis = { settings: { depth: 14, multiPv: 2 }, moves: [
  move('w', 'e2e4', 'book', 1), move('b', 'g8f6', 'blunder', 2), move('w', 'd2d4', 'mistake', 3),
  move('b', 'f6e4', 'inaccuracy', 4), move('w', 'c2c3', 'best', 5), move('w', 'h2h3', 'blunder', 9),
] };

test('mistakesFromReview: solo Errori ed Errori gravi del colore scelto, con la mossa migliore', () => {
  const w = mistakesFromReview(analysis, 'w', 'A – B', 1000);
  assert.deepEqual(w.map((x) => x.played), ['d2d4']); // h2h3 non ha la mossa migliore
  const [x] = w;
  assert.equal(x.id, 'fen3|d2d4');
  assert.equal(x.best, 'a2a3');
  assert.equal(x.prevPly.uci, 'g8f6');
  assert.equal(x.before.lines[0].pv.length, 12); // ridotta per localStorage
  assert.equal(x.box, 0);
  assert.deepEqual(mistakesFromReview(analysis, 'b', '').map((m) => m.played), ['g8f6']);
});

test('mergeMistakes: niente doppioni; oltre il massimo escono prima gli imparati, poi i più vecchi', () => {
  const mk = (id, addedAt, box = 0) => ({ id, addedAt, box });
  let r = mergeMistakes([mk('a', 1)], [mk('a', 5), mk('b', 2)], 10);
  assert.deepEqual(r.list.map((x) => x.id), ['a', 'b']);
  assert.equal(r.added, 1);
  r = mergeMistakes([mk('old', 1), mk('learned', 5, LEARNED_BOX)], [mk('new', 9)], 2);
  assert.deepEqual(r.list.map((x) => x.id), ['old', 'new']);
  r = mergeMistakes([mk('old', 1), mk('mid', 5)], [mk('new', 9)], 2);
  assert.deepEqual(r.list.map((x) => x.id), ['mid', 'new']);
});

test('ripasso: coda ordinata, scatole, imparato', () => {
  const list = [{ id: 'x', box: 1, addedAt: 1 }, { id: 'y', box: 0, addedAt: 5 }, { id: 'z', box: LEARNED_BOX, addedAt: 0 }];
  assert.deepEqual(reviewQueue(list).map((x) => x.id), ['y', 'x']);
  let it = { id: 'q', box: 0, tries: 0 };
  for (let k = 0; k < LEARNED_BOX; k++) it = recordResult(it, true);
  assert.equal(it.box, LEARNED_BOX);
  assert.deepEqual(reviewQueue([it]), []);
  assert.equal(recordResult(it, false).box, 0);
  assert.equal(isGoodAttempt({ classification: 'excellent' }), true);
  assert.equal(isGoodAttempt({ classification: 'inaccuracy' }), false);
  assert.equal(isGoodAttempt(null), false);
});
