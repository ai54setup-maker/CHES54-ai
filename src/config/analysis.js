// Parametri delle formule di analisi: unico posto dove cambiarli.
// Fonti e stato di verifica di ogni valore: vedi CLAUDE.md, sezione "Formule e soglie".
// "Lichess" = verificato sul sorgente (lila cd2656d, scalachess 4666581, scalalib dc09240).
// "Nostro" = scelta di questo progetto, non presa da Lichess né da Chess.com.

export const ANALYSIS_CONFIG = Object.freeze({
  winPercent: Object.freeze({
    // Lichess: win% = 50 + 50 * (2 / (1 + exp(-k * cp)) - 1)
    coefficient: 0.00368208,
    // Lichess: i centipawn vengono limitati a ±1000 prima della formula;
    // un matto vale come ±1000 (win% ≈ 97.54 / 2.46).
    cpCeiling: 1000,
  }),

  accuracy: Object.freeze({
    // Lichess, precisione di una mossa: a * exp(-k * perditaWin%) + b + bonus, limitata a [0, 100];
    // 100 se la win% non scende.
    a: 103.1668100711649,
    k: 0.04354415386753951,
    b: -3.166924740191411,
    uncertaintyBonus: 1, // Lichess aggiunge +1 per l'imprecisione dell'analisi
    // Lichess, precisione della partita: media tra media pesata (pesi = volatilità) e media armonica.
    windowDivisor: 10, // finestra = numero di mosse / 10, limitata a [minWindow, maxWindow]
    minWindow: 2,
    maxWindow: 8,
    minWeight: 0.5, // peso = deviazione standard della win% nella finestra, limitata a [minWeight, maxWeight]
    maxWeight: 12,
    harmonicFloor: 1, // nella media armonica ogni valore conta almeno 1 (evita divisioni per 0)
  }),

  classification: Object.freeze({
    // Perdite di win% (punti su 0–100) dal punto di vista di chi muove.
    // Lichess: 0.1 / 0.2 / 0.3 di "winning chances" su scala [-1, 1] = 5 / 10 / 15 punti di win%.
    inaccuracy: 5,
    mistake: 10,
    blunder: 15,
    // Nostro: Lichess non ha queste categorie.
    excellentMaxLoss: 2, // sotto questa perdita: Excellent; tra questa e "inaccuracy": Good
    // Lichess, quando c'è di mezzo un matto (regole "MateAdvice"):
    mate: Object.freeze({
      inaccuracyBeyondCp: 999, // matto perso ma resta > +999 cp → Inaccuracy
      mistakeBeyondCp: 700, //    matto perso ma resta > +700 cp → Mistake, altrimenti Blunder
    }),
    // Nostro: Great = unica mossa buona.
    great: Object.freeze({
      minGapToSecond: 10, // la seconda linea del motore è peggiore di almeno 10 punti di win%
      excludeRecaptures: true, // non contano le ricatture ovvie sulla casa appena catturata
    }),
    // Nostro: Brilliant = sacrificio corretto.
    brilliant: Object.freeze({
      maxLoss: 2, // la mossa è la migliore o quasi (perdita < 2 punti)
      minSacrifice: 2, // materiale ceduto, in pedoni (2 = almeno la qualità)
      pvPlies: 4, // semimosse della linea del motore dopo la mossa su cui misurare il materiale
      minWinAfter: 40, // dopo il sacrificio chi muove non è in posizione persa
      maxWinBefore: 95, // non conta se la partita era già ampiamente vinta…
      allowWhenMating: true, // …a meno che il sacrificio porti a un matto forzato
    }),
  }),

  // Spiegazioni (fase 4): fatti ricavati dalle linee del motore (src/analysis/explain.js).
  explanations: Object.freeze({
    minMaterial: 1, // differenza minima di materiale (in pedoni) per parlare di materiale perso/vinto
    materialPlies: 4, // semimosse della linea del motore da giocare dopo la mossa prima di misurare
    maxPlies: 10, // limite, se lo scambio continua (catture consecutive)
    forkMinValue: 3, // bersagli di una forchetta: pezzi da 3 in su, o il re
    linePlies: 6, // semimosse della variante citata
    maxPerMove: 2, // spiegazioni mostrate al massimo per mossa
  }),

  // Valori dei pezzi in pedoni, usati per sacrifici e spiegazioni.
  materialValues: Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }),

  // Impostazioni del motore per l'analisi della partita intera.
  // multiPv ≥ 2 è necessario per riconoscere le mosse "Great".
  gameAnalysis: Object.freeze({
    depth: 14,
    multiPv: 2,
    movetimeMs: null,
  }),

  openings: Object.freeze({
    dataUrl: 'data/openings/openings.json',
    maxPly: 40, // cerca il nome dell'apertura nelle prime 40 semimosse
  }),

  keyMoments: Object.freeze({
    count: 5, // quanti momenti chiave mostrare al massimo
    minSwing: 10, // variazione minima di win% per essere un momento chiave
  }),
});
