// Conversione da valutazione del motore a percentuale di vittoria (formula di Lichess,
// verificata su scalachess: chess.eval.WinPercent).

import { ANALYSIS_CONFIG } from '../config/analysis.js';

const { coefficient, cpCeiling } = ANALYSIS_CONFIG.winPercent;

/**
 * Percentuale di vittoria (0–100) per chi ha il vantaggio cp. I cp sono limitati a ±cpCeiling.
 * @param {number} cp centipawn
 */
export function winPercentFromCp(cp) {
  const c = Math.max(-cpCeiling, Math.min(cpCeiling, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-coefficient * c)) - 1);
}

/**
 * Percentuale di vittoria del Bianco per un punteggio normalizzato (punto di vista del Bianco).
 * Come in Lichess, un matto forzato vale quanto ±cpCeiling (≈ 97.54 / 2.46), non 100 / 0.
 * @param {import('../engine/score.js').Score} score
 */
export function winPercent(score) {
  if (score.mate != null) return winPercentFromCp(score.mate > 0 ? cpCeiling : -cpCeiling);
  return winPercentFromCp(score.cp);
}

/** Win% per il colore indicato, a partire da quella del Bianco. */
export const winPercentFor = (whiteWinPct, color) => (color === 'w' ? whiteWinPct : 100 - whiteWinPct);
