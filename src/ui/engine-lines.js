// Pannello con le N linee del motore: punteggio (punto di vista del Bianco) e prime mosse in SAN italiana.

import { formatScore } from '../engine/score.js';
import { numberedLine } from './notation.js';
import { UI_CONFIG } from '../config/ui.js';

/**
 * @param {HTMLOListElement} ol
 * @param {Object} p
 * @param {string} p.fen
 * @param {import('../engine/engine.js').EngineLine[]} p.lines
 * @param {number|null} p.highlighted
 * @param {(index: number) => void} p.onPick
 * @param {(index: number|null) => void} p.onHover
 */
export function renderEngineLines(ol, { fen, lines, highlighted, onPick, onHover }) {
  ol.replaceChildren();
  lines.forEach((l, i) => {
    const li = document.createElement('li');
    li.className = 'eline' + (i === 0 ? ' best' : '') + (i === highlighted ? ' hl' : '');
    li.tabIndex = 0;
    const s = l.score;
    const sign = s.mate != null ? Math.sign(s.mate) : Math.sign(s.cp);
    li.innerHTML = '<span class="eline-score"></span><span class="eline-moves"></span>';
    const score = li.querySelector('.eline-score');
    score.textContent = formatScore(s);
    score.classList.add(sign > 0 ? 'white' : sign < 0 ? 'black' : 'even');
    li.querySelector('.eline-moves').textContent = numberedLine(fen, l.pv, UI_CONFIG.lineMoves);
    li.title = 'Gioca la prima mossa di questa linea';
    li.addEventListener('click', () => onPick(i));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') onPick(i); });
    li.addEventListener('pointerenter', () => onHover(i));
    li.addEventListener('pointerleave', () => onHover(null));
    ol.append(li);
  });
}

/** Messaggio al posto delle linee (motore in avvio, posizione finale, ecc.). */
export function renderEngineMessage(ol, text) {
  ol.innerHTML = '<li class="eline placeholder"></li>';
  ol.firstChild.textContent = text;
}
