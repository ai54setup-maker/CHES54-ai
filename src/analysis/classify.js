// Classificazione delle mosse: Book, Brilliant, Great, Best, Excellent, Good,
// Inaccuracy, Mistake, Blunder. Ogni categoria è derivata dalle valutazioni del motore
// (prima e dopo la mossa) e dalle sue linee; regole e soglie sono in config/analysis.js
// e documentate in CLAUDE.md.

import { Chess } from '../../lib/chess.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { toPov } from '../engine/score.js';
import { winPercent, winPercentFor } from './winpct.js';
import { materialBalance } from './material.js';

export { materialBalance };

export const CLASSIFICATIONS = Object.freeze([
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder',
]);

const C = ANALYSIS_CONFIG.classification;

/**
 * Valutazione di una posizione della partita (vedi game-analyzer.js).
 * @typedef {Object} PositionEval
 * @property {string} fen
 * @property {import('../engine/score.js').Score|null} score  punto di vista del Bianco; null se scacco matto
 * @property {null|'checkmate'|'draw'} terminal
 * @property {'w'|'b'|null} winner         solo per terminal === 'checkmate'
 * @property {number} winPct               win% del Bianco
 * @property {import('../engine/engine.js').EngineLine[]} lines
 * @property {string|null} bestMove
 * @property {number} depth
 */

/**
 * Valutazione dal punto di vista di un colore, nella forma usata dalle regole sui matti di Lichess.
 * @param {PositionEval} pe
 * @param {'w'|'b'} color
 * @returns {{ kind: 'cp', cp: number } | { kind: 'mate', n: number } | { kind: 'mated' } | { kind: 'mating' }}
 */
export function povView(pe, color) {
  if (pe.terminal === 'checkmate') return pe.winner === color ? { kind: 'mating' } : { kind: 'mated' };
  if (pe.terminal === 'draw' || !pe.score) return { kind: 'cp', cp: 0 };
  const s = toPov(pe.score, color);
  return s.mate != null ? { kind: 'mate', n: s.mate } : { kind: 'cp', cp: s.cp };
}

/**
 * Errore (Inaccuracy / Mistake / Blunder) secondo le regole di Lichess (lila: tree/Advice.scala):
 * - se prima e dopo sono valutazioni in centipawn: soglie sulla perdita di win%;
 * - se c'è di mezzo un matto: "matto subito" o "matto perso", graduati sui centipawn.
 * @returns {null|'inaccuracy'|'mistake'|'blunder'}
 */
export function errorLevel(before, after, winLoss) {
  if (before.kind === 'cp' && after.kind === 'cp') {
    if (winLoss >= C.blunder) return 'blunder';
    if (winLoss >= C.mistake) return 'mistake';
    if (winLoss >= C.inaccuracy) return 'inaccuracy';
    return null;
  }
  const afterLosing = (after.kind === 'mate' && after.n < 0) || after.kind === 'mated';
  const mateCreated = before.kind === 'cp' && afterLosing;
  const mateLost = before.kind === 'mate' && before.n > 0 && (after.kind === 'cp' || afterLosing);
  if (mateCreated) {
    if (before.cp < -C.mate.inaccuracyBeyondCp) return 'inaccuracy';
    if (before.cp < -C.mate.mistakeBeyondCp) return 'mistake';
    return 'blunder';
  }
  if (mateLost) {
    const cp = after.kind === 'cp' ? after.cp : 0;
    if (cp > C.mate.inaccuracyBeyondCp) return 'inaccuracy';
    if (cp > C.mate.mistakeBeyondCp) return 'mistake';
    return 'blunder';
  }
  return null;
}


/**
 * Materiale ceduto da chi muove: si gioca la mossa e poi la linea migliore del motore
 * (dalla posizione dopo la mossa) per brilliant.pvPlies semimosse. Il materiale si misura
 * dopo ogni risposta dell'avversario e si tiene il caso più favorevole a chi muove, così uno
 * scambio in corso (noi catturiamo, l'avversario ricattura) non conta come sacrificio.
 * Se la linea non contiene risposte (es. matto), si misura subito dopo la mossa.
 * @param {string} fenBefore
 * @param {string} uci
 * @param {string[]} pvAfter
 */
export function materialSacrificed(fenBefore, uci, pvAfter) {
  const chess = new Chess(fenBefore);
  const color = chess.turn();
  const start = materialBalance(chess, color);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const afterReplies = [];
  for (const [i, u] of pvAfter.slice(0, C.brilliant.pvPlies).entries()) {
    try {
      chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      break;
    }
    if (i % 2 === 0) afterReplies.push(materialBalance(chess, color)); // mossa dell'avversario
  }
  const best = afterReplies.length ? Math.max(...afterReplies) : materialBalance(chess, color);
  return start - best;
}

/**
 * Classifica una mossa.
 * @param {Object} p
 * @param {import('./game-model.js').Ply} p.ply
 * @param {import('./game-model.js').Ply|null} p.prevPly
 * @param {PositionEval} p.before   posizione prima della mossa
 * @param {PositionEval} p.after    posizione dopo la mossa
 * @param {boolean} p.isBook
 * @returns {{ classification: string, winBefore: number, winAfter: number, winLoss: number, isBest: boolean }}
 */
export function classifyMove({ ply, prevPly, before, after, isBook }) {
  const color = ply.color;
  const winBefore = winPercentFor(before.winPct, color);
  const winAfter = winPercentFor(after.winPct, color);
  const winLoss = Math.max(0, winBefore - winAfter);
  // Nota: anche la prima scelta del motore può risultare un errore, se l'analisi della posizione
  // dopo la mossa (che vede una semimossa più avanti) la valuta molto peggio. Come Lichess, vale
  // l'analisi della posizione dopo; l'interfaccia segnala il caso (valutazione instabile).
  const isBest = before.bestMove === ply.uci;
  const base = { winBefore, winAfter, winLoss, isBest };

  if (isBook) return { ...base, classification: 'book' };
  const error = errorLevel(povView(before, color), povView(after, color), winLoss);
  if (error) return { ...base, classification: error };
  if (isBrilliant(ply, before, after, base)) return { ...base, classification: 'brilliant' };
  if (isGreat(ply, prevPly, before, isBest)) return { ...base, classification: 'great' };
  if (isBest) return { ...base, classification: 'best' };
  if (winLoss < C.excellentMaxLoss) return { ...base, classification: 'excellent' };
  return { ...base, classification: 'good' };
}

/**
 * Brilliant (nostra euristica): la mossa è la migliore o quasi, cede almeno
 * brilliant.minSacrifice pedoni di materiale lungo la linea migliore del motore,
 * e chi muove non è perso dopo né era già ampiamente vincente prima
 * (a meno che il sacrificio porti a un matto forzato).
 */
function isBrilliant(ply, before, after, { winBefore, winAfter, winLoss, isBest }) {
  const B = C.brilliant;
  if (!isBest && winLoss >= B.maxLoss) return false;
  if (winAfter < B.minWinAfter) return false;
  if (winBefore > B.maxWinBefore && !(B.allowWhenMating && leadsToMate(after, ply.color))) return false;
  const pv = after.lines[0]?.pv ?? [];
  return materialSacrificed(ply.fenBefore, ply.uci, pv) >= B.minSacrifice;
}

/**
 * Great (nostra euristica): la mossa giocata è la migliore e la seconda linea del motore
 * è peggiore di almeno great.minGapToSecond punti di win% (unica mossa buona).
 * Esclusi: ricatture sulla casa appena catturata (troppo ovvie) e posizioni con matto già forzato.
 */
function isGreat(ply, prevPly, before, isBest) {
  if (!isBest || before.lines.length < 2) return false;
  if (leadsToMate(before, ply.color)) return false; // il matto era già forzato: è solo "Best"
  if (C.great.excludeRecaptures && ply.captured && prevPly?.captured && prevPly.to === ply.to) return false;
  const first = winPercentFor(winPercent(before.lines[0].score), ply.color);
  const second = winPercentFor(winPercent(before.lines[1].score), ply.color);
  return first - second >= C.great.minGapToSecond;
}

/** Nella posizione chi ha il colore indicato ha un matto forzato (o ha già dato matto)? */
function leadsToMate(pe, color) {
  const v = povView(pe, color);
  return v.kind === 'mating' || (v.kind === 'mate' && v.n > 0);
}
