// Notazione italiana (R = Re, D = Donna, T = Torre, A = Alfiere, C = Cavallo)
// e lettura delle mosse scritte dall'utente.

import { Chess } from '../../lib/chess.js';

const EN_TO_IT = { K: 'R', Q: 'D', R: 'T', B: 'A', N: 'C' };
const IT_TO_EN = { R: 'K', D: 'Q', T: 'R', A: 'B', C: 'N' };

/** "Nf3" -> "Cf3", "exd8=Q+" -> "exd8=D+" */
export function toItalian(san) {
  return san.replace(/[KQRBN]/g, (c) => EN_TO_IT[c]);
}

/** Converte una lista di mosse UCI (e2e4) in SAN italiana partendo da una posizione. */
export function uciLineToSan(fen, uciMoves, max = 99) {
  const c = new Chess(fen);
  const out = [];
  for (const u of uciMoves.slice(0, max)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(toItalian(m.san));
    } catch {
      break;
    }
  }
  return out;
}

/**
 * Linea del motore in SAN italiana con i numeri di mossa: "13. Txd7 Txd7 14. Td1",
 * oppure "9… b5 10. Cxb5" se la linea parte con una mossa del Nero.
 */
export function numberedLine(fen, uciMoves, max = 99) {
  const sans = uciLineToSan(fen, uciMoves, max);
  const [, turn, , , , full] = fen.split(' ');
  let num = Number(full) || 1;
  let white = turn !== 'b';
  const parts = [];
  sans.forEach((san, i) => {
    if (white) parts.push(`${num}. ${san}`);
    else parts.push(i === 0 ? `${num}… ${san}` : san);
    if (!white) num++;
    white = !white;
  });
  return parts.join(' ');
}

const strip = (s) => s.replace(/[+#!?]/g, '');

/**
 * Interpreta il testo scritto dall'utente e restituisce la mossa legale corrispondente
 * ({from, to, promotion}) oppure null. Accetta notazione italiana, inglese e UCI.
 */
export function parseUserMove(chess, text) {
  let t = text.trim().replace(/\s+/g, '').replace(/0/g, 'O').replace(/o/g, 'O');
  if (!t) return null;
  const legal = chess.moves({ verbose: true });

  // UCI / coordinate: d2d3, d2-d3, e7e8d (promozione anche in italiano)
  const uci = t.toLowerCase().match(/^([a-h][1-8])[-x]?([a-h][1-8])([qrbndtac])?$/);
  if (uci) {
    const promo = uci[3] ? ({ d: 'q', t: 'r', a: 'b', c: 'n' }[uci[3]] || uci[3]) : undefined;
    const m = legal.find((l) => l.from === uci[1] && l.to === uci[2] && (!l.promotion || l.promotion === (promo || 'q')));
    if (m) return { from: m.from, to: m.to, promotion: m.promotion };
  }

  // Accetta "=" opzionale nella promozione: e8D -> e8=D
  t = t.replace(/([a-h][18])([DTACQRBN])$/, '$1=$2');

  const candidates = [
    t.replace(/^([RDTAC])/, (c) => IT_TO_EN[c]).replace(/=([DTAC])/, (_, c) => '=' + IT_TO_EN[c]), // italiano
    t, // inglese
  ];
  for (const cand of candidates) {
    const want = strip(cand);
    const m = legal.find((l) => strip(l.san) === want);
    if (m) return { from: m.from, to: m.to, promotion: m.promotion };
  }
  // Ultimo tentativo con il parser permissivo di chess.js (es. "Ng1f3", "Pd3")
  for (const cand of candidates) {
    try {
      const m = new Chess(chess.fen()).move(cand, { strict: false });
      if (m) return { from: m.from, to: m.to, promotion: m.promotion };
    } catch { /* mossa non valida */ }
  }
  return null;
}
