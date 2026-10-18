// "Chi sta meglio e di quanto" e "dove ho iniziato a perdere vantaggio" (scheda Analisi partita).
// Tutto deriva dalla win% calcolata sulle valutazioni di Stockfish; soglie in config/analysis.js.

import { ANALYSIS_CONFIG } from '../config/analysis.js';

const A = ANALYSIS_CONFIG.advantage;
const ERRORS = ['inaccuracy', 'mistake', 'blunder'];

/**
 * @typedef {Object} Advantage
 * @property {'w'|'b'|null} side   chi sta meglio (null = equilibrio o patta)
 * @property {'equal'|'slight'|'clear'|'decisive'|'mate'|'checkmate'|'draw'} level
 * @property {number} winPct       win% del Bianco
 * @property {number|null} mate    matto in N (con segno: positivo = per il Bianco)
 */

/**
 * @param {import('./classify.js').PositionEval} pe
 * @returns {Advantage}
 */
export function advantageOf(pe) {
  if (pe.terminal === 'checkmate') return { side: pe.winner, level: 'checkmate', winPct: pe.winPct, mate: null };
  if (pe.terminal === 'draw') return { side: null, level: 'draw', winPct: 50, mate: null };
  const mate = pe.score?.mate ?? null;
  if (mate != null) return { side: mate > 0 ? 'w' : 'b', level: 'mate', winPct: pe.winPct, mate };
  const gap = Math.abs(pe.winPct - 50);
  const side = pe.winPct > 50 ? 'w' : 'b';
  if (gap < A.equalBelow) return { side: null, level: 'equal', winPct: pe.winPct, mate: null };
  const level = gap < A.slightBelow ? 'slight' : gap < A.clearBelow ? 'clear' : 'decisive';
  return { side, level, winPct: pe.winPct, mate: null };
}

/**
 * Prima mossa del giocatore da cui è cominciato il calo del suo vantaggio.
 * Considera solo le posizioni valutate consecutive dall'inizio.
 * @param {(import('./classify.js').PositionEval|null)[]} positions
 * @param {(import('./game-analyzer.js').MoveAnalysis|null)[]} moves
 * @param {'w'|'b'} color  il giocatore
 * @param {number} [minDrop]
 * @returns {null | { moveIndex: number, peakWin: number, nowWin: number }}  win% dal punto di vista del giocatore
 */
export function turningPoint(positions, moves, color, minDrop = ANALYSIS_CONFIG.turningPoint.minDrop) {
  const win = [];
  for (const p of positions) {
    if (!p) break;
    win.push(color === 'w' ? p.winPct : 100 - p.winPct);
  }
  if (win.length < 2) return null;
  let peak = 0;
  win.forEach((v, i) => { if (v > win[peak]) peak = i; });
  const last = win.length - 1;
  if (win[peak] - win[last] < minDrop) return null;
  const mine = [];
  for (let j = peak; j < last; j++) if (moves[j]?.ply.color === color) mine.push(moves[j]);
  if (!mine.length) return null; // il calo viene solo da mosse dell'avversario: non è "colpa" del giocatore
  const pick = mine.find((m) => ERRORS.includes(m.classification)) ?? mine.reduce((a, b) => (b.winLoss > a.winLoss ? b : a));
  return { moveIndex: pick.ply.index, peakWin: win[peak], nowWin: win[last] };
}
