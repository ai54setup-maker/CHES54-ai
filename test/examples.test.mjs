// Libreria di partite (data/examples/): ogni partita dell'indice deve essere legale, coerente con
// il risultato e con i dati mostrati nella finestra (mosse, apertura, mosse citate nella descrizione).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gameFromPgn } from '../src/analysis/game-model.js';
import { OpeningBook } from '../src/analysis/openings.js';
import { UI_CONFIG } from '../src/config/ui.js';
import { checkGame, compareGames, categoriesOf, fullMoves } from '../scripts/lib/examples.mjs';

const read = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const index = JSON.parse(read('examples/index.json'));
const catalog = JSON.parse(read('examples/catalog.json'));
const sources = read('examples/SOURCES.md');
const book = new OpeningBook(JSON.parse(read('openings/openings.json')));
const categoryIds = UI_CONFIG.examples.categories.map((c) => c.id);

test('la libreria ha abbastanza partite, di cui almeno 5 di Magnus Carlsen', () => {
  assert.ok(index.games.length >= 20, `solo ${index.games.length} partite`);
  assert.ok(index.games.filter((g) => g.categories.includes('carlsen')).length >= 5);
  const ids = new Set(index.games.map((g) => g.id));
  for (const id of ['morphy-opera-1858', 'anderssen-kieseritzky-1851', 'anderssen-dufresne-1852',
    'kasparov-topalov-1999', 'deepblue-kasparov-1997-6']) assert.ok(ids.has(id), `manca ${id}`);
  assert.equal(ids.size, index.games.length, 'id duplicati');
});

for (const entry of index.games) {
  test(`partita ${entry.id}: legale, risultato e dati dell'indice corretti`, () => {
    const game = gameFromPgn(read(`examples/${entry.pgn}`)); // lancia un errore se una mossa non è legale
    const cat = catalog.games.find((c) => c.id === entry.id);
    assert.ok(cat, 'la partita non è nel catalogo');
    assert.deepEqual(checkGame(game, cat), []);
    assert.equal(game.result, entry.result);
    assert.equal(game.plies.length, entry.plies);
    assert.equal(fullMoves(game), entry.moves);
    const { opening } = book.identify(game.plies.map((p) => p.fenAfter));
    assert.deepEqual(entry.opening, opening ? { eco: opening.eco, name: opening.name } : null);
    assert.deepEqual(entry.categories, categoriesOf(game, cat.categories, UI_CONFIG.examples.miniatureMaxMoves));
    for (const c of entry.categories) assert.ok(categoryIds.includes(c), `categoria sconosciuta: ${c}`);
    assert.ok(sources.includes(`\`${entry.id}\``), 'fonte non documentata in SOURCES.md');
  });
}

test('ogni voce del catalogo è inclusa oppure esclusa con il motivo; nessun PGN orfano', () => {
  const included = new Set(index.games.map((g) => g.id));
  for (const c of catalog.games) {
    assert.ok(included.has(c.id) || sources.includes(`**${c.white} – ${c.black}, ${c.year}**`), `${c.id}: né inclusa né esclusa`);
  }
  const files = readdirSync(new URL('../data/examples/games/', import.meta.url));
  assert.deepEqual(files.sort(), index.games.map((g) => g.pgn.slice('games/'.length)).sort());
});

test('confronto tra fonti: le trasposizioni contano come differenza', () => {
  const a = gameFromPgn('1. e4 e6 2. d4 d5 *');
  const b = gameFromPgn('1. d4 e6 2. e4 d5 *');
  assert.match(compareGames(a, b).diff, /mossa 1\./);
  assert.deepEqual(compareGames(a, gameFromPgn('1. e4 e6 2. d4 d5 *')), { diff: null, note: null });
});

test('confronto tra fonti: mossa in più accettata solo se scritta nel commento finale', () => {
  const full = gameFromPgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  const announced = gameFromPgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 {Il Bianco matta: 4.Qxf7#} 1-0');
  const silent = gameFromPgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 1-0');
  assert.equal(compareGames(full, announced).diff, null);
  assert.match(compareGames(full, announced).note, /Qxf7#/);
  assert.match(compareGames(full, silent).diff, /semimosse 7 \/ 6/);
});

test('controlli sul risultato e sulle mosse citate', () => {
  const mate = gameFromPgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 0-1');
  assert.match(checkGame(mate).join(), /matto dato da Bianco/);
  const ok = gameFromPgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  assert.deepEqual(checkGame(ok, { mentions: ['4.Qxf7#'] }), []);
  assert.match(checkGame(ok, { mentions: ['3...Qxf7#'] }).join(), /cita 3\.\.\.Qxf7#/);
  assert.match(checkGame(gameFromPgn('1. e4 e5 *')).join(), /risultato non valido/);
});
