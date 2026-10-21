// Problemi (fase F): lettura del database di Lichess, regole di verifica con Stockfish (usate da
// scripts/build-puzzles.mjs e dai test) e controllo delle mosse dell'utente (usato dall'interfaccia).
// Solo dati: nessun accesso a DOM, rete o motore.

import { Chess } from '../../lib/chess.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { toPov } from '../engine/score.js';
import { winPercent } from './winpct.js';
import { uciToMove } from './game-model.js';

/**
 * @typedef {{ id: string, fen: string, moves: string[], rating: number, ratingDeviation: number,
 *   popularity: number, plays: number, themes: string[], gameUrl: string }} PuzzleRow
 */

/**
 * Una riga del CSV di Lichess:
 * PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags[,DailyDate]
 * @returns {PuzzleRow|null} null per l'intestazione o una riga non valida
 */
export function parsePuzzleRow(line) {
  const f = line.split(',');
  if (f.length < 9 || f[0] === 'PuzzleId') return null;
  const n = (s) => Number(s);
  const row = {
    id: f[0], fen: f[1], moves: f[2].split(' ').filter(Boolean),
    rating: n(f[3]), ratingDeviation: n(f[4]), popularity: n(f[5]), plays: n(f[6]),
    themes: f[7].split(' ').filter(Boolean), gameUrl: f[8],
  };
  if (row.moves.length < 2 || [row.rating, row.ratingDeviation, row.popularity, row.plays].some(Number.isNaN)) return null;
  return row;
}

/** Gioca una mossa UCI; restituisce la mossa (verbose di chess.js) o null se illegale. */
export function playUci(chess, uci) {
  try {
    return chess.move(uciToMove(uci));
  } catch {
    return null;
  }
}

/**
 * Posizione da cui parte chi risolve: nel database la prima mossa è dell'avversario.
 * @param {{ fen: string, moves: string[] }} p
 * @returns {{ fen: string, lastMove: {from:string,to:string}, color: 'w'|'b', solution: string[] }|null}
 */
export function puzzleStart(p) {
  const c = new Chess(p.fen);
  const m = playUci(c, p.moves[0]);
  if (!m) return null;
  return { fen: c.fen(), lastMove: { from: m.from, to: m.to }, color: c.turn(), solution: p.moves.slice(1) };
}

const givesMate = (fen, uci) => {
  const c = new Chess(fen);
  return !!playUci(c, uci) && c.isCheckmate();
};

/**
 * La mossa dell'utente è giusta? Come su Lichess, la soluzione è unica, tranne all'ultima mossa:
 * lì vale qualsiasi mossa che dà scacco matto.
 * @param {string} fen posizione prima della mossa
 * @param {string} expected mossa della soluzione (UCI)
 * @param {string} played mossa dell'utente (UCI, con la promozione se c'è)
 * @param {boolean} isFinal è l'ultima mossa della soluzione
 */
export function isCorrectAttempt(fen, expected, played, isFinal) {
  if (played === expected) return true;
  return isFinal && givesMate(fen, played);
}

/**
 * Verifica una mossa di chi risolve con l'analisi del motore della posizione prima della mossa.
 * Regole (nostre, parametri in ANALYSIS_CONFIG.puzzles):
 *  - la mossa della soluzione è la prima linea del motore; all'ultima mossa basta che dia matto;
 *  - è l'unica mossa buona: la 2ª linea perde almeno minGap punti di win%. Se la 1ª linea è un matto,
 *    la 2ª non deve essere un matto altrettanto veloce (un matto più lento non rende ambigua la soluzione).
 * @param {{ lines: Array<{ score: {cp:number|null, mate:number|null}, pv: string[] }> }} result analisi MultiPV ≥ 2
 * @param {string} fen
 * @param {string} expected
 * @param {boolean} isFinal
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifySolverMove(result, fen, expected, isFinal, cfg = ANALYSIS_CONFIG.puzzles) {
  if (!result.lines.length) return { ok: false, reason: 'nessuna linea del motore' };
  if (isFinal && givesMate(fen, expected)) return { ok: true };
  if (result.lines[0].pv[0] !== expected) return { ok: false, reason: 'non è la prima scelta del motore' };
  const second = result.lines[1];
  if (!second) return { ok: true }; // unica mossa legale (o unica considerata)
  const color = new Chess(fen).turn();
  const s1 = toPov(result.lines[0].score, color);
  const s2 = toPov(second.score, color);
  if (s1.mate != null && s1.mate > 0) {
    if (s2.mate != null && s2.mate > 0 && s2.mate <= s1.mate) return { ok: false, reason: 'un\'altra mossa dà matto altrettanto veloce' };
    return { ok: true };
  }
  if (winPercent(s1) - winPercent(s2) < cfg.minGap) return { ok: false, reason: 'non è l\'unica mossa buona' };
  return { ok: true };
}

/**
 * Verifica una risposta dell'avversario (giocata in automatico dall'app): deve essere la prima linea del motore
 * o perdere al massimo replyTolerance punti di win% rispetto a essa.
 * @param {{ lines: Array<{ score: {cp:number|null, mate:number|null}, pv: string[] }> }} result analisi MultiPV
 */
export function verifyReply(result, fen, reply, cfg = ANALYSIS_CONFIG.puzzles) {
  if (!result.lines.length) return { ok: false, reason: 'nessuna linea del motore' };
  if (result.lines[0].pv[0] === reply) return { ok: true };
  const line = result.lines.find((l) => l.pv[0] === reply);
  if (!line) return { ok: false, reason: 'la risposta dell\'avversario non è tra le migliori del motore' };
  const color = new Chess(fen).turn();
  const loss = winPercent(toPov(result.lines[0].score, color)) - winPercent(toPov(line.score, color));
  return loss <= cfg.replyTolerance ? { ok: true } : { ok: false, reason: 'la risposta dell\'avversario non è la migliore' };
}

/**
 * Tema principale: il primo, nell'ordine di priorità dato, tra i temi assegnati da Lichess.
 * @param {string[]} themes
 * @param {string[]} priority
 */
export const primaryTheme = (themes, priority) => priority.find((t) => themes.includes(t)) ?? null;

/** Fascia di difficoltà per il punteggio Lichess. @param {Array<{id:string,min:number,max:number}>} levels */
export const levelOf = (rating, levels) => levels.find((l) => rating >= l.min && rating < l.max)?.id ?? null;
