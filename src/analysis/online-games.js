// Import delle partite da Lichess e Chess.com tramite le loro API pubbliche (nessun login, nessun server nostro).
// Qui ci sono solo indirizzi e lettura dei dati; le richieste di rete sono in src/ui/online-games.js.

import { splitPgnGames } from './pgn.js';
import { t, fmtNum } from '../i18n/i18n.js';

/** Nomi utente ammessi da Lichess e Chess.com: lettere, cifre, "_" e "-". Il controllo evita di manipolare l'URL. */
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/;

/** @returns {string|null} nome utente pulito, oppure null se non valido */
export function normalizeUser(text) {
  const u = String(text ?? '').trim();
  return USERNAME.test(u) ? u : null;
}

export const SOURCES = Object.freeze({
  lichess: Object.freeze({
    label: 'Lichess',
    // Le partite in PGN, dalla più recente. Serve "Accept: application/x-chess-pgn" (altrimenti risponde una pagina HTML).
    gamesUrl: (user, max) => `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&clocks=false&evals=false&opening=true`,
  }),
  chesscom: Object.freeze({
    label: 'Chess.com',
    // Elenco degli archivi mensili; le partite di un mese sono in JSON (campo pgn per ciascuna).
    archivesUrl: (user) => `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`,
  }),
});

/** Ultimi `n` archivi mensili di Chess.com, dal più recente. Accetta solo indirizzi di api.chess.com. */
export function recentArchives(archives, n) {
  return (archives ?? [])
    .filter((u) => typeof u === 'string' && u.startsWith('https://api.chess.com/pub/player/'))
    .slice(-n)
    .reverse();
}

/** Partite di un mese di Chess.com, dalla più recente; solo scacchi standard (niente varianti). */
export function chessComPgns(monthJson) {
  return (monthJson?.games ?? [])
    .filter((g) => g.rules === 'chess' && typeof g.pgn === 'string')
    .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
    .map((g) => g.pgn);
}

const TAG = /^\s*\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm;

/** Intestazioni di una partita PGN (senza leggere le mosse). */
export function pgnHeaders(pgn) {
  const h = {};
  for (const m of pgn.matchAll(TAG)) h[m[1]] = m[2].replace(/\\(.)/g, '$1');
  return h;
}

/** "180" → "3 min", "600+5" → "10+5", "1/86400" → "1 giorno a mossa" */
export function timeControlLabel(tc) {
  if (!tc || tc === '-') return '';
  const daily = /^1\/(\d+)$/.exec(tc);
  if (daily) {
    const days = Math.round(Number(daily[1]) / 86400);
    return t(days === 1 ? '{n} giorno a mossa' : '{n} giorni a mossa', { n: days });
  }
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc);
  if (!m) return tc;
  const min = Number(m[1]) / 60;
  const base = Number.isInteger(min) ? String(min) : fmtNum(min);
  return m[2] && m[2] !== '0' ? `${base}+${m[2]}` : `${base} min`;
}

/**
 * Riassunto delle partite per l'elenco.
 * @param {string[]} pgns
 * @param {string} user nome cercato (per sapere con che colore ha giocato)
 */
export function summarize(pgns, user) {
  const me = user.toLowerCase();
  return pgns.map((pgn) => {
    const h = pgnHeaders(pgn);
    const color = h.White?.toLowerCase() === me ? 'w' : h.Black?.toLowerCase() === me ? 'b' : null;
    return {
      pgn,
      white: h.White ?? '?', black: h.Black ?? '?',
      whiteElo: h.WhiteElo ?? '', blackElo: h.BlackElo ?? '',
      result: h.Result ?? '*',
      date: (h.UTCDate ?? h.Date ?? '').replace(/\./g, '-'),
      timeControl: timeControlLabel(h.TimeControl),
      opening: h.Opening ?? '',
      url: h.Link ?? h.Site ?? '',
      color,
    };
  });
}

/** Divide il PGN di Lichess (più partite in fila) nelle singole partite. */
export const lichessPgns = (text) => splitPgnGames(text).filter((g) => g.trim());
