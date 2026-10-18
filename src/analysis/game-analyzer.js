// Analisi di una partita intera: valuta ogni posizione con il motore e calcola, per ogni mossa,
// valutazione prima/dopo, mossa migliore, perdita di win%, precisione e classificazione;
// poi apertura, riepilogo per giocatore e momenti chiave.

import { Chess } from '../../lib/chess.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { winPercent } from './winpct.js';
import { moveAccuracy, gameAccuracy, meanAccuracy } from './accuracy.js';
import { classifyMove, CLASSIFICATIONS } from './classify.js';
import { keyMoments } from './key-moments.js';
import { explainMove } from './explain.js';

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
 * @property {import('./explain.js').Explanation[]} explanations  fatti dimostrati dalle linee del motore
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
  const moves = game.plies.map((ply, i) => analyzeMove({
    ply, prevPly: game.plies[i - 1] ?? null, before: positions[i], after: positions[i + 1], isBook: i < bookPlies,
  }));

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
 * Analisi di una mossa a partire dalle valutazioni del motore prima e dopo: unico punto in cui si
 * calcolano classificazione, precisione e spiegazioni (usato dalla revisione e dall'analisi partita).
 * @param {{ ply: import('./game-model.js').Ply, prevPly: import('./game-model.js').Ply|null,
 *           before: PositionEval, after: PositionEval, isBook: boolean }} p
 * @returns {MoveAnalysis}
 */
export function analyzeMove({ ply, prevPly, before, after, isBook }) {
  const c = classifyMove({ ply, prevPly, before, after, isBook });
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
    explanations: explainMove({ ply, before, after, classification: c.classification }),
  };
}

/**
 * Analisi di una partita ancora "in costruzione" (scheda Analisi partita): usa le valutazioni già
 * disponibili e analizza le mosse che hanno sia la posizione prima sia quella dopo valutate.
 * Le posizioni finali (matto, stallo, patta per regola) sono valutate con le regole, senza motore.
 * @param {import('./game-model.js').Game} game
 * @param {(fen: string) => PositionEval|null|undefined} evalOf  valutazioni del motore già pronte
 * @param {import('./openings.js').OpeningBook|null} [book]
 * @param {Map<string, any>} [memo]  memoria tra una chiamata e l'altra (risultati per mossa e posizione)
 * @returns {{ positions: (PositionEval|null)[], moves: (MoveAnalysis|null)[], bookPlies: number,
 *             opening: import('./openings.js').Opening|null }}
 */
export function analyzeLine(game, evalOf, book = null, memo = new Map()) {
  const fens = [game.startFen, ...game.plies.map((p) => p.fenAfter)];
  const positions = fens.map((fen, i) => {
    if (i === fens.length - 1 && game.ending) return terminalEval(fen, game.ending);
    const ending = cached(memo, `end|${fen}`, () => {
      const c = new Chess(fen);
      if (c.isCheckmate()) return 'checkmate';
      return c.isStalemate() || c.isInsufficientMaterial() ? 'stalemate' : null;
    });
    return ending ? terminalEval(fen, ending) : evalOf(fen) ?? null;
  });
  const { bookPlies, opening } = book ? book.identify(fens.slice(1)) : { bookPlies: 0, opening: null };
  const moves = game.plies.map((ply, i) => {
    const before = positions[i];
    const after = positions[i + 1];
    if (!before || !after) return null;
    const prevPly = game.plies[i - 1] ?? null;
    const isBook = i < bookPlies;
    // Stessa mossa con le stesse valutazioni (stessi oggetti) e lo stesso contesto: si riusa il risultato.
    const key = `move|${ply.fenBefore}|${ply.uci}|${prevPly?.uci ?? ''}|${isBook}`;
    const hit = memo.get(key);
    if (hit && hit.before === before && (hit.after === after || (hit.after.terminal && after.terminal === hit.after.terminal))) return hit.result;
    const result = analyzeMove({ ply, prevPly, before, after, isBook });
    memo.set(key, { before, after, result });
    return result;
  });
  return { positions, moves, bookPlies, opening };
}

function cached(memo, key, compute) {
  if (!memo.has(key)) memo.set(key, compute());
  return memo.get(key);
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
