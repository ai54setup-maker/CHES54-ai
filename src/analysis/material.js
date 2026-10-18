// Materiale lungo una variante del motore. Serve a classificazione (sacrifici) e spiegazioni.

import { Chess } from '../../lib/chess.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { uciToMove } from './game-model.js';

/** Materiale di un colore meno quello dell'avversario, in pedoni. */
export function materialBalance(chess, color) {
  let sum = 0;
  for (const p of chess.board().flat()) {
    if (p) sum += (p.color === color ? 1 : -1) * ANALYSIS_CONFIG.materialValues[p.type];
  }
  return sum;
}

/**
 * Gioca una sequenza di mosse UCI e misura il materiale a fine scambio.
 * Si giocano almeno `minPlies` semimosse; poi si continua finché la mossa successiva della
 * sequenza è una cattura (lo scambio non è finito), fino a `maxPlies`.
 * @param {string} fen
 * @param {string[]} uciMoves
 * @param {'w'|'b'} color   punto di vista del bilancio
 * @param {number} minPlies
 * @param {number} maxPlies
 * @returns {{ start: number, end: number, played: number, settled: boolean,
 *             captures: { ply: number, by: 'w'|'b', piece: string, square: string }[] }}
 *   played = semimosse effettivamente giocate; captures = catture in ordine;
 *   settled = la misura è affidabile: lo scambio è finito (la mossa successiva non è una cattura,
 *   oppure la linea termina dopo una mossa che non cattura, oppure con il matto)
 */
export function materialAlongLine(fen, uciMoves, color, minPlies, maxPlies) {
  const chess = new Chess(fen);
  const start = materialBalance(chess, color);
  const captures = [];
  let played = 0;
  let settled = false;
  let lastWasCapture = false;
  for (const uci of uciMoves.slice(0, maxPlies)) {
    if (played >= minPlies && !isCapture(chess, uci)) {
      settled = true;
      break;
    }
    let m;
    try {
      m = chess.move(uciToMove(uci));
    } catch {
      break;
    }
    if (m.captured) {
      // In caso di en passant il pedone catturato non sta sulla casa d'arrivo
      const square = m.isEnPassant() ? m.to[0] + m.from[1] : m.to;
      captures.push({ ply: played, by: m.color, piece: m.captured, square });
    }
    lastWasCapture = !!m.captured;
    played++;
  }
  // Linea finita prima del limite: affidabile solo se l'ultima mossa non era una cattura (o è matto)
  if (!settled && played < maxPlies && played === Math.min(uciMoves.length, maxPlies)) {
    settled = !lastWasCapture || chess.isCheckmate();
  }
  return { start, end: materialBalance(chess, color), played, settled, captures };
}

function isCapture(chess, uci) {
  try {
    const m = chess.move(uciToMove(uci));
    chess.undo();
    return !!m.captured;
  } catch {
    return false;
  }
}
