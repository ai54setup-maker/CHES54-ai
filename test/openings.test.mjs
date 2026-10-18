import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OpeningBook } from '../src/analysis/openings.js';
import { gameFromPgn } from '../src/analysis/game-model.js';

const book = new OpeningBook(JSON.parse(readFileSync(new URL('../data/openings/openings.json', import.meta.url), 'utf8')));
const fens = (pgn) => gameFromPgn(pgn).plies.map((p) => p.fenAfter);

test('Partita spagnola: nome, ECO e mosse di teoria', () => {
  const { opening, bookPlies } = book.identify(fens('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O h5 *'));
  assert.equal(opening.eco, 'C78');
  assert.match(opening.name, /^Ruy Lopez/);
  assert.equal(bookPlies, 9); // fino a 5.O-O è teoria, 5...h5 no
});

test('le mosse dopo l\'uscita dalla teoria non tornano "Book" per trasposizione', () => {
  // 1.Nf3 d5 2.d4 è teoria; 2...h6 no; 3.c4 porterebbe a posizioni con nome ma non conta per Book
  const { bookPlies } = book.identify(fens('1. Nf3 d5 2. d4 h6 3. c4 *'));
  assert.equal(bookPlies, 3);
});

test('trasposizione: il nome si riconosce anche con un altro ordine di mosse', () => {
  const a = book.identify(fens('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 *')).opening;
  const b = book.identify(fens('1. c4 e6 2. Nc3 Nf6 3. d4 Bb4 *')).opening;
  assert.equal(a.eco, 'E20');
  assert.deepEqual([b.eco, b.name], [a.eco, a.name]);
});

test('posizione fuori dal dataset', () => {
  const { opening, bookPlies } = book.identify(fens('[FEN "4k3/8/8/8/8/8/8/4K2R w K - 0 1"]\n\n1. Rh8+ *'));
  assert.equal(opening, null);
  assert.equal(bookPlies, 0);
});
