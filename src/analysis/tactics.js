// Allenatore: suggerimenti tattici DIMOSTRATI dalle linee di Stockfish.
//
// Il motore trova la mossa; qui si dà solo il nome alla tattica, guardando che cosa fa la prima mossa
// della linea (forchetta, inchiodatura, infilata, attacco di scoperta, pezzo in presa) e verificando
// lungo la stessa linea che si guadagna davvero materiale (o che c'è un matto). Senza questa prova
// nessun suggerimento: una "forchetta" che perde materiale non viene mai segnalata.
//
// Due tipi di suggerimento per la posizione mostrata:
//  - occasione: per chi deve muovere, dalla linea migliore (MultiPV ≥ 2 per sapere che è la mossa "unica");
//  - minaccia: cosa farebbe l'avversario se potesse muovere subito (analisi della posizione "a mossa nulla").

import { Chess } from '../../lib/chess.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { toPov } from '../engine/score.js';
import { uciToMove } from './game-model.js';
import { materialAlongLine } from './material.js';
import { winPercent, winPercentFor } from './winpct.js';

const C = ANALYSIS_CONFIG.coach;
const VALUES = ANALYSIS_CONFIG.materialValues;
const KING_VALUE = 100; // solo per confrontare i pezzi su una linea (il re vale più di tutto)
const value = (type) => (type === 'k' ? KING_VALUE : VALUES[type]);
const other = (c) => (c === 'w' ? 'b' : 'w');
const SLIDES = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
SLIDES.q = [...SLIDES.b, ...SLIDES.r];

/**
 * @typedef {{ piece: string, square: string }} PieceAt
 * @typedef {'mate'|'discovered'|'fork'|'pin'|'skewer'|'hanging'|'material'} TacticKind
 * @typedef {Object} Tactic
 * @property {TacticKind} kind
 * @property {string} move          prima mossa della linea (UCI)
 * @property {PieceAt} piece        pezzo che muove
 * @property {PieceAt[]} targets    bersagli (forchetta, scoperta; inchiodatura/infilata: [davanti, dietro]; in presa: il pezzo catturato)
 * @property {PieceAt|null} attacker pezzo che attacca di scoperta
 * @property {number} gain          materiale guadagnato lungo la linea, in pedoni
 * @property {number|null} mateIn
 * @typedef {Tactic & { threat: boolean, side: 'w'|'b', line: { fen: string, pv: string[] } }} Hint
 *   side = chi esegue la tattica; threat = minaccia dell'avversario (non è il suo turno)
 */

/**
 * Posizione uguale ma con il tratto all'avversario (mossa nulla), per vedere che cosa minaccia.
 * null se chi deve muovere è sotto scacco (la mossa nulla non avrebbe senso).
 * @param {string} fen
 */
export function nullMoveFen(fen) {
  const chess = new Chess(fen);
  if (chess.inCheck()) return null;
  const f = fen.split(' ');
  f[1] = other(f[1]);
  f[3] = '-'; // l'en passant vale solo subito dopo la spinta del pedone
  return f.join(' ');
}

/**
 * Nome della tattica eseguita dalla linea `pv` (mosse UCI dal lato che muove in `fen`), oppure null
 * se lungo la linea non si guadagnano almeno C.minMaterial pedoni (misura a scambi conclusi).
 * @param {string} fen
 * @param {string[]} pv
 * @returns {Tactic|null}
 */
export function recognizeTactic(fen, pv) {
  if (!pv.length) return null;
  const before = new Chess(fen);
  const mover = before.turn();
  const mat = materialAlongLine(fen, pv, mover, 1 + C.materialPlies, C.maxPlies);
  const gain = mat.end - mat.start;
  if (!mat.settled || gain < C.minMaterial) return null;

  const after = new Chess(fen);
  let move;
  try {
    move = after.move(uciToMove(pv[0]));
  } catch {
    return null;
  }
  const base = { move: pv[0], piece: { piece: move.promotion ?? move.piece, square: move.to }, attacker: null, gain, mateIn: null };
  const enemy = other(mover);
  const isTarget = (p) => p && p.color === enemy && value(p.type) >= C.minTargetValue;
  const targets = after.board().flat().filter(isTarget);

  // Attacco di scoperta: un altro pezzo, liberato dalla mossa, ora attacca un bersaglio.
  for (const t of targets) {
    const now = after.attackers(t.square, mover).filter((sq) => sq !== move.to);
    const was = new Set(before.attackers(t.square, mover));
    const freed = now.find((sq) => !was.has(sq));
    if (freed) {
      return { ...base, kind: 'discovered', attacker: { piece: after.get(freed).type, square: freed }, targets: [{ piece: t.type, square: t.square }] };
    }
  }
  // Forchetta: il pezzo mosso attacca almeno due bersagli.
  const hit = targets.filter((t) => after.attackers(t.square, mover).includes(move.to));
  if (hit.length >= 2) return { ...base, kind: 'fork', targets: hit.map((t) => ({ piece: t.type, square: t.square })) };
  // Inchiodatura / infilata: il pezzo mosso (alfiere, torre, donna) vede due pezzi avversari in fila.
  const ray = lineThrough(after, move.to, move.piece, enemy);
  if (ray) {
    const [front, back] = ray;
    const kind = value(front.type) < value(back.type) ? 'pin' : 'skewer';
    return { ...base, kind, targets: ray.map((p) => ({ piece: p.type, square: p.square })) };
  }
  // Pezzo in presa: si cattura un pezzo e l'avversario non riprende sulla stessa casa.
  if (move.captured && VALUES[move.captured] >= C.minTargetValue && pv[1]?.slice(2, 4) !== move.to) {
    return { ...base, kind: 'hanging', targets: [{ piece: move.captured, square: move.to }] };
  }
  return { ...base, kind: 'material', targets: [] };
}

/** Due pezzi avversari allineati sulla traiettoria del pezzo in `from` (il secondo da 3 in su o il re). */
function lineThrough(chess, from, type, enemy) {
  const dirs = SLIDES[type];
  if (!dirs) return null;
  const f0 = from.charCodeAt(0) - 97;
  const r0 = Number(from[1]) - 1;
  for (const [df, dr] of dirs) {
    const found = [];
    for (let f = f0 + df, r = r0 + dr; f >= 0 && f < 8 && r >= 0 && r < 8; f += df, r += dr) {
      const p = chess.get(String.fromCharCode(97 + f) + (r + 1));
      if (!p) continue;
      if (p.color !== enemy) break;
      found.push({ ...p, square: String.fromCharCode(97 + f) + (r + 1) });
      if (found.length === 2) break;
    }
    if (found.length === 2 && found.every((p) => value(p.type) >= C.minTargetValue)) return found;
  }
  return null;
}

/**
 * Suggerimenti per la posizione `fen`.
 * @param {Object} p
 * @param {string} p.fen
 * @param {import('./classify.js').PositionEval} p.pe        analisi della posizione (MultiPV ≥ 2)
 * @param {import('./classify.js').PositionEval|null} [p.threat] analisi della posizione a mossa nulla
 * @returns {Hint[]} al massimo C.maxHints, i matti per primi
 */
export function coachHints({ fen, pe, threat = null }) {
  const hints = [];
  const mover = fen.split(' ')[1];
  const opportunity = lineHint(fen, pe.lines, mover, false);
  if (opportunity) hints.push(opportunity);

  const nf = nullMoveFen(fen);
  if (threat && nf && threat.lines.length) {
    const opp = other(mover);
    const t = threat.lines[0];
    const mate = toPov(t.score, opp).mate;
    // Minaccia vera: se l'avversario potesse muovere ora, starebbe molto meglio di adesso.
    const gap = winPercentFor(winPercent(t.score), opp) - winPercentFor(pe.winPct, opp);
    if ((mate != null && mate > 0 && mate <= C.maxMateIn) || gap >= C.threatMinGap) {
      const h = lineHint(nf, threat.lines, opp, true, true);
      if (h) hints.push(h);
    }
  }
  return hints.sort((a, b) => (a.kind === 'mate' ? 0 : 1) - (b.kind === 'mate' ? 0 : 1)).slice(0, C.maxHints);
}

/**
 * Suggerimento dalla linea migliore per `side` (che muove in `fen`).
 * @param {boolean} threat
 * @param {boolean} [skipGap] per le minacce la significatività è già verificata
 */
function lineHint(fen, lines, side, threat, skipGap = false) {
  const best = lines[0];
  if (!best?.pv.length) return null;
  const line = { fen, pv: best.pv.slice(0, C.linePlies) };
  const mate = toPov(best.score, side).mate;
  if (mate != null && mate > 0 && mate <= C.maxMateIn) {
    const chess = new Chess(fen);
    const m = chess.move(uciToMove(best.pv[0]));
    return {
      kind: 'mate', move: best.pv[0], piece: { piece: m.piece, square: m.to }, targets: [], attacker: null,
      gain: 0, mateIn: mate, threat, side, line: { fen, pv: best.pv.slice(0, 2 * mate - 1) },
    };
  }
  if (!skipGap) {
    const second = lines[1];
    if (!second) return null; // una sola mossa legale: niente da scoprire
    const gap = winPercentFor(winPercent(best.score), side) - winPercentFor(winPercent(second.score), side);
    if (gap < C.minGap) return null;
  }
  const tactic = recognizeTactic(fen, best.pv);
  return tactic ? { ...tactic, threat, side, line } : null;
}
