// Lettura di file PGN, compresi quelli esportati da Chess.com e Lichess.
//
// Perché un parser nostro: chess.js 1.4 rifiuta due commenti consecutivi dopo una mossa
// ("1... c5 { [%eval 0.5] } { Inaccuracy… }"), formato standard degli export di Lichess.
// Qui leggiamo intestazioni, commenti, varianti (anche annidate, che vengono saltate), NAG e
// risultato; chess.js serve solo per verificare che le mosse siano legali (game-model.js).

import { t } from '../i18n/i18n.js';

/**
 * @typedef {Object} PgnMove
 * @property {string} san        mossa così come scritta (senza !, ?, NAG)
 * @property {string} comment    commento testuale, senza comandi [%clk]/[%eval]
 * @property {number|null} clock secondi rimasti dopo la mossa ([%clk]), se presenti
 * @property {number[]} nags     es. $1 → 1
 */

/**
 * @typedef {Object} ParsedPgn
 * @property {Record<string,string>} headers
 * @property {PgnMove[]} moves
 * @property {string} result   "1-0", "0-1", "1/2-1/2" o "*"
 * @property {string} preComment commento prima della prima mossa
 */

export class PgnError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PgnError';
  }
}

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);
const TAG_LINE = /^\s*\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/;

/**
 * Divide un testo con più partite nelle singole partite (testo grezzo di ciascuna).
 * @param {string} text
 * @returns {string[]}
 */
export function splitPgnGames(text) {
  const lines = normalize(text).split('\n');
  const games = [];
  let current = [];
  let hasMoves = false;
  for (const line of lines) {
    if (line.startsWith('%')) continue; // riga di escape (standard PGN)
    if (TAG_LINE.test(line) && hasMoves) {
      games.push(current.join('\n'));
      current = [];
      hasMoves = false;
    }
    if (!TAG_LINE.test(line) && line.trim()) hasMoves = true;
    current.push(line);
  }
  if (current.join('').trim()) games.push(current.join('\n'));
  return games;
}

/**
 * Legge UNA partita PGN.
 * @param {string} text
 * @returns {ParsedPgn}
 */
export function parsePgn(text) {
  const lines = normalize(text).split('\n').filter((l) => !l.startsWith('%'));
  /** @type {Record<string,string>} */
  const headers = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(TAG_LINE);
    if (!m) break;
    headers[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
  }
  const { moves, result, preComment } = parseMovetext(lines.slice(i).join('\n'));
  // Se il risultato manca nel testo delle mosse, usa quello dell'intestazione.
  const finalResult = result ?? (RESULTS.has(headers.Result) ? headers.Result : '*');
  return { headers, moves, result: finalResult, preComment };
}

/** @param {string} text */
function normalize(text) {
  return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/**
 * @param {string} text
 */
function parseMovetext(text) {
  /** @type {PgnMove[]} */
  const moves = [];
  let result = null;
  let preComment = '';
  let depth = 0; // profondità delle varianti: dentro una variante si salta tutto
  let i = 0;

  const addComment = (raw) => {
    if (depth > 0) return;
    const { comment, clock } = parseComment(raw);
    const last = moves.at(-1);
    if (!last) {
      preComment = joinText(preComment, comment);
      return;
    }
    last.comment = joinText(last.comment, comment);
    if (clock != null) last.clock = clock;
  };

  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '{') {
      const end = text.indexOf('}', i + 1);
      if (end < 0) throw new PgnError(t('Commento non chiuso: manca "}"'));
      addComment(text.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (ch === ';') {
      const end = text.indexOf('\n', i);
      addComment(text.slice(i + 1, end < 0 ? text.length : end));
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') {
      if (depth === 0) throw new PgnError(t('Parentesi ")" senza "(" corrispondente'));
      depth--;
      i++;
      continue;
    }

    // Token: tutto fino al prossimo spazio o carattere speciale
    let j = i;
    while (j < text.length && !/[\s{}();]/.test(text[j])) j++;
    const token = text.slice(i, j);
    i = j;
    if (depth > 0) continue;

    if (RESULTS.has(token)) {
      result = token;
      continue;
    }
    if (/^\$\d+$/.test(token)) {
      moves.at(-1)?.nags.push(Number(token.slice(1)));
      continue;
    }
    // Numero di mossa, eventualmente attaccato alla mossa: "1.", "1...", "12.e4"
    const san = token.replace(/^\d+\.+/, '');
    if (!san) continue;
    if (/^[!?]+$/.test(san)) continue; // annotazione staccata dalla mossa
    if (/^e\.?p\.?$/i.test(san)) continue; // vecchia notazione dell'en passant: "exd6 e.p."
    if (san === '--' || san === 'Z0') throw new PgnError(t('Le mosse nulle ("--") non sono supportate'));
    moves.push({ san: cleanSan(san), comment: '', clock: null, nags: [] });
  }
  if (depth > 0) throw new PgnError(t('Variante non chiusa: manca ")"'));
  return { moves, result, preComment };
}

/** "Nf3!?" → "Nf3"; "0-0" → "O-O" */
function cleanSan(san) {
  return san.replace(/[!?]+$/, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
}

/**
 * Estrae il tempo dal comando [%clk h:mm:ss(.d)] e toglie i comandi [%…] dal testo.
 * @param {string} raw
 */
export function parseComment(raw) {
  let clock = null;
  const clk = raw.match(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/);
  if (clk) clock = Number(clk[1]) * 3600 + Number(clk[2]) * 60 + Number(clk[3]);
  const comment = raw.replace(/\[%[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  return { comment, clock };
}

const joinText = (a, b) => (a && b ? `${a} ${b}` : a || b);
