// Barra di valutazione verticale. Riceve la valutazione già normalizzata (punto di vista del Bianco).

import { winPercent } from '../analysis/winpct.js';

/**
 * @param {{ bar: HTMLElement, fill: HTMLElement, label: HTMLElement }} els
 * @param {Object} p
 * @param {import('../engine/score.js').Score|null} p.score
 * @param {'w'|'b'|null} p.mateWinner   se la posizione è di scacco matto, chi ha vinto
 * @param {boolean} p.draw              posizione finale patta
 * @param {'w'|'b'} p.orientation       colore in basso sulla scacchiera
 */
export function renderEvalBar(els, { score, mateWinner, draw, orientation }) {
  let whitePct = 50;
  let text = '';
  if (mateWinner) {
    whitePct = mateWinner === 'w' ? 100 : 0;
    text = mateWinner === 'w' ? '1-0' : '0-1';
  } else if (draw) {
    text = '½-½';
  } else if (score) {
    // Con un matto forzato la barra si riempie del tutto (winPercent lo vale ≈ 97.5%, come Lichess).
    whitePct = score.mate != null ? (score.mate > 0 ? 100 : 0) : winPercent(score);
    if (score.mate != null) text = (score.mate < 0 ? '-M' : 'M') + Math.abs(score.mate);
    else {
      const v = Math.round(score.cp / 10) / 10 || 0; // evita "-0.0"
      text = (v > 0 ? '+' : '') + v.toFixed(1);
    }
  }
  els.bar.classList.toggle('flipped', orientation === 'b');
  els.fill.style.height = (orientation === 'w' ? whitePct : 100 - whitePct) + '%';
  els.label.textContent = text;
  els.bar.setAttribute('aria-label', `Valutazione: ${text || 'in attesa'}`);
}
