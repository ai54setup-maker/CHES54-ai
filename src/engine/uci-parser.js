// Lettura delle righe di testo del protocollo UCI prodotte da Stockfish.
// Funzioni pure: nessun worker, nessun DOM, quindi testabili in Node.

/**
 * Punteggio così come lo dà UCI: dal punto di vista di CHI MUOVE nella posizione analizzata.
 * Esattamente uno tra cp e mate è un numero.
 * @typedef {{ cp: number|null, mate: number|null }} RawScore
 */

/**
 * @typedef {Object} UciInfo
 * @property {number} multipv   indice della linea (1 = migliore)
 * @property {number|null} depth
 * @property {number|null} seldepth
 * @property {number|null} nodes
 * @property {number|null} timeMs
 * @property {RawScore|null} score
 * @property {'lower'|'upper'|null} bound  valutazione parziale (non definitiva) se non null
 * @property {string[]} pv      mosse in formato UCI (es. "e2e4", "e7e8q")
 */

const toInt = (s) => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Interpreta una riga "info ...". Restituisce null per righe che non sono "info"
 * o che sono messaggi testuali ("info string ...").
 * @param {string} line
 * @returns {UciInfo|null}
 */
export function parseInfoLine(line) {
  const t = line.trim().split(/\s+/);
  if (t[0] !== 'info') return null;
  /** @type {UciInfo} */
  const info = { multipv: 1, depth: null, seldepth: null, nodes: null, timeMs: null, score: null, bound: null, pv: [] };
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'string':
        return null;
      case 'depth': info.depth = toInt(t[++i]); break;
      case 'seldepth': info.seldepth = toInt(t[++i]); break;
      case 'multipv': info.multipv = toInt(t[++i]) ?? 1; break;
      case 'nodes': info.nodes = toInt(t[++i]); break;
      case 'time': info.timeMs = toInt(t[++i]); break;
      case 'score': {
        const kind = t[++i];
        const val = toInt(t[++i]);
        if (val == null) break;
        if (kind === 'cp') info.score = { cp: val, mate: null };
        else if (kind === 'mate') info.score = { cp: null, mate: val };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          info.bound = t[++i] === 'lowerbound' ? 'lower' : 'upper';
        }
        break;
      }
      case 'wdl': i += 3; break;
      case 'pv':
        info.pv = t.slice(i + 1);
        i = t.length;
        break;
      default:
        break; // campi che non usiamo (nps, hashfull, tbhits, currmove…)
    }
  }
  return info;
}

/**
 * Interpreta "bestmove e2e4 [ponder e7e5]". Per le posizioni senza mosse legali
 * Stockfish risponde "bestmove (none)": in quel caso bestMove è null.
 * @param {string} line
 * @returns {{ bestMove: string|null, ponder: string|null } | null}
 */
export function parseBestMoveLine(line) {
  const t = line.trim().split(/\s+/);
  if (t[0] !== 'bestmove') return null;
  const bestMove = t[1] && t[1] !== '(none)' ? t[1] : null;
  const ponder = t[2] === 'ponder' && t[3] ? t[3] : null;
  return { bestMove, ponder };
}

/**
 * Una riga info è utilizzabile come linea definitiva se ha profondità, punteggio esatto
 * (non lowerbound/upperbound) e almeno una mossa nella variante.
 * @param {UciInfo|null} info
 */
export function isCompleteLine(info) {
  return !!info && info.depth != null && !!info.score && !info.bound && info.pv.length > 0;
}
