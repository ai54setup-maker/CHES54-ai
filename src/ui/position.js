// Funzioni comuni alle scacchiere di Problemi e Lezioni: pezzi da disegnare, casa del re sotto scacco,
// risposta del motore a una mossa sbagliata.

import { formatScore } from '../engine/score.js';
import { numberedLine } from './notation.js';

/** Pezzi nel formato di Board.setPosition. @param {import('../../lib/chess.js').Chess} c */
export const piecesOf = (c) => c.board().flat().filter(Boolean);

/** Casa del re sotto scacco, oppure null. */
export const checkSquareOf = (c) => (c.inCheck() ? piecesOf(c).find((p) => p.type === 'k' && p.color === c.turn())?.square ?? null : null);

/**
 * Come risponde il motore nella posizione dopo una mossa sbagliata.
 * @param {import('../engine/engine.js').Engine} engine
 * @returns {Promise<{ line: string, score: string, depth: number, move: string }|null>} null se non ci sono linee
 */
export async function refutation(engine, fen, depth) {
  engine.cancelAll();
  const r = await engine.analyze(fen, { depth, multiPv: 1, movetimeMs: null });
  if (!r.lines.length) return null;
  const best = r.lines[0];
  return { line: numberedLine(fen, best.pv, 4), score: formatScore(best.score), depth: best.depth, move: best.pv[0] };
}
