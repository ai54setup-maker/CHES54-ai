// Sezione "Gioca" (partita contro Stockfish): fine della partita con le regole e PGN per la revisione.
// Solo dati: nessun accesso a DOM o motore.

import { Chess } from '../../lib/chess.js';
import { playUci } from './puzzle.js';

/**
 * La partita è finita secondo le regole? (Il Chess deve contenere tutta la storia, per la triplice ripetizione.)
 * @param {Chess} chess
 * @returns {null | { result: '1-0'|'0-1'|'1/2-1/2', reason: 'checkmate'|'stalemate'|'insufficient'|'threefold'|'fifty-moves' }}
 */
export function outcomeOf(chess) {
  if (chess.isCheckmate()) return { result: chess.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', reason: 'fifty-moves' };
  return null;
}

/** Ricostruisce la partita dalle mosse UCI. @returns {Chess|null} null se una mossa non è legale */
export function replay(moves, startFen) {
  const c = startFen ? new Chess(startFen) : new Chess();
  for (const uci of moves) if (!playUci(c, uci)) return null;
  return c;
}

/**
 * PGN della partita per la revisione.
 * @param {{ moves: string[], color: 'w'|'b', level: number, date: string, result: string, termination?: string }} g
 *   date 'AAAA-MM-GG'; result '1-0' | '0-1' | '1/2-1/2' | '*'
 */
export function playPgn(g) {
  const c = replay(g.moves);
  if (!c) throw new Error('Partita non valida');
  const engine = `Stockfish (livello ${g.level})`;
  c.setHeader('Event', 'Partita contro Stockfish');
  c.setHeader('Site', 'CHES54.com');
  c.setHeader('Date', g.date.replace(/-/g, '.'));
  c.setHeader('White', g.color === 'w' ? 'Tu' : engine);
  c.setHeader('Black', g.color === 'b' ? 'Tu' : engine);
  c.setHeader('Result', g.result);
  if (g.termination) c.setHeader('Termination', g.termination);
  return c.pgn();
}
