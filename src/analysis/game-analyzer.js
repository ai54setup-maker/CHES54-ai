// Analisi di una partita intera: valuta ogni posizione con il motore e calcola, per ogni mossa,
// valutazione prima/dopo, mossa migliore, perdita di win%, precisione e classificazione;
// poi apertura, riepilogo per giocatore e momenti chiave.

import { Chess } from '../../lib/chess.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { winPercent } from './winpct.js';
import { moveAccuracy, gameAccuracy, meanAccuracy } from './accuracy.js';
import { classifyMove, CLASSIFICATIONS } from './classify.js';
import { keyMoments } from './key-moments.js';

/**
 * @typedef {import('./classify.js').PositionEval} PositionEval
 */

/**
 * @typedef {Object} MoveAnalysis
 * @property {import('./game-model.js').Ply} ply
 * @property {PositionEval} before
 * @property {PositionEval} after
 * @property {string|null} bestMove     mossa migliore secondo il motore (UCI)
 * @property {string|null} bestSan
 * @property {boolean} isBest
 * @property {number} winBefore         win% di chi muove prima della mossa
 * @property {number} winAfter          win% di chi muove dopo la mossa
 * @property {number} winLoss           perdita di win% (≥ 0)
 * @property {number} accuracy          0–100
 * @property {string} classification
 */

/**
 * @param {import('./game-model.js').Game} game
 * @param {import('../engine/engine.js').Engine} engine
 * @param {Object} [opts]
 * @param {import('./openings.js').OpeningBook} [opts.book]
 * @param {{ depth: number|null, multiPv: number, movetimeMs: number|null }} [opts.settings]
 * @param {(done: number, total: number) => void} [opts.onProgress]
 */
export async function analyzeGame(game, engine, opts = {}) {
  const settings = { ...ANALYSIS_CONFIG.gameAnalysis, ...opts.settings };
  const t0 = Date.now();
  const fens = [game.startFen, ...game.plies.map((p) => p.fenAfter)];
  let done = 0;
  const progress = () => opts.onProgress?.(++done, fens.length);
  // Memoria del motore vuota: la stessa partita con le stesse impostazioni dà lo stesso risultato.
  await engine.newGame();

  // Tutte le posizioni vanno in coda al motore; le ripetizioni sono servite dalla cache.
  const positions = await Promise.all(fens.map((fen, i) => {
    const isLast = i === fens.length - 1;
    if (isLast && game.ending) {
      progress();
      return Promise.resolve(terminalEval(fen, game.ending));
    }
    return engine.analyze(fen, { ...settings, exactCache: true }).then((r) => {
      progress();
      return positionEval(r);
    });
  }));

  const fensAfter = game.plies.map((p) => p.fenAfter);
  const { bookPlies, opening } = opts.book ? opts.book.identify(fensAfter) : { bookPlies: 0, opening: null };

  /** @type {MoveAnalysis[]} */
  const moves = game.plies.map((ply, i) => {
    const before = positions[i];
    const after = positions[i + 1];
    const c = classifyMove({ ply, prevPly: game.plies[i - 1] ?? null, before, after, isBook: i < bookPlies });
    return {
      ply,
      before,
      after,
      bestMove: before.bestMove,
      bestSan: uciToSan(ply.fenBefore, before.bestMove),
      isBest: c.isBest,
      winBefore: c.winBefore,
      winAfter: c.winAfter,
      winLoss: c.winLoss,
      accuracy: moveAccuracy(c.winBefore, c.winAfter),
      classification: c.classification,
    };
  });

  const whiteWin = positions.map((p) => p.winPct);
  const startColor = game.startFen.split(' ')[1] === 'b' ? 'b' : 'w';
  const lichessAccuracy = gameAccuracy(whiteWin, startColor);
  const players = {};
  for (const color of ['w', 'b']) {
    const mine = moves.filter((m) => m.ply.color === color);
    const counts = Object.fromEntries(CLASSIFICATIONS.map((k) => [k, 0]));
    for (const m of mine) counts[m.classification]++;
    players[color] = {
      accuracy: lichessAccuracy[color],
      meanAccuracy: meanAccuracy(mine.map((m) => m.accuracy)),
      counts,
    };
  }

  return {
    headers: game.headers,
    result: game.result,
    settings,
    positions,
    moves,
    opening,
    bookPlies,
    players,
    keyMoments: keyMoments(whiteWin),
    durationMs: Date.now() - t0,
  };
}

/**
 * @param {import('../engine/engine.js').AnalysisResult} r
 * @returns {PositionEval}
 */
export function positionEval(r) {
  if (!r.lines.length) {
    // Il motore non ha mosse da proporre: posizione finale (matto o stallo).
    const c = new Chess(r.fen);
    return terminalEval(r.fen, c.isCheckmate() ? 'checkmate' : 'stalemate');
  }
  const score = r.lines[0].score;
  return { fen: r.fen, score, terminal: null, winner: null, winPct: winPercent(score), lines: r.lines, bestMove: r.bestMove, depth: r.depth };
}

/**
 * Posizione finale riconosciuta con le regole: matto o patta (stallo, materiale insufficiente,
 * ripetizione, 50 mosse). La ripetizione si vede solo dalla partita, non dalla FEN.
 * @returns {PositionEval}
 */
export function terminalEval(fen, ending) {
  const base = { fen, lines: [], bestMove: null, depth: 0 };
  if (ending === 'checkmate') {
    const winner = fen.split(' ')[1] === 'w' ? 'b' : 'w';
    const winPct = winPercent({ cp: null, mate: winner === 'w' ? 1 : -1 });
    return { ...base, score: null, terminal: 'checkmate', winner, winPct };
  }
  return { ...base, score: { cp: 0, mate: null }, terminal: 'draw', winner: null, winPct: 50 };
}

function uciToSan(fen, uci) {
  if (!uci) return null;
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return null;
  }
}
