// Conversione da valutazione del motore a percentuale di vittoria (formula pubblica di Lichess).

import { ANALYSIS_CONFIG } from '../config/analysis.js';

/**
 * Percentuale di vittoria (0–100) per chi ha il vantaggio cp.
 * @param {number} cp centipawn
 */
export function winPercentFromCp(cp) {
  const k = ANALYSIS_CONFIG.winPercent.coefficient;
  return 50 + 50 * (2 / (1 + Math.exp(-k * cp)) - 1);
}

/**
 * Percentuale di vittoria del Bianco per un punteggio normalizzato (punto di vista del Bianco).
 * Un matto forzato vale 100 (per il Bianco) o 0 (per il Nero).
 * @param {import('../engine/score.js').Score} score
 */
export function winPercent(score) {
  if (score.mate != null) return score.mate > 0 ? 100 : 0;
  return winPercentFromCp(score.cp);
}
