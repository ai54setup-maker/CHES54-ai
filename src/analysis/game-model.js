// Modello della partita: la lista delle semimosse con le posizioni prima e dopo ciascuna.
// È solo un dato: non contiene analisi del motore (quella sta in game-analyzer.js).

import { Chess, DEFAULT_POSITION, validateFen } from '../../lib/chess.js';
import { parsePgn, PgnError } from './pgn.js';

/**
 * @typedef {Object} Ply
 * @property {number} index        0 = prima semimossa della partita
 * @property {number} moveNumber   numero di mossa (1. e4 → 1)
 * @property {'w'|'b'} color       chi ha giocato la mossa
 * @property {string} san          notazione standard (inglese), come la scrive chess.js
 * @property {string} uci          es. "e2e4", "e7e8q"
 * @property {string} from
 * @property {string} to
 * @property {string} piece        p, n, b, r, q, k
 * @property {string|undefined} captured
 * @property {string|undefined} promotion
 * @property {string} fenBefore
 * @property {string} fenAfter
 * @property {string} comment
 * @property {number|null} clock
 */

/**
 * @typedef {Object} Game
 * @property {Record<string,string>} headers
 * @property {string} startFen
 * @property {Ply[]} plies
 * @property {string} result
 * @property {null|'checkmate'|'stalemate'|'insufficient'|'threefold'|'fifty-moves'} ending
 *           come finisce la posizione finale secondo le regole (null = partita non conclusa sulla scacchiera)
 */

/**
 * Costruisce la partita da un testo PGN, verificando la legalità di ogni mossa.
 * @param {string} pgnText
 * @returns {Game}
 */
export function gameFromPgn(pgnText) {
  const parsed = parsePgn(pgnText);
  const { headers } = parsed;
  let startFen = DEFAULT_POSITION;
  if (headers.FEN) {
    const v = validateFen(headers.FEN);
    if (!v.ok) throw new PgnError(`FEN iniziale non valida: ${v.error}`);
    startFen = headers.FEN;
  }
  const chess = new Chess(startFen);
  /** @type {Ply[]} */
  const plies = [];
  for (const [index, mv] of parsed.moves.entries()) {
    const ply = playOn(chess, mv.san, index);
    if (!ply) {
      const num = chess.moveNumber();
      const dots = chess.turn() === 'w' ? '.' : '...';
      throw new PgnError(`Mossa non legale: ${num}${dots} ${mv.san}`);
    }
    plies.push({ ...ply, comment: mv.comment, clock: mv.clock });
  }
  return { headers, startFen, plies, result: parsed.result, ending: endingOf(chess) };
}

/**
 * Gioca una mossa (SAN, anche permissiva, oppure { from, to, promotion }) e ne restituisce la Ply,
 * o null se non è legale. Modifica `chess`.
 * @param {Chess} chess
 * @param {string | { from: string, to: string, promotion?: string }} move
 * @param {number} index
 * @returns {Ply|null}
 */
export function playOn(chess, move, index) {
  const fenBefore = chess.fen();
  let m;
  try {
    m = chess.move(move, { strict: false });
  } catch {
    return null;
  }
  return {
    index,
    moveNumber: Number(fenBefore.split(' ')[5]) || 1,
    color: m.color,
    san: m.san,
    uci: m.from + m.to + (m.promotion ?? ''),
    from: m.from,
    to: m.to,
    piece: m.piece,
    captured: m.captured,
    promotion: m.promotion,
    fenBefore,
    fenAfter: chess.fen(),
    comment: '',
    clock: null,
  };
}

/**
 * Converte una mossa UCI ("e7e8q") nel formato accettato da playOn.
 * @param {string} uci
 */
export const uciToMove = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });

/**
 * Partita vuota da una posizione.
 * @param {string} [startFen]
 * @returns {Game}
 */
export function createGame(startFen = DEFAULT_POSITION) {
  const v = validateFen(startFen);
  if (!v.ok) throw new PgnError(`FEN non valida: ${v.error}`);
  return { headers: {}, startFen, plies: [], result: '*', ending: endingOf(new Chess(startFen)) };
}

/**
 * Ricostruisce la partita con le regole (serve anche per riconoscere ripetizioni e 50 mosse).
 * @param {Game} game
 * @param {number} [upTo] numero di semimosse da tenere
 */
function replay(game, upTo = game.plies.length) {
  const chess = new Chess(game.startFen);
  for (const p of game.plies.slice(0, upTo)) chess.move(uciToMove(p.uci));
  return chess;
}

/**
 * Nuova partita: le prime `count` semimosse di `game`, poi `move`.
 * Le mosse successive vengono scartate (come quando si gioca una variante). Restituisce null
 * se la mossa non è legale.
 * @param {Game} game
 * @param {number} count
 * @param {string | { from: string, to: string, promotion?: string }} move
 * @returns {Game|null}
 */
export function withMoveAt(game, count, move) {
  const chess = replay(game, count);
  const ply = playOn(chess, move, count);
  if (!ply) return null;
  return {
    headers: game.headers,
    startFen: game.startFen,
    plies: [...game.plies.slice(0, count), ply],
    result: '*',
    ending: endingOf(chess),
  };
}

/**
 * La partita troncata alle prime `count` semimosse.
 * @param {Game} game
 * @param {number} count
 * @returns {Game}
 */
export function truncateGame(game, count) {
  return { ...game, plies: game.plies.slice(0, count), result: '*', ending: endingOf(replay(game, count)) };
}

/**
 * Testo PGN della partita (intestazioni comprese).
 * @param {Game} game
 */
export function gameToPgn(game) {
  const chess = new Chess(game.startFen);
  if (game.startFen !== DEFAULT_POSITION) {
    chess.setHeader('SetUp', '1');
    chess.setHeader('FEN', game.startFen);
  }
  for (const [k, v] of Object.entries(game.headers)) if (k !== 'FEN' && k !== 'SetUp') chess.setHeader(k, v);
  for (const p of game.plies) chess.move(uciToMove(p.uci));
  if (game.result && game.result !== '*') chess.setHeader('Result', game.result);
  return chess.pgn();
}

/** @param {Chess} chess */
export function endingOf(chess) {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  if (chess.isThreefoldRepetition()) return 'threefold';
  if (chess.isDrawByFiftyMoves()) return 'fifty-moves';
  return null;
}
