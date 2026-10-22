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

  // Problemi (fase F): dati generati da scripts/build-puzzles.mjs. I temi sono quelli assegnati da Lichess.
  puzzles: Object.freeze({
    dataUrl: 'data/puzzles/puzzles.json',
    // Ordine = priorità del tema principale di un problema (un problema di Lichess ha più temi).
    themes: Object.freeze([
      Object.freeze({ id: 'mateIn1', label: 'Matto in 1' }),
      Object.freeze({ id: 'mateIn2', label: 'Matto in 2' }),
      Object.freeze({ id: 'mateIn3', label: 'Matto in 3' }),
      Object.freeze({ id: 'fork', label: 'Forchetta' }),
      Object.freeze({ id: 'pin', label: 'Inchiodatura' }),
      Object.freeze({ id: 'skewer', label: 'Infilata' }),
      Object.freeze({ id: 'discoveredAttack', label: 'Attacco di scoperta' }),
      Object.freeze({ id: 'hangingPiece', label: 'Pezzo in presa' }),
      Object.freeze({ id: 'deflection', label: 'Deviazione' }),
      Object.freeze({ id: 'endgame', label: 'Finale' }),
    ]),
    // Fasce di difficoltà sul punteggio Lichess del problema: [min, max).
    levels: Object.freeze([
      Object.freeze({ id: 'easy', label: 'Facile', min: 0, max: 1300 }),
      Object.freeze({ id: 'medium', label: 'Medio', min: 1300, max: 1800 }),
      Object.freeze({ id: 'hard', label: 'Difficile', min: 1800, max: 2300 }),
      Object.freeze({ id: 'expert', label: 'Esperto', min: 2300, max: 4000 }),
    ]),
    replyDelayMs: 450, // pausa prima della risposta automatica dell'avversario
    dailyLevels: Object.freeze(['medium', 'hard']), // problema del giorno: scelto tra queste difficoltà
  }),

  // Import delle partite da Lichess e Chess.com (API pubbliche, senza login).
  onlineGames: Object.freeze({
    max: 20, //           partite mostrate
    chessComMonths: 3, // archivi mensili di Chess.com letti al massimo per trovarle
  }),

  // "I tuoi errori": esercizi dagli errori delle revisioni (in localStorage, chiave myMistakes).
  myMistakes: Object.freeze({
    max: 300, // esercizi conservati al massimo (si tolgono prima quelli imparati, poi i più vecchi)
  }),

  // Lezioni (fase G): contenuti in data/lessons/lessons.json, verificati con npm run check:lessons.
  lessons: Object.freeze({
    dataUrl: 'data/lessons/lessons.json',
    demoDelayMs: 650, // pausa tra le mosse delle dimostrazioni e delle risposte automatiche
    arrow: Object.freeze({ color: '#2ee6ff', width: 0.16, opacity: 0.85 }), // frecce delle spiegazioni
  }),

  // Finestra "Informazioni e licenze" (avvisi legali richiesti dalla GPLv3, sezione 5(d)).
  about: Object.freeze({
    version: '3.0.0',
    copyright: 'Copyright © 2026 ai54setup-maker', // titolare (nome utente GitHub; sostituibile con il nome reale)
    sourceUrl: 'https://github.com/ai54setup-maker/CHES54-ai', // repository pubblico con il codice sorgente
    stockfishSourceUrl: 'https://github.com/nmrugg/stockfish.js/tree/v17.1.0', // meglio un tuo fork, vedi docs/licenze.md
  }),
  storagePrefix: 'ches54:',
  toastMs: 1800,
});
