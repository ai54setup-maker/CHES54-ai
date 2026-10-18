// Momenti chiave: le semimosse con la variazione di win% più grande.

import { ANALYSIS_CONFIG } from '../config/analysis.js';

/**
 * @param {number[]} whiteWinPercents win% del Bianco nella posizione iniziale e dopo ogni semimossa
 * @param {{ count?: number, minSwing?: number }} [opts]
 * @returns {{ index: number, swing: number }[]} index = indice della semimossa; swing con segno
 *          (positivo = a favore del Bianco). Ordinati per ordine di gioco.
 */
export function keyMoments(whiteWinPercents, opts = {}) {
  const { count, minSwing } = { ...ANALYSIS_CONFIG.keyMoments, ...opts };
  const swings = [];
  for (let i = 0; i + 1 < whiteWinPercents.length; i++) {
    swings.push({ index: i, swing: whiteWinPercents[i + 1] - whiteWinPercents[i] });
  }
  return swings
    .filter((s) => Math.abs(s.swing) >= minSwing)
    .sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing))
    .slice(0, count)
    .sort((a, b) => a.index - b.index);
}
