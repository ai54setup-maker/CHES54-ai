// Import da Lichess e Chess.com: nomi utente, indirizzi, lettura delle risposte (senza rete).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUser, SOURCES, recentArchives, chessComPgns, pgnHeaders, timeControlLabel, summarize, lichessPgns } from '../src/analysis/online-games.js';

const PGN1 = '[Event "Rated blitz game"]\n[White "Mario_77"]\n[Black "anna"]\n[Result "0-1"]\n[UTCDate "2026.10.20"]\n[WhiteElo "1500"]\n[BlackElo "1520"]\n[TimeControl "180+2"]\n[Opening "Sicilian Defense"]\n[Site "https://lichess.org/abc"]\n\n1. e4 c5 0-1\n';
const PGN2 = '[Event "Live Chess"]\n[White "anna"]\n[Black "Mario_77"]\n[Result "1/2-1/2"]\n[Date "2026.10.19"]\n[TimeControl "600"]\n[Link "https://www.chess.com/game/live/1"]\n\n1. d4 d5 1/2-1/2\n';

test('normalizeUser: solo nomi validi (niente caratteri che cambiano l\'indirizzo)', () => {
  assert.equal(normalizeUser('  Mario_77 '), 'Mario_77');
  assert.equal(normalizeUser('a-b'), 'a-b');
  for (const bad of ['', 'a', '../admin', 'x?max=999', 'nome con spazi', 'é', 'x'.repeat(31)]) assert.equal(normalizeUser(bad), null, bad);
});

test('indirizzi delle API', () => {
  assert.equal(SOURCES.lichess.gamesUrl('Mario_77', 20), 'https://lichess.org/api/games/user/Mario_77?max=20&clocks=false&evals=false&opening=true');
  assert.equal(SOURCES.chesscom.archivesUrl('Hikaru'), 'https://api.chess.com/pub/player/hikaru/games/archives');
});

test('Chess.com: archivi recenti e partite (solo scacchi standard, dalla più recente)', () => {
  const a = ['https://api.chess.com/pub/player/x/games/2026/08', 'https://api.chess.com/pub/player/x/games/2026/09', 'https://api.chess.com/pub/player/x/games/2026/10', 'https://evil.example/2026/11'];
  assert.deepEqual(recentArchives(a, 2), [a[2], a[1]]);
  const month = { games: [
    { rules: 'chess', pgn: 'A', end_time: 1 }, { rules: 'chess960', pgn: 'X', end_time: 9 }, { rules: 'chess', pgn: 'B', end_time: 5 },
  ] };
  assert.deepEqual(chessComPgns(month), ['B', 'A']);
  assert.deepEqual(chessComPgns(null), []);
});

test('riassunto: giocatori, colore dell\'utente, cadenza, data', () => {
  const [g1, g2] = summarize([PGN1, PGN2], 'mario_77');
  assert.equal(g1.white, 'Mario_77');
  assert.equal(g1.color, 'w');
  assert.equal(g1.result, '0-1');
  assert.equal(g1.timeControl, '3+2');
  assert.equal(g1.date, '2026-10-20');
  assert.equal(g1.opening, 'Sicilian Defense');
  assert.equal(g2.color, 'b');
  assert.equal(g2.timeControl, '10 min');
  assert.equal(g2.url, 'https://www.chess.com/game/live/1');
  assert.deepEqual(pgnHeaders('[White "a \\"b\\""]').White, 'a "b"');
  assert.equal(timeControlLabel('1/86400'), '1 giorno a mossa');
  assert.equal(timeControlLabel('90+0'), '1,5 min');
  assert.equal(timeControlLabel('-'), '');
});

test('Lichess: più partite nello stesso testo', () => {
  assert.equal(lichessPgns(PGN1 + '\n\n' + PGN1).length, 2);
});
