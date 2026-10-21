// Problemi (fase F): regole di verifica e di risoluzione, integrità di data/puzzles/puzzles.json
// e una nuova verifica di alcuni problemi con il vero Stockfish.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from '../lib/chess.js';
import { Engine } from '../src/engine/engine.js';
import { nodeTransport } from '../src/engine/node-transport.js';
import { ANALYSIS_CONFIG } from '../src/config/analysis.js';
import { UI_CONFIG } from '../src/config/ui.js';
import {
  parsePuzzleRow, puzzleStart, playUci, isCorrectAttempt, verifySolverMove, verifyReply, primaryTheme, levelOf,
} from '../src/analysis/puzzle.js';

const data = JSON.parse(readFileSync(new URL('../data/puzzles/puzzles.json', import.meta.url), 'utf8'));
const line = (move, score) => ({ pv: [move], score });
const cp = (v) => ({ cp: v, mate: null });
const mate = (n) => ({ cp: null, mate: n });

test('parsePuzzleRow: riga del CSV di Lichess, intestazione e righe rotte', () => {
  const p = parsePuzzleRow('0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f8d8 d6d8 f6d8,1529,74,96,37506,advantage endgame short,https://lichess.org/F8M8OS71#53,,');
  assert.equal(p.id, '0000D');
  assert.deepEqual(p.moves, ['d3d6', 'f8d8', 'd6d8', 'f6d8']);
  assert.equal(p.rating, 1529);
  assert.deepEqual(p.themes, ['advantage', 'endgame', 'short']);
  assert.equal(parsePuzzleRow('PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags'), null);
  assert.equal(parsePuzzleRow('x,y'), null);
});

test('puzzleStart: la prima mossa è dell\'avversario', () => {
  const s = puzzleStart({ fen: '5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27', moves: ['d3d6', 'f8d8', 'd6d8', 'f6d8'] });
  assert.equal(s.color, 'b');
  assert.deepEqual(s.lastMove, { from: 'd3', to: 'd6' });
  assert.deepEqual(s.solution, ['f8d8', 'd6d8', 'f6d8']);
});

test('isCorrectAttempt: soluzione unica, ma all\'ultima mossa vale qualsiasi matto', () => {
  // Due matti in 1: Ta8# e Tb8# (re nero in h8 chiuso dai suoi pedoni)
  const fen = '7k/6pp/8/8/8/8/8/R5RK w - - 0 1';
  assert.equal(isCorrectAttempt(fen, 'a1a8', 'a1a8', true), true);
  assert.equal(isCorrectAttempt(fen, 'a1a8', 'g1g8', false), false); // non è l'ultima mossa: serve quella della soluzione
  assert.equal(isCorrectAttempt('7k/6pp/8/8/8/8/8/R6K w - - 0 1', 'a1a8', 'a1a7', true), false);
  assert.equal(isCorrectAttempt('7k/6pp/8/8/8/8/1R6/R6K w - - 0 1', 'a1a8', 'b2b8', true), true);
});

test('verifySolverMove: prima scelta, unicità, matti', () => {
  const fen = '7k/6pp/8/8/8/8/8/R3Q2K w - - 0 1'; // tocca al Bianco
  const r = (...lines) => ({ lines });
  assert.equal(verifySolverMove(r(line('e1e5', cp(300)), line('a1a8', mate(1))), fen, 'a1a8', false).ok, false); // non è la prima
  assert.equal(verifySolverMove(r(line('e1e5', cp(500)), line('e1e4', cp(450))), fen, 'e1e5', false).ok, false); // non unica
  assert.equal(verifySolverMove(r(line('e1e5', cp(500)), line('e1e4', cp(20))), fen, 'e1e5', false).ok, true);
  assert.equal(verifySolverMove(r(line('e1e5', mate(2)), line('e1e4', mate(2))), fen, 'e1e5', false).ok, false); // matto altrettanto veloce
  assert.equal(verifySolverMove(r(line('e1e5', mate(2)), line('e1e4', mate(4))), fen, 'e1e5', false).ok, true); //  matto più lento: va bene
  assert.equal(verifySolverMove(r(line('e1e5', cp(500))), fen, 'e1e5', false).ok, true); // nessuna seconda linea
  assert.equal(verifySolverMove(r(line('e1e8', mate(1)), line('a1a8', mate(1))), fen, 'a1a8', true).ok, true); // ultima mossa: matto
  assert.equal(verifySolverMove(r(), fen, 'a1a8', false).ok, false);
  // Dal punto di vista del Nero: +5 per il Bianco è una brutta notizia per chi muove
  const fenB = '7k/6pp/8/8/8/8/8/R3Q2K b - - 0 1';
  assert.equal(verifySolverMove(r(line('h8g8', cp(-100)), line('h7h6', cp(500))), fenB, 'h8g8', false).ok, true);
});

test('verifyReply: risposta migliore o quasi', () => {
  const fen = '7k/6pp/8/8/8/8/8/R3Q2K b - - 0 1';
  const r = { lines: [line('h7h6', cp(200)), line('g7g6', cp(215)), line('h8g8', cp(600))] };
  assert.equal(verifyReply(r, fen, 'h7h6').ok, true);
  assert.equal(verifyReply(r, fen, 'g7g6').ok, true); // 15 cp in meno per il Nero: < 3 punti di win%
  assert.equal(verifyReply(r, fen, 'h8g8').ok, false);
  assert.equal(verifyReply(r, fen, 'g7g5').ok, false); // non tra le linee del motore
});

test('primaryTheme e levelOf', () => {
  const ids = UI_CONFIG.puzzles.themes.map((t) => t.id);
  assert.equal(primaryTheme(['short', 'fork', 'mateIn2'], ids), 'mateIn2');
  assert.equal(primaryTheme(['short', 'crushing'], ids), null);
  const levels = UI_CONFIG.puzzles.levels;
  assert.equal(levelOf(1299, levels), 'easy');
  assert.equal(levelOf(1300, levels), 'medium');
  assert.equal(levelOf(2500, levels), 'expert');
});

test('puzzles.json: problemi legali, completi, senza doppioni', () => {
  const themes = new Set(UI_CONFIG.puzzles.themes.map((t) => t.id));
  const levels = UI_CONFIG.puzzles.levels;
  assert.ok(data.puzzles.length >= 300, `solo ${data.puzzles.length} problemi`);
  assert.equal(new Set(data.puzzles.map((p) => p.id)).size, data.puzzles.length);
  for (const p of data.puzzles) {
    assert.ok(themes.has(p.theme), `${p.id}: tema ${p.theme}`);
    assert.equal(levelOf(p.rating, levels), p.level, `${p.id}: livello`);
    assert.ok(p.eval && (p.eval.cp != null || p.eval.mate != null), `${p.id}: manca la valutazione`);
    const moves = p.moves.split(' ');
    assert.ok(moves.length >= 2 && moves.length % 2 === 0, `${p.id}: la soluzione finisce con una mossa di chi risolve`);
    const c = new Chess(p.fen);
    for (const m of moves) assert.ok(playUci(c, m), `${p.id}: ${m} illegale`);
    if (p.theme.startsWith('mateIn')) assert.ok(c.isCheckmate(), `${p.id}: il problema di matto non finisce con il matto`);
  }
  for (const t of themes) assert.ok(data.puzzles.some((p) => p.theme === t), `nessun problema per ${t}`);
});

test('verifica ripetuta con Stockfish su alcuni problemi', async () => {
  const engine = new Engine(nodeTransport(fileURLToPath(new URL('../engine/stockfish.js', import.meta.url))));
  after(() => engine.terminate());
  const cfg = ANALYSIS_CONFIG.puzzles;
  // Uno per alcuni temi diversi (il primo di ciascuno nel file: scelta stabile)
  const sample = ['mateIn2', 'fork', 'pin'].map((t) => data.puzzles.find((p) => p.theme === t));
  for (const p of sample) {
    const s = puzzleStart({ fen: p.fen, moves: p.moves.split(' ') });
    const c = new Chess(s.fen);
    for (let i = 0; i < s.solution.length; i++) {
      const fen = c.fen();
      const solver = i % 2 === 0;
      const r = await engine.analyze(fen, solver
        ? { depth: cfg.depth, multiPv: cfg.multiPv, movetimeMs: null }
        : { depth: cfg.replyDepth, multiPv: cfg.replyMultiPv, movetimeMs: null });
      const v = solver ? verifySolverMove(r, fen, s.solution[i], i === s.solution.length - 1) : verifyReply(r, fen, s.solution[i]);
      assert.ok(v.ok, `${p.id} mossa ${i}: ${v.reason}`);
      playUci(c, s.solution[i]);
    }
  }
});
