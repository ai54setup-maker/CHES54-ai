import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWhitePov, toPov, formatScore } from '../src/engine/score.js';
import { winPercent, winPercentFromCp } from '../src/analysis/winpct.js';

test('centipawn: col Bianco al tratto restano uguali, col Nero cambiano segno', () => {
  assert.deepEqual(toWhitePov({ cp: 40, mate: null }, 'w'), { cp: 40, mate: null });
  assert.deepEqual(toWhitePov({ cp: 40, mate: null }, 'b'), { cp: -40, mate: null });
  assert.deepEqual(toWhitePov({ cp: -120, mate: null }, 'b'), { cp: 120, mate: null });
});

test('niente "-0"', () => {
  assert.ok(Object.is(toWhitePov({ cp: 0, mate: null }, 'b').cp, 0));
  assert.equal(formatScore(toWhitePov({ cp: 0, mate: null }, 'b')), '0.00');
});

test('matto: separato dai centipawn, segno dal punto di vista del Bianco', () => {
  // Il Nero muove e dà matto in 2 → per il Bianco è -M2
  assert.deepEqual(toWhitePov({ cp: null, mate: 2 }, 'b'), { cp: null, mate: -2 });
  // Il Nero muove e subisce matto in 3 → per il Bianco è M3
  assert.deepEqual(toWhitePov({ cp: null, mate: -3 }, 'b'), { cp: null, mate: 3 });
  assert.throws(() => toWhitePov({ cp: null, mate: 0 }, 'w'), RangeError);
});

test('toPov: dal Bianco al colore scelto', () => {
  assert.deepEqual(toPov({ cp: 75, mate: null }, 'b'), { cp: -75, mate: null });
  assert.deepEqual(toPov({ cp: null, mate: -4 }, 'b'), { cp: null, mate: 4 });
  assert.deepEqual(toPov({ cp: 75, mate: null }, 'w'), { cp: 75, mate: null });
});

test('formatScore', () => {
  assert.equal(formatScore({ cp: 35, mate: null }), '+0.35');
  assert.equal(formatScore({ cp: -120, mate: null }), '-1.20');
  assert.equal(formatScore({ cp: null, mate: 3 }), 'M3');
  assert.equal(formatScore({ cp: null, mate: -5 }), '-M5');
});

test('win% (formula di Lichess)', () => {
  assert.equal(winPercentFromCp(0), 50);
  // Valore di riferimento calcolato a mano: 50 + 50 * (2 / (1 + e^(-0.368208)) - 1) ≈ 59.10
  assert.ok(Math.abs(winPercentFromCp(100) - 59.10) < 0.01);
  // Simmetria: win%(cp) + win%(-cp) = 100
  for (const cp of [37, 250, 900]) assert.ok(Math.abs(winPercentFromCp(cp) + winPercentFromCp(-cp) - 100) < 1e-9);
  // Lichess: cp limitati a ±1000; un matto vale come ±1000 cp
  assert.equal(winPercentFromCp(5000), winPercentFromCp(1000));
  assert.ok(Math.abs(winPercent({ cp: null, mate: 4 }) - 97.54) < 0.01);
  assert.ok(Math.abs(winPercent({ cp: null, mate: -1 }) - 2.46) < 0.01);
});
