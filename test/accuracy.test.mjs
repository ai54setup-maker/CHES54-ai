import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveAccuracy, gameAccuracy, meanAccuracy } from '../src/analysis/accuracy.js';
import { winPercentFromCp } from '../src/analysis/winpct.js';

const close = (actual, expected, delta) =>
  assert.ok(Math.abs(actual - expected) <= delta, `atteso ${expected} ± ${delta}, ottenuto ${actual}`);

test('precisione di una mossa', () => {
  assert.equal(moveAccuracy(60, 60), 100);
  assert.equal(moveAccuracy(60, 70), 100);
  // 103.1668 * e^(-0.0435441 * 10) - 3.1669 + 1 ≈ 64.58
  close(moveAccuracy(60, 50), 64.58, 0.01);
  assert.equal(moveAccuracy(100, 0), 0);
  // Perdita minima: il bonus +1 di Lichess porta comunque al limite di 100
  assert.equal(moveAccuracy(50, 49.99), 100);
});

test('media semplice', () => {
  assert.equal(meanAccuracy([]), null);
  assert.equal(meanAccuracy([100, 50]), 75);
});

// Stessi casi dei test di Lichess (lila: modules/analyse/src/test/AccuracyPercentTest.scala):
// la partita parte da +15 cp e cps sono le valutazioni (Bianco) dopo ogni semimossa.
const compute = (cps, start = 'w') => gameAccuracy([15, ...cps].map(winPercentFromCp), start);

test('Lichess: casi base', () => {
  assert.deepEqual(compute([]), { w: null, b: null });
  const one = compute([15]);
  assert.equal(one.b, null); // il Nero non ha mosse
  const a = compute([15, 15]);
  close(a.w, 100, 1);
  close(a.b, 100, 1);
});

test('Lichess: errori grossolani alla prima mossa', () => {
  let a = compute([-900, -900]);
  close(a.w, 10, 5);
  close(a.b, 100, 1);
  a = compute([15, 900]);
  close(a.w, 100, 1);
  close(a.b, 10, 5);
  a = compute([-900, 0]);
  close(a.w, 10, 5);
  close(a.b, 10, 5);
});

test('Lichess: partite più lunghe', () => {
  let a = compute(Array(20).fill(15));
  close(a.w, 100, 1);
  close(a.b, 100, 1);
  a = compute([...Array(20).fill(15), -900]);
  close(a.w, 50, 5);
  close(a.b, 100, 1);
  a = compute([...Array(21).fill(15), 900]);
  close(a.w, 100, 1);
  close(a.b, 50, 5);
  for (const [n, cp, expected] of [[5, -50, 76], [50, -50, 76], [50, -135, 54], [50, -435, 20]]) {
    a = compute(Array.from({ length: n }, () => [cp, 15]).flat());
    close(a.w, expected, 8);
    close(a.b, expected, 8);
  }
});

test('Lichess: partita che inizia col Nero', () => {
  let a = compute([15, 15], 'b');
  close(a.b, 100, 1);
  close(a.w, 100, 1);
  a = compute([900, 900], 'b');
  close(a.b, 10, 5);
  close(a.w, 100, 1);
  a = compute([15, -900], 'b');
  close(a.b, 100, 1);
  close(a.w, 10, 5);
});
