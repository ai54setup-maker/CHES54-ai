// Lista delle mosse della partita, con l'icona della categoria (in revisione) e la mossa corrente evidenziata.

import { toItalian } from './notation.js';
import { classIcon } from './classification.js';

/**
 * @param {HTMLOListElement} ol
 * @param {Object} p
 * @param {import('../analysis/game-model.js').Game} p.game
 * @param {{ classification: string }[]|null} p.moves  analisi delle mosse (null fuori dalla revisione)
 * @param {number} p.cursor   indice della posizione mostrata (0 = iniziale)
 * @param {(positionIndex: number) => void} p.onSelect
 */
export function renderMoveList(ol, { game, moves, cursor, onSelect }) {
  ol.replaceChildren();
  const cells = game.plies.map((p, i) => ({ ply: p, i }));
  // Se la partita inizia col Nero, la prima riga ha "…" al posto della mossa del Bianco.
  if (game.plies[0]?.color === 'b') cells.unshift(null);
  for (let r = 0; r < cells.length; r += 2) {
    const li = document.createElement('li');
    const first = cells[r] ?? cells[r + 1];
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = `${first.ply.moveNumber}.`;
    li.append(num);
    for (const cell of [cells[r], cells[r + 1]]) {
      if (cell === undefined) break;
      if (cell === null) {
        li.insertAdjacentHTML('beforeend', '<span class="mv-empty">…</span>');
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mv' + (cell.i + 1 === cursor ? ' current' : '');
      const cls = moves?.[cell.i]?.classification;
      b.innerHTML = (cls ? classIcon(cls) : '') + '<span></span>';
      b.lastChild.textContent = toItalian(cell.ply.san);
      if (cls) b.classList.add(`mv-${cls}`);
      b.addEventListener('click', () => onSelect(cell.i + 1));
      li.append(b);
    }
    ol.append(li);
  }
  ol.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
}
