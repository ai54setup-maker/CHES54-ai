// Lezioni (fase G): controlli statici di ogni passo e corrispondenza con la verifica fatta con Stockfish
// (scripts/check-lessons.mjs scrive data/lessons/verified.json solo se tutti gli esercizi sono confermati).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { staticErrors, isCorrectLessonMove, opponentInCheck } from '../src/analysis/lesson.js';

const text = readFileSync(new URL('../data/lessons/lessons.json', import.meta.url), 'utf8');
const data = JSON.parse(text);

test('lessons.json: struttura, categorie e id', () => {
  const cats = new Set(data.categories.map((c) => c.id));
  assert.equal(new Set(data.lessons.map((l) => l.id)).size, data.lessons.length);
  for (const l of data.lessons) {
    assert.ok(cats.has(l.category), `${l.id}: categoria ${l.category}`);
    assert.ok(l.title && l.summary && l.steps.length, `${l.id}: incompleta`);
    assert.ok(l.steps.some((s) => s.kind === 'explain'), `${l.id}: nessuna spiegazione`);
  }
  for (const c of cats) assert.ok(data.lessons.some((l) => l.category === c), `categoria vuota: ${c}`);
});

test('ogni passo supera i controlli statici (legalità, scacco, matto, stallo, attacchi, inchiodature)', () => {
  for (const l of data.lessons) {
    for (const [i, s] of l.steps.entries()) assert.deepEqual(staticErrors(s), [], `${l.id} passo ${i + 1}`);
  }
});

test('la verifica con Stockfish corrisponde alla versione attuale di lessons.json', () => {
  const v = JSON.parse(readFileSync(new URL('../data/lessons/verified.json', import.meta.url), 'utf8'));
  const sha = createHash('sha256').update(text).digest('hex');
  assert.equal(v.sha256, sha, 'lessons.json è cambiato: rilancia npm run check:lessons');
});

test('controlli statici: posizione illegale, matto e inchiodatura dichiarati ma falsi', () => {
  // Donna in h1 che dà già scacco al re in a8 con il Bianco al tratto: chess.js la accetta, Stockfish no
  assert.equal(opponentInCheck('k7/8/1K6/8/8/8/8/7Q w - - 0 1'), true);
  assert.equal(opponentInCheck('k7/8/1K6/8/8/8/8/6Q1 w - - 0 1'), false);
  assert.match(staticErrors({ kind: 'explain', fen: 'k7/8/1K6/8/8/8/8/7Q w - - 0 1' }).join(), /illegale/);
  const step = { kind: 'explain', fen: '6k1/5pp1/7p/8/8/8/5PPP/3R2K1 w - - 0 1', demo: ['d1d8'] };
  assert.match(staticErrors({ ...step, check: { mate: true } }).join(), /matto/);
  assert.deepEqual(staticErrors({ ...step, check: { inCheck: true } }), []);
  const pin = { kind: 'explain', fen: '4k3/8/8/4q3/8/8/5PPP/R4K2 w - - 0 1' };
  assert.match(staticErrors({ ...pin, check: { pinned: 'e5' } }).join(), /inchiodato/); // prima di Te1 non lo è
  assert.deepEqual(staticErrors({ ...pin, demo: ['a1e1'], check: { pinned: 'e5' } }), []);
  assert.match(staticErrors({ kind: 'exercise', fen: pin.fen, solution: ['a1a2'], success: 'x', mate: true }).join(), /matto/);
});

test('isCorrectLessonMove: elenco di mosse accettate, oppure soluzione con matto alternativo', () => {
  const accept = { accept: ['g7g6', 'd8e7'] };
  assert.equal(isCorrectLessonMove(accept, '', 'g7g6'), true);
  assert.equal(isCorrectLessonMove(accept, '', 'g8f6'), false);
  const sol = { solution: ['g1g8'] };
  assert.equal(isCorrectLessonMove(sol, 'k7/8/1K6/8/8/8/8/6Q1 w - - 0 1', 'g1g8'), true);
  assert.equal(isCorrectLessonMove(sol, 'k7/8/1K6/8/8/8/8/6Q1 w - - 0 1', 'g1g7'), false);
});
