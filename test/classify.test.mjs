// Classificazione con valutazioni costruite a mano (nessun motore): verifica regole e soglie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMove, errorLevel, materialSacrificed } from '../src/analysis/classify.js';
import { terminalEval } from '../src/analysis/game-analyzer.js';
import { gameFromPgn } from '../src/analysis/game-model.js';
import { winPercent, winPercentFromCp } from '../src/analysis/winpct.js';
import { keyMoments } from '../src/analysis/key-moments.js';
import { ANALYSIS_CONFIG } from '../src/config/analysis.js';

const C = ANALYSIS_CONFIG.classification;

/** Valutazione di posizione: lines = [[score, pv], …] con score dal punto di vista del Bianco */
function pe(lines, fen = '') {
  const ls = lines.map(([score, pv], i) => ({ multipv: i + 1, depth: 10, score, pv }));
  return { fen, score: ls[0].score, terminal: null, winner: null, winPct: winPercent(ls[0].score), lines: ls, bestMove: ls[0].pv[0], depth: 10 };
}
const cp = (v) => ({ cp: v, mate: null });
const mate = (n) => ({ cp: null, mate: n });

// Una mossa qualsiasi del Bianco dalla posizione iniziale
const [E4] = gameFromPgn('1. e4 *').plies;

test('soglie di Lichess sulla perdita di win% (5 / 10 / 15)', () => {
  assert.equal(errorLevel({ kind: 'cp', cp: 0 }, { kind: 'cp', cp: 0 }, C.inaccuracy - 0.01), null);
  assert.equal(errorLevel({ kind: 'cp', cp: 0 }, { kind: 'cp', cp: 0 }, C.inaccuracy), 'inaccuracy');
  assert.equal(errorLevel({ kind: 'cp', cp: 0 }, { kind: 'cp', cp: 0 }, C.mistake), 'mistake');
  assert.equal(errorLevel({ kind: 'cp', cp: 0 }, { kind: 'cp', cp: 0 }, C.blunder), 'blunder');
});

test('regole sui matti di Lichess', () => {
  // Matto subito da una posizione normale → Blunder; da una già persa → meno grave
  assert.equal(errorLevel({ kind: 'cp', cp: 50 }, { kind: 'mate', n: -3 }, 0), 'blunder');
  assert.equal(errorLevel({ kind: 'cp', cp: -800 }, { kind: 'mate', n: -3 }, 0), 'mistake');
  assert.equal(errorLevel({ kind: 'cp', cp: -1200 }, { kind: 'mate', n: -3 }, 0), 'inaccuracy');
  // Matto perso: resta molto vinto → Inaccuracy; poco vinto → Blunder
  assert.equal(errorLevel({ kind: 'mate', n: 2 }, { kind: 'cp', cp: 1500 }, 0), 'inaccuracy');
  assert.equal(errorLevel({ kind: 'mate', n: 2 }, { kind: 'cp', cp: 800 }, 0), 'mistake');
  assert.equal(errorLevel({ kind: 'mate', n: 2 }, { kind: 'cp', cp: 100 }, 0), 'blunder');
  assert.equal(errorLevel({ kind: 'mate', n: 2 }, { kind: 'mate', n: -1 }, 0), 'blunder');
  // Matto più lento ma sempre forzato: nessun errore
  assert.equal(errorLevel({ kind: 'mate', n: 2 }, { kind: 'mate', n: 5 }, 0), null);
  assert.equal(errorLevel({ kind: 'mate', n: 1 }, { kind: 'mating' }, 0), null);
});

test('Best / Excellent / Good / errori in base alla perdita', () => {
  const before = pe([[cp(30), ['e2e4']], [cp(20), ['d2d4']]]);
  const best = classifyMove({ ply: E4, prevPly: null, before, after: pe([[cp(30), ['e7e5']]]), isBook: false });
  assert.equal(best.classification, 'best');
  assert.equal(best.winLoss, 0);

  const notBest = (afterCp) => classifyMove({
    ply: E4, prevPly: null, before: pe([[cp(30), ['d2d4']], [cp(20), ['e2e4']]]), after: pe([[cp(afterCp), ['e7e5']]]), isBook: false,
  });
  assert.equal(notBest(20).classification, 'excellent'); // perdita ≈ 0.9
  const loss = (afterCp) => winPercentFromCp(30) - winPercentFromCp(afterCp);
  for (const afterCp of [20, -10, -60, -150, -300]) {
    const l = loss(afterCp);
    const expected = l >= C.blunder ? 'blunder' : l >= C.mistake ? 'mistake' : l >= C.inaccuracy ? 'inaccuracy' : l < C.excellentMaxLoss ? 'excellent' : 'good';
    assert.equal(notBest(afterCp).classification, expected, `perdita ${l.toFixed(1)}`);
  }
});

test('Book ha la precedenza', () => {
  const r = classifyMove({ ply: E4, prevPly: null, before: pe([[cp(30), ['d2d4']]]), after: pe([[cp(-300), ['e7e5']]]), isBook: true });
  assert.equal(r.classification, 'book');
});

test('Great: unica mossa buona; non per le ricatture ovvie', () => {
  const before = pe([[cp(50), ['e2e4']], [cp(-300), ['d2d4']]]);
  const r = classifyMove({ ply: E4, prevPly: null, before, after: pe([[cp(50), ['e7e5']]]), isBook: false });
  assert.equal(r.classification, 'great');

  const g = gameFromPgn('1. e4 d5 2. exd5 Qxd5 *');
  const [, , exd5, qxd5] = g.plies;
  const before2 = pe([[cp(-20), ['d8d5']], [cp(-400), ['g8f6']]]);
  const r2 = classifyMove({ ply: qxd5, prevPly: exd5, before: before2, after: pe([[cp(-20), ['b1c3']]]), isBook: false });
  assert.equal(r2.classification, 'best');
});

test('Brilliant: sacrificio misurato lungo la linea del motore', () => {
  // Partita dell'Opera (Morphy, 1858), 13.Txd7: la torre si dà per il cavallo (qualità = 2)
  const fen = '3rkb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR3R w k - 3 13';
  assert.equal(materialSacrificed(fen, 'd1d7', ['d8d7', 'h1d1', 'e7c5', 'g5f6', 'g7f6']), 2);
  // Scambio alla pari (cattura e ricattura): nessun sacrificio
  assert.equal(materialSacrificed('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5', ['d8d5']), 0);

  const g = gameFromPgn(`[FEN "${fen}"]\n\n13. Rxd7 *`);
  const before = pe([[cp(510), ['d1d7']], [cp(300), ['b5d7']]], fen);
  const after = pe([[cp(512), ['d8d7', 'h1d1', 'e7c5', 'g5f6']]]);
  assert.equal(classifyMove({ ply: g.plies[0], prevPly: null, before, after, isBook: false }).classification, 'brilliant');
});

test('scacco matto dato: Best, non errore', () => {
  const g = gameFromPgn('1. f3 e5 2. g4 Qh4# 0-1');
  const qh4 = g.plies[3];
  const before = pe([[mate(-1), ['d8h4']], [cp(-500), ['b8c6']]]);
  const after = terminalEval(qh4.fenAfter, 'checkmate');
  assert.equal(after.winner, 'b');
  const r = classifyMove({ ply: qh4, prevPly: g.plies[2], before, after, isBook: false });
  assert.equal(r.classification, 'best');
  assert.equal(r.winLoss, 0);
});

test('momenti chiave: le variazioni di win% più grandi, in ordine di gioco', () => {
  const k = keyMoments([50, 52, 30, 31, 80, 79], { count: 2, minSwing: 10 });
  assert.deepEqual(k.map((m) => m.index), [1, 3]);
  assert.ok(k[1].swing > 0);
  assert.deepEqual(keyMoments([50, 51, 52], { minSwing: 10 }), []);
});
