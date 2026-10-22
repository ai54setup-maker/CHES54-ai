// "I tuoi errori": gli Errori e gli Errori gravi di una revisione diventano esercizi personali.
// Un tentativo si giudica con judgeMove (retry.js), cioè con le stesse regole della revisione.
// Ripasso a "scatole": risolto al primo colpo → scatola successiva; sbagliato → si riparte da zero;
// dopo LEARNED_BOX risposte giuste di fila l'esercizio è imparato ed esce dal ripasso.
// Solo dati: nessun accesso a DOM, rete o motore.

import { RETRY_CLASSIFICATIONS } from './retry.js';

export const MISTAKE_CLASSES = Object.freeze(['mistake', 'blunder']);
export const LEARNED_BOX = 3;

/** Analisi di una posizione ridotta all'essenziale per classifyMove (resta in localStorage). */
function slimEval(pe) {
  return {
    fen: pe.fen, score: pe.score, terminal: pe.terminal, winner: pe.winner, winPct: pe.winPct, bestMove: pe.bestMove,
    depth: pe.depth, lines: (pe.lines ?? []).map((l) => ({ multipv: l.multipv, depth: l.depth, score: l.score, pv: l.pv.slice(0, 12) })),
  };
}

const slimPly = (p) => p && { to: p.to, captured: p.captured ?? null, uci: p.uci };

/**
 * Esercizi dagli errori di un colore in una revisione.
 * @param {Awaited<ReturnType<typeof import('./game-analyzer.js').analyzeGame>>} analysis
 * @param {'w'|'b'} color
 * @param {string} label partita di provenienza (es. "Mario – Anna, 2026-10-21")
 */
export function mistakesFromReview(analysis, color, label, now = Date.now()) {
  return analysis.moves
    .map((m, i) => ({ m, prev: analysis.moves[i - 1]?.ply ?? null }))
    .filter(({ m }) => m.ply.color === color && MISTAKE_CLASSES.includes(m.classification) && m.bestMove)
    .map(({ m, prev }) => ({
      id: `${m.ply.fenBefore}|${m.ply.uci}`,
      fen: m.ply.fenBefore,
      moveNumber: m.ply.moveNumber,
      played: m.ply.uci,
      playedSan: m.ply.san,
      best: m.bestMove,
      bestSan: m.bestSan,
      classification: m.classification,
      winLoss: m.winLoss,
      before: slimEval(m.before),
      prevPly: slimPly(prev),
      settings: analysis.settings,
      label,
      addedAt: now,
      box: 0,
      tries: 0,
    }));
}

/**
 * Aggiunge gli esercizi nuovi (senza doppioni) e tiene al massimo `max` esercizi: se servono posti,
 * si tolgono prima quelli già imparati, poi i più vecchi.
 * @returns {{ list: object[], added: number }}
 */
export function mergeMistakes(list, items, max) {
  const ids = new Set(list.map((x) => x.id));
  const fresh = items.filter((x) => !ids.has(x.id));
  let out = [...list, ...fresh];
  if (out.length > max) {
    const order = [...out].sort((a, b) => (b.box >= LEARNED_BOX) - (a.box >= LEARNED_BOX) || a.addedAt - b.addedAt);
    const drop = new Set(order.slice(0, out.length - max).map((x) => x.id));
    out = out.filter((x) => !drop.has(x.id));
  }
  return { list: out, added: fresh.filter((x) => out.includes(x)).length };
}

/** Esercizi da ripassare: non ancora imparati, prima le scatole più basse, poi i più vecchi. */
export const reviewQueue = (list) => list
  .filter((x) => x.box < LEARNED_BOX)
  .sort((a, b) => a.box - b.box || a.addedAt - b.addedAt);

/** Risultato di un ripasso: al primo colpo si sale di scatola, altrimenti si riparte da zero. */
export function recordResult(item, firstTry) {
  return { ...item, box: firstTry ? item.box + 1 : 0, tries: item.tries + 1 };
}

/** Il tentativo giudicato da judgeMove risolve l'esercizio? Sì se non è un'imprecisione o un errore. */
export const isGoodAttempt = (judged) => !!judged && !RETRY_CLASSIFICATIONS.includes(judged.classification);
