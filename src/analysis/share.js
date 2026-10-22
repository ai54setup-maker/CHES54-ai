// Condivisione di una revisione con un link: la partita (PGN essenziale) sta compressa nel frammento "#…" dell'indirizzo,
// che il browser non invia al server. Chi apre il link rifà la revisione con le stesse impostazioni (stesso risultato).
// Formato: #r=<z|t><base64url>&d=<profondità>  (z = deflate-raw, t = testo semplice se CompressionStream manca).

import { Chess } from '../../lib/chess.js';

export const MAX_SHARED_PGN = 20000; // caratteri: un link più lungo non serve a una partita reale
const KEEP_HEADERS = ['Event', 'Site', 'Date', 'White', 'Black', 'Result', 'WhiteElo', 'BlackElo', 'TimeControl', 'Termination'];

/**
 * PGN essenziale (intestazioni principali e mosse, senza commenti né orologio) per il link.
 * @param {import('./game-model.js').Game} game
 */
export function sharePgn(game) {
  const c = new Chess(game.startFen);
  for (const p of game.plies) c.move(p.san);
  for (const k of KEEP_HEADERS) if (game.headers?.[k]) c.setHeader(k, game.headers[k]);
  if (game.startFen !== new Chess().fen()) {
    c.setHeader('SetUp', '1');
    c.setHeader('FEN', game.startFen);
  }
  if (game.result) c.setHeader('Result', game.result);
  return c.pgn();
}

const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** @returns {Promise<string>} frammento senza "#" */
export async function encodeShare(pgn, depth) {
  const raw = new TextEncoder().encode(pgn);
  const packed = typeof CompressionStream === 'function'
    ? `z${toB64url(await pipe(raw, new CompressionStream('deflate-raw')))}`
    : `t${toB64url(raw)}`;
  return `r=${packed}${depth ? `&d=${depth}` : ''}`;
}

/**
 * @param {string} hash location.hash (con o senza "#")
 * @returns {Promise<{ pgn: string, depth: number|null }|null>} null se non è un link di revisione valido
 */
export async function decodeShare(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  const r = params.get('r');
  if (!r || r.length > MAX_SHARED_PGN * 2) return null;
  try {
    const bytes = fromB64url(r.slice(1));
    let text;
    if (r[0] === 'z' && typeof DecompressionStream === 'function') text = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')));
    else if (r[0] === 't') text = new TextDecoder().decode(bytes);
    else return null;
    if (!text.trim() || text.length > MAX_SHARED_PGN) return null;
    const d = Number(params.get('d'));
    return { pgn: text, depth: Number.isInteger(d) && d > 0 ? d : null };
  } catch {
    return null;
  }
}
