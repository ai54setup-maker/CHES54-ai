// Gioca contro Stockfish: fine partita con le regole e PGN per la revisione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../lib/chess.js';
import { outcomeOf, replay, playPgn } from '../src/analysis/play.js';
import { gameFromPgn } from '../src/analysis/game-model.js';

test('outcomeOf: matto, stallo, materiale insufficiente, triplice ripetizione, partita in corso', () => {
  assert.deepEqual(outcomeOf(replay(['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'])), { result: '1-0', reason: 'checkmate' });
  assert.deepEqual(outcomeOf(new Chess('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1')), { result: '1/2-1/2', reason: 'stalemate' });
  assert.deepEqual(outcomeOf(new Chess('k7/8/1K6/8/8/8/8/8 w - - 0 1')), { result: '1/2-1/2', reason: 'insufficient' });
  const rep = replay(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
  assert.deepEqual(outcomeOf(rep), { result: '1/2-1/2', reason: 'threefold' });
  assert.equal(outcomeOf(replay(['e2e4'])), null);
  assert.equal(replay(['e2e5']), null); // mossa illegale
});

test('playPgn: intestazioni (tu / Stockfish), si rilegge con il parser dell\'app', () => {
  const pgn = playPgn({ moves: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'], color: 'w', level: 3, date: '2026-10-22', result: '1-0' });
  const g = gameFromPgn(pgn);
  assert.equal(g.headers.White, 'Tu');
  assert.equal(g.headers.Black, 'Stockfish (livello 3)');
  assert.equal(g.headers.Date, '2026.10.22');
  assert.equal(g.plies.length, 7);
  assert.equal(g.result, '1-0');
  const resigned = gameFromPgn(playPgn({ moves: ['d2d4'], color: 'b', level: 8, date: '2026-10-22', result: '1-0', termination: 'Nero abbandona' }));
  assert.equal(resigned.headers.White, 'Stockfish (livello 8)');
  assert.equal(resigned.headers.Termination, 'Nero abbandona');
});
