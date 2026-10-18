import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AnalysisCache, positionKey } from '../src/engine/cache.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const result = (depth, multiPv, request = { depth, multiPv, movetimeMs: null }) => ({
  depth, multiPv, request, lines: Array.from({ length: multiPv }, (_, i) => ({ multipv: i + 1 })),
});

test('la chiave ignora i contatori di mossa', () => {
  assert.equal(positionKey(START), positionKey(START.replace(' 0 1', ' 7 42')));
  assert.notEqual(positionKey(START), positionKey(START.replace(' w ', ' b ')));
});

test('riusa solo risultati con profondità e linee sufficienti', () => {
  const c = new AnalysisCache(10);
  c.set(START, result(16, 3));
  assert.equal(c.get(START, { depth: 16, multiPv: 3, movetimeMs: null }).depth, 16);
  assert.equal(c.get(START, { depth: 12, multiPv: 1, movetimeMs: null }).lines.length, 1);
  assert.equal(c.get(START, { depth: 20, multiPv: 3, movetimeMs: null }), null, 'profondità insufficiente');
  assert.equal(c.get(START, { depth: 16, multiPv: 5, movetimeMs: null }), null, 'linee insufficienti');
});

test('ricerca fermata dal tempo: riusata per la stessa richiesta, non per una più esigente', () => {
  const c = new AnalysisCache(10);
  c.set(START, result(14, 3, { depth: 20, multiPv: 3, movetimeMs: 1000 }));
  assert.ok(c.get(START, { depth: 20, multiPv: 3, movetimeMs: 1000 }));
  assert.ok(c.get(START, { depth: 20, multiPv: 3, movetimeMs: 500 }));
  assert.equal(c.get(START, { depth: 20, multiPv: 3, movetimeMs: 3000 }), null);
  assert.equal(c.get(START, { depth: 20, multiPv: 3, movetimeMs: null }), null);
});

test('non sostituisce un risultato migliore con uno peggiore', () => {
  const c = new AnalysisCache(10);
  c.set(START, result(20, 3));
  c.set(START, result(12, 3));
  assert.equal(c.get(START, { depth: 12, multiPv: 3, movetimeMs: null }).depth, 20);
});

test('LRU: oltre il limite elimina la posizione usata meno di recente', () => {
  const c = new AnalysisCache(2);
  const fens = ['8/8/8/8/8/8/8/K6k w - - 0 1', '8/8/8/8/8/8/8/K5k1 w - - 0 1', '8/8/8/8/8/8/8/K4k2 w - - 0 1'];
  c.set(fens[0], result(10, 1));
  c.set(fens[1], result(10, 1));
  c.get(fens[0], { depth: 10, multiPv: 1, movetimeMs: null }); // fens[0] diventa recente
  c.set(fens[2], result(10, 1));
  assert.equal(c.size, 2);
  assert.ok(c.get(fens[0], { depth: 10, multiPv: 1, movetimeMs: null }));
  assert.equal(c.get(fens[1], { depth: 10, multiPv: 1, movetimeMs: null }), null);
});

test('modalità esatta: solo risultati con le stesse impostazioni', () => {
  const c = new AnalysisCache(10);
  c.set(START, result(20, 3));
  assert.ok(c.get(START, { depth: 14, multiPv: 2, movetimeMs: null }), 'normale: un risultato più profondo va bene');
  assert.equal(c.get(START, { depth: 14, multiPv: 2, movetimeMs: null }, { exact: true }), null);
  assert.ok(c.get(START, { depth: 20, multiPv: 3, movetimeMs: null }, { exact: true }));
});
