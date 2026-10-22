// "Ritenta la mossa": valuta con il motore una mossa alternativa giocata al posto di un errore,
// con le stesse regole della revisione (classifyMove), così il giudizio è coerente con il resto.

import { Chess } from '../../lib/chess.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { playOn, endingOf } from './game-model.js';
import { classifyMove } from './classify.js';
import { positionEval, terminalEval } from './game-analyzer.js';
import { explainMove } from './explain.js';

/** Categorie su cui ha senso proporre "ritenta". */
export const RETRY_CLASSIFICATIONS = Object.freeze(['inaccuracy', 'mistake', 'blunder']);

/**
 * Indici delle mosse da ritentare, in ordine di gioco.
 * @param {{ moves: { classification: string, ply: { color: string } }[] }} analysis
 * @param {'w'|'b'|null} [color] solo le mosse di un colore
 */
export function retryCandidates(analysis, color = null) {
  return analysis.moves
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => RETRY_CLASSIFICATIONS.includes(m.classification) && (!color || m.ply.color === color))
    .map(({ i }) => i);
}

/**
 * Valuta un tentativo.
 * @param {Object} p
 * @param {ReturnType<typeof import('./game-analyzer.js').analyzeGame> extends Promise<infer T> ? T : never} p.analysis
 * @param {number} p.index    indice della mossa che si sta ritentando
 * @param {string | { from: string, to: string, promotion?: string }} p.move
 * @param {import('../engine/engine.js').Engine} p.engine
 * @returns {Promise<null | {
 *   ply: import('./game-model.js').Ply, classification: string, winLoss: number, isBest: boolean,
 *   after: import('./classify.js').PositionEval, improved: boolean
 * }>} null se la mossa non è legale
 */
export async function evaluateAttempt({ analysis, index, move, engine }) {
  const original = analysis.moves[index];
  const result = await judgeMove({
    fenBefore: original.ply.fenBefore,
    before: original.before,
    prevPly: analysis.moves[index - 1]?.ply ?? null,
    settings: analysis.settings,
    move,
    engine,
    index,
  });
  return result && { ...result, improved: result.winLoss < original.winLoss };
}

/**
 * Giudica una mossa giocata in `fenBefore` con le regole della revisione: il motore analizza la posizione dopo
 * (stesse impostazioni) e classifyMove la confronta con `before` (l'analisi già fatta della posizione prima).
 * Usata da "ritenta la mossa" e dagli esercizi "I tuoi errori".
 * @returns {Promise<null | { ply, after, classification: string, winLoss: number, isBest: boolean, explanations }>}
 *   null se la mossa non è legale
 */
export async function judgeMove({ fenBefore, before, prevPly = null, settings, move, engine, index = 0 }) {
  const chess = new Chess(fenBefore);
  const ply = playOn(chess, move, index);
  if (!ply) return null;

  const ending = endingOf(chess);
  // Memoria del motore vuota: lo stesso tentativo riceve sempre lo stesso giudizio.
  if (!ending) await engine.newGame();
  const after = ending
    ? terminalEval(ply.fenAfter, ending)
    : positionEval(await engine.analyze(ply.fenAfter, { ...(settings ?? ANALYSIS_CONFIG.gameAnalysis), exactCache: true }));
  const c = classifyMove({ ply, prevPly, before, after, isBook: false });
  return {
    ply,
    after,
    classification: c.classification,
    winLoss: c.winLoss,
    isBest: c.isBest,
    explanations: explainMove({ ply, before, after, classification: c.classification }),
  };
}
