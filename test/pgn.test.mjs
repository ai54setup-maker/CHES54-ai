import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn, splitPgnGames, parseComment, PgnError } from '../src/analysis/pgn.js';
import { gameFromPgn } from '../src/analysis/game-model.js';

const CHESSCOM = `[Event "Live Chess"]
[Site "Chess.com"]
[White "alice"]
[Black "bob"]
[Result "0-1"]
[ECOUrl "https://www.chess.com/openings/Kings-Pawn-Opening"]

1. e4 {[%clk 0:09:58.5]} 1... e5 {[%clk 0:09:57]} 2. Qh5 {[%clk 0:09:50]} 2... Nc6 {[%clk 0:09:55]}
3. Bc4 {[%clk 0:09:45]} 3... g6 {[%clk 0:09:50]} 0-1`;

const LICHESS = `[Event "Rated Blitz game"]
[Site "https://lichess.org/abcdefgh"]
[White "a"]
[Black "b"]
[Result "1-0"]

1. e4 { [%eval 0.36] [%clk 0:03:00] } 1... c5?! { [%eval 0.5] } { Inaccuracy. Nf6 was best. } (1... e5 2. Nf3 { (commento con parentesi) } (2. f4 exf4)) 2. Nf3 $1 { [%eval 0.3] } 2... d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 1-0`;

test('Chess.com: intestazioni, orologio, risultato', () => {
  const p = parsePgn(CHESSCOM);
  assert.equal(p.headers.Site, 'Chess.com');
  assert.deepEqual(p.moves.map((m) => m.san), ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'g6']);
  assert.equal(p.moves[0].clock, 9 * 60 + 58.5);
  assert.equal(p.moves[0].comment, '');
  assert.equal(p.result, '0-1');
});

test('Lichess: commenti consecutivi, varianti annidate, NAG, annotazioni', () => {
  const p = parsePgn(LICHESS);
  assert.deepEqual(p.moves.map((m) => m.san), ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
  assert.equal(p.moves[1].comment, 'Inaccuracy. Nf6 was best.');
  assert.deepEqual(p.moves[2].nags, [1]);
  assert.equal(p.moves[0].clock, 180);
  const g = gameFromPgn(LICHESS);
  assert.equal(g.plies.length, 10);
  assert.equal(g.result, '1-0');
});

test('arrocco (anche con zeri), en passant, promozione', () => {
  const g = gameFromPgn('1. e4 Nf6 2. e5 d5 3. exd6 e6 4. Nf3 Be7 5. Bb5+ c6 6. 0-0 O-O *');
  assert.equal(g.plies[4].san, 'exd6');
  assert.equal(g.plies[4].uci, 'e5d6');
  assert.equal(g.plies[4].captured, 'p');
  assert.equal(g.plies[10].san, 'O-O');
  assert.equal(g.plies[10].uci, 'e1g1');
  const promo = gameFromPgn('[SetUp "1"]\n[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. a8=Q+ Kd7 *');
  assert.equal(promo.plies[0].uci, 'a7a8q');
  assert.equal(promo.plies[0].promotion, 'q');
  assert.equal(promo.startFen, '4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
});

test('partita che parte dal Nero (FEN) e partita incompleta', () => {
  const g = gameFromPgn('[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n\n1... e5 2. Nf3');
  assert.equal(g.plies[0].color, 'b');
  assert.equal(g.plies[0].moveNumber, 1);
  assert.equal(g.plies[1].moveNumber, 2);
  assert.equal(g.result, '*');
  assert.equal(g.ending, null);
});

test('fine partita riconosciuta con le regole', () => {
  assert.equal(gameFromPgn('1. f3 e5 2. g4 Qh4# 0-1').ending, 'checkmate');
  assert.equal(gameFromPgn('[FEN "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1"]\n\n1. Qf6 *').ending, null);
  assert.equal(gameFromPgn('[FEN "7k/8/5QK1/8/8/8/8/8 w - - 0 1"]\n\n1. Qf7 *').ending, 'stalemate');
});

test('risultato preso dall\'intestazione se manca nelle mosse', () => {
  assert.equal(parsePgn('[Result "1/2-1/2"]\n\n1. e4 e5').result, '1/2-1/2');
});

test('BOM, CRLF, commenti con ";" e righe "%"', () => {
  const p = parsePgn('﻿[White "x"]\r\n\r\n% riga ignorata\r\n1. d4 ; commento fino a fine riga\r\nd5 2. c4 *');
  assert.equal(p.headers.White, 'x');
  assert.deepEqual(p.moves.map((m) => m.san), ['d4', 'd5', 'c4']);
  assert.equal(p.moves[0].comment, 'commento fino a fine riga');
});

test('più partite nello stesso file', () => {
  const games = splitPgnGames(`${CHESSCOM}\n\n${LICHESS}\n`);
  assert.equal(games.length, 2);
  assert.equal(parsePgn(games[1]).headers.Site, 'https://lichess.org/abcdefgh');
});

test('errori chiari', () => {
  assert.throws(() => gameFromPgn('1. e4 e5 2. Ke3 *'), (e) => e instanceof PgnError && /2\. Ke3/.test(e.message));
  assert.throws(() => gameFromPgn('1. e4 e5 2... Nf6 *'), /2\.\.\. Nf6|2\. Nf6/);
  assert.throws(() => parsePgn('1. e4 (1. d4 d5 *'), PgnError);
  assert.throws(() => parsePgn('1. e4 { senza fine'), PgnError);
  assert.throws(() => parsePgn('1. e4 -- 2. d4'), PgnError);
});

test('comandi nei commenti', () => {
  assert.deepEqual(parseComment('[%clk 1:02:03] Bella mossa [%eval #-3]'), { comment: 'Bella mossa', clock: 3723 });
});

test('casi limite: promozioni, sottopromozione, arrocco lungo con scacco, notazioni alternative', () => {
  // Promozione con cattura e scacco, sottopromozione a cavallo
  const g = gameFromPgn('[FEN "r3k3/1P6/8/8/8/8/6p1/4K2R w K - 0 1"]\n\n1. bxa8=Q+ Ke7 2. Qb7+ Kf6 3. Rh6+ Kg5 4. Rh2 g1=N *');
  assert.deepEqual(g.plies.map((p) => p.uci), ['b7a8q', 'e8e7', 'a8b7', 'e7f6', 'h1h6', 'f6g5', 'h6h2', 'g2g1n']);
  // Arrocco lungo che dà scacco
  const ooo = gameFromPgn('[FEN "3k4/8/8/8/8/8/8/R3K3 w Q - 0 1"]\n\n1. O-O-O+ Ke7 *');
  assert.equal(ooo.plies[0].san, 'O-O-O+');
  assert.equal(ooo.plies[0].uci, 'e1c1');
  // En passant scritto con "e.p." e notazione lunga
  const ep = gameFromPgn('1. e4 Nf6 2. e5 d5 3. exd6 e.p. Ng8 4. Ng1-f3 *');
  assert.deepEqual(ep.plies.map((p) => p.san), ['e4', 'Nf6', 'e5', 'd5', 'exd6', 'Ng8', 'Nf3']);
});

test('casi limite: commento iniziale, varianti con numeri, NAG dopo varianti, risultato con commento', () => {
  const p = parsePgn('[Event "x"]\n\n{Partita di prova} 1. e4 (1. d4 d5 (1... Nf6) 2. c4) $14 1... e5 {Bianco abbandona} 0-1');
  assert.equal(p.preComment, 'Partita di prova');
  assert.deepEqual(p.moves.map((m) => m.san), ['e4', 'e5']);
  assert.deepEqual(p.moves[0].nags, [14]);
  assert.equal(p.moves[1].comment, 'Bianco abbandona');
  assert.equal(p.result, '0-1');
});

test('intestazioni con virgolette; partita senza mosse; varianti non supportate', () => {
  assert.equal(parsePgn('[White "O\\"Brien"]\n\n*').headers.White, 'O"Brien');
  assert.equal(gameFromPgn('[White "A"]\n\n*').plies.length, 0);
  assert.throws(() => gameFromPgn('[Variant "Chess960"]\n[FEN "bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9"]\n\n9. g3 *'), /Variante non supportata: Chess960/);
  assert.equal(gameFromPgn('[Variant "From Position"]\n[FEN "4k3/8/8/8/8/8/8/4K2R w K - 0 1"]\n\n1. O-O *').plies[0].uci, 'e1g1');
});
