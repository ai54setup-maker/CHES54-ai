// Nomi (tradotti con t() quando si leggono) e icone delle categorie delle mosse.
// Le icone sono disegnate qui (cerchio colorato + simbolo di annotazione scacchistica standard:
// !!, !, ?!, ?, ??); i colori sono le variabili CSS --cls-*.

import { t } from '../i18n/i18n.js';

const info = (label, glyph) => Object.freeze({ get label() { return t(label); }, glyph });

export const CLASS_INFO = Object.freeze({
  brilliant: info('Brillante', '!!'),
  great: info('Ottima', '!'),
  best: info('Migliore', '★'),
  excellent: info('Eccellente', '✓'),
  good: info('Buona', '✓'),
  book: info('Teoria', null),
  inaccuracy: info('Imprecisione', '?!'),
  mistake: info('Errore', '?'),
  blunder: info('Errore grave', '??'),
});

// Ordine nel riepilogo
export const SUMMARY_ORDER = Object.freeze([
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder',
]);

// Libro stilizzato (per "Teoria")
const BOOK = '<path d="M6.5 7.5c2-.8 3.8-.6 5.5.6 1.7-1.2 3.5-1.4 5.5-.6v9c-2-.8-3.8-.6-5.5.6-1.7-1.2-3.5-1.4-5.5-.6z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8.1v9" stroke="#fff" stroke-width="1.4"/>';

/**
 * Icona SVG (stringa) di una categoria.
 * @param {string} cls
 */
export function classIcon(cls) {
  const info = CLASS_INFO[cls];
  if (!info) return '';
  const size = info.glyph && info.glyph.length > 1 ? 11 : 14;
  const inner = info.glyph
    ? `<text x="12" y="12.6" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="800" fill="#fff" font-family="system-ui, sans-serif">${info.glyph}</text>`
    : BOOK;
  return `<svg class="cls-icon cls-${cls}" viewBox="0 0 24 24" role="img" aria-label="${info.label}"><circle cx="12" cy="12" r="11" fill="currentColor"/>${inner}</svg>`;
}
