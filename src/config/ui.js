// Parametri dell'interfaccia. I colori delle categorie e dei grafici sono in style.css
// (variabili --cls-* e --graph-*), così cambiano insieme al tema chiaro/scuro.

export const UI_CONFIG = Object.freeze({
  // Frecce delle linee del motore: la prima è la migliore, le altre via via più tenui.
  arrows: Object.freeze([
    Object.freeze({ color: '#22c55e', width: 0.2, opacity: 0.92 }),
    Object.freeze({ color: '#60a5fa', width: 0.13, opacity: 0.7 }),
    Object.freeze({ color: '#60a5fa', width: 0.11, opacity: 0.55 }),
    Object.freeze({ color: '#60a5fa', width: 0.1, opacity: 0.42 }),
    Object.freeze({ color: '#60a5fa', width: 0.09, opacity: 0.35 }),
  ]),
  arrowHighlight: '#f59e0b', // linea su cui passa il mouse
  solutionArrow: Object.freeze({ color: '#22c55e', width: 0.2, opacity: 0.95, dashed: true }),
  // Allenatore: freccia del suggerimento scelto (occasione) e della minaccia dell'avversario.
  coachArrow: Object.freeze({ color: '#f59e0b', width: 0.2, opacity: 0.95 }),
  coachThreatArrow: Object.freeze({ color: '#ef4444', width: 0.2, opacity: 0.95, dashed: true }),

  // Mosse mostrate per ogni linea del motore e nella "linea migliore" di una mossa.
  lineMoves: 8,

  // Profondità per l'analisi della partita (la prima linea del motore viene da config/analysis.js).
  reviewDepthPresets: Object.freeze([
    Object.freeze({ label: 'Veloce', depth: 10 }),
    Object.freeze({ label: 'Normale', depth: 14 }),
    Object.freeze({ label: 'Profonda', depth: 18 }),
  ]),

  // Scheda "Analisi partita": linee del motore mostrate dopo ogni mossa (servono anche a riconoscere le "Great").
  gameMode: Object.freeze({
    multiPv: 3,
  }),

  // Libreria di partite (data/examples/, generata da scripts/build-examples.mjs).
  examples: Object.freeze({
    indexUrl: 'data/examples/index.json',
    baseUrl: 'data/examples/',
    // Filtri della finestra; 'miniature' viene assegnata in automatico dallo script.
    categories: Object.freeze([
      Object.freeze({ id: 'classic', label: 'Classiche' }),
      Object.freeze({ id: 'champions', label: 'Campioni del mondo' }),
      Object.freeze({ id: 'carlsen', label: 'Magnus Carlsen' }),
      Object.freeze({ id: 'miniature', label: 'Miniature/trappole' }),
    ]),
    miniatureMaxMoves: 25, // partita vinta (non patta) entro questo numero di mosse → "miniatura"
  }),

  // Finestra "Informazioni e licenze" (avvisi legali richiesti dalla GPLv3, sezione 5(d)).
  about: Object.freeze({
    version: '2.0.0',
    copyright: 'Copyright © 2026 ai54setup-maker', // titolare (nome utente GitHub; sostituibile con il nome reale)
    sourceUrl: 'https://github.com/ai54setup-maker/CHES54-ai', // repository pubblico con il codice sorgente
    stockfishSourceUrl: 'https://github.com/nmrugg/stockfish.js/tree/v17.1.0', // meglio un tuo fork, vedi docs/licenze.md
  }),
  storagePrefix: 'ches54:',
  toastMs: 1800,
});
