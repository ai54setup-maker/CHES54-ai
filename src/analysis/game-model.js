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
    const fenBefore = chess.fen();
    let m;
    try {
      m = chess.move(mv.san, { strict: false });
    } catch {
      const num = chess.moveNumber();
      const dots = chess.turn() === 'w' ? '.' : '...';
      throw new PgnError(`Mossa non legale: ${num}${dots} ${mv.san}`);
    }
    plies.push({
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
      comment: mv.comment,
      clock: mv.clock,
    });
  }
  return { headers, startFen, plies, result: parsed.result, ending: endingOf(chess) };
}

/** @param {Chess} chess */
function endingOf(chess) {
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  if (chess.isThreefoldRepetition()) return 'threefold';
  if (chess.isDrawByFiftyMoves()) return 'fifty-moves';
  return null;
}
