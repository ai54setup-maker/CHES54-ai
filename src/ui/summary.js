// Riepilogo della revisione: giocatori, risultato, apertura, precisione e conteggi per categoria.

import { CLASS_INFO, SUMMARY_ORDER, classIcon } from './classification.js';

const fmt = (v) => (v == null ? '–' : v.toFixed(1).replace('.', ','));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {HTMLElement} el
 * @param {Awaited<ReturnType<typeof import('../analysis/game-analyzer.js').analyzeGame>>} a
 * @param {number} retryCount  quante mosse si possono ritentare
 * @param {{ counts: { w: number, b: number }, saved: { w: boolean, b: boolean }, me: 'w'|'b'|null }} [save]
 *   errori salvabili come esercizi per colore, già salvati, colore dell'utente (se riconosciuto)
 */
export function renderSummary(el, a, retryCount, save = null) {
  const h = a.headers;
  const w = a.players.w;
  const b = a.players.b;
  const rows = SUMMARY_ORDER
    .filter((k) => w.counts[k] || b.counts[k])
    .map((k) => `<tr><td class="cnt">${w.counts[k]}</td><td class="cls">${classIcon(k)}<span>${CLASS_INFO[k].label}</span></td><td class="cnt">${b.counts[k]}</td></tr>`)
    .join('');
  el.innerHTML = `
    <div class="sum-players">
      <div class="sum-name">${esc(h.White || 'Bianco')}${h.WhiteElo ? ` <small>${esc(h.WhiteElo)}</small>` : ''}</div>
      <div class="sum-result">${esc(a.result)}</div>
      <div class="sum-name right">${esc(h.Black || 'Nero')}${h.BlackElo ? ` <small>${esc(h.BlackElo)}</small>` : ''}</div>
    </div>
    <div class="sum-acc">
      <div class="acc-box white"><b>${fmt(w.accuracy)}</b></div>
      <span>Precisione</span>
      <div class="acc-box black"><b>${fmt(b.accuracy)}</b></div>
    </div>
    ${a.opening ? `<p class="sum-opening">${esc(a.opening.eco)} · ${esc(a.opening.name)}</p>` : ''}
    <table class="sum-table"><tbody>${rows}</tbody></table>
    <p class="hint">Precisione calcolata come Lichess; media semplice per mossa: ${fmt(w.meanAccuracy)} / ${fmt(b.meanAccuracy)}.
      Stockfish, profondità ${a.settings.depth}.</p>
    ${save && (save.counts.w || save.counts.b) ? `<div class="sum-save">
      <span>Salva come esercizi gli errori di</span>
      <div class="toolbar two">${['w', 'b'].map((c) => {
        const name = `${c === 'w' ? 'Bianco' : 'Nero'}${save.me === c ? ' (tu)' : ''}`;
        const label = save.saved[c] ? `${name}: salvati ✓` : `${name} (${save.counts[c]})`;
        return `<button type="button" class="btn${save.me === c && !save.saved[c] ? ' primary' : ''}" data-save="${c}" ${save.counts[c] && !save.saved[c] ? '' : 'disabled'}>${label}</button>`;
      }).join('')}</div></div>` : ''}
    <div class="toolbar two">
      <button type="button" class="btn" id="btn-retry-all" ${retryCount ? '' : 'disabled'}>Ritenta gli errori (${retryCount})</button>
      <button type="button" class="btn" id="btn-new-review">Nuova revisione</button>
    </div>`;
}
