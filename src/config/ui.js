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

  // Mosse mostrate per ogni linea del motore e nella "linea migliore" di una mossa.
  lineMoves: 8,

  // Profondità per l'analisi della partita (la prima linea del motore viene da config/analysis.js).
  reviewDepthPresets: Object.freeze([
    Object.freeze({ label: 'Veloce', depth: 10 }),
    Object.freeze({ label: 'Normale', depth: 14 }),
    Object.freeze({ label: 'Profonda', depth: 18 }),
  ]),

  examplePgnUrl: 'data/examples/opera-game.pgn',

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
