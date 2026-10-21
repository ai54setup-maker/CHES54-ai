// Lezioni (fase G): controlli statici dei passi (legalità, scacco, matto, stallo, attacchi, inchiodature) e
// risposta agli esercizi. I controlli con Stockfish degli esercizi sono in scripts/check-lessons.mjs.
// Solo dati: nessun accesso a DOM, rete o motore.

import { Chess } from '../../lib/chess.js';
import { playUci, isCorrectAttempt } from './puzzle.js';

/**
 * @typedef {{ kind: 'explain', title: string, text: string, fen: string, demo?: string[],
 *   arrows?: string[][], marks?: string[],
 *   check?: { mate?: boolean, stalemate?: boolean, inCheck?: boolean,
 *     attacks?: { from: string, targets: string[] }, pinned?: string, defended?: string, undefended?: string } }} ExplainStep
 * @typedef {{ kind: 'exercise', text: string, fen: string, solution?: string[], accept?: string[],
 *   tactic?: string, mate?: boolean, success: string }} ExerciseStep
 */

/** Posizione alla fine della dimostrazione di un passo (o la posizione del passo, senza dimostrazione). */
export function demoPosition(step) {
  const c = new Chess(step.fen);
  const moves = [];
  for (const uci of step.demo ?? []) {
    const m = playUci(c, uci);
    if (!m) return null;
    moves.push(m);
  }
  return { chess: c, moves };
}

/** chess.js accetta anche posizioni in cui chi NON deve muovere è sotto scacco (illegali): Stockfish no. */
export function opponentInCheck(fen) {
  const f = fen.split(' ');
  f[1] = f[1] === 'w' ? 'b' : 'w';
  f[3] = '-';
  try {
    return new Chess(f.join(' ')).inCheck();
  } catch {
    return false;
  }
}

/** Il pezzo in `square` ha meno mosse legali di quante ne avrebbe senza l'inchiodatura (cioè senza il re dietro). */
function isPinned(c, square) {
  const piece = c.get(square);
  if (!piece || piece.type === 'k' || piece.color !== c.turn()) return false;
  const legal = c.moves({ square, verbose: true }).length;
  // Stessa posizione senza il re del pezzo: le mosse vietate dall'inchiodatura tornano possibili.
  // (chess.js accetta posizioni senza re solo con skipValidation, quindi si contano le mosse "pseudo-legali".)
  const free = new Chess();
  free.load(c.fen(), { skipValidation: true });
  const king = c.board().flat().find((p) => p && p.type === 'k' && p.color === piece.color);
  free.remove(king.square);
  return free.moves({ square, verbose: true }).length > legal;
}

/**
 * Controlli che non richiedono il motore. Restituisce l'elenco dei problemi trovati (vuoto = tutto a posto).
 * @param {ExplainStep|ExerciseStep} step
 */
export function staticErrors(step) {
  const errors = [];
  try {
    new Chess(step.fen);
  } catch (e) {
    return [`FEN non valida: ${e.message}`];
  }
  if (opponentInCheck(step.fen)) return ['posizione illegale: il lato che non muove è sotto scacco'];
  const squares = /^[a-h][1-8]$/;
  for (const a of step.arrows ?? []) if (a.length !== 2 || !a.every((s) => squares.test(s))) errors.push(`freccia non valida: ${a}`);
  for (const s of step.marks ?? []) if (!squares.test(s)) errors.push(`casa non valida: ${s}`);

  if (step.kind === 'explain') {
    const d = demoPosition(step);
    if (!d) return [...errors, 'dimostrazione con una mossa illegale'];
    const c = d.chess;
    const ck = step.check ?? {};
    if (ck.mate !== undefined && c.isCheckmate() !== ck.mate) errors.push(`matto atteso: ${ck.mate}`);
    if (ck.stalemate !== undefined && c.isStalemate() !== ck.stalemate) errors.push(`stallo atteso: ${ck.stalemate}`);
    if (ck.inCheck !== undefined && c.inCheck() !== ck.inCheck) errors.push(`scacco atteso: ${ck.inCheck}`);
    if (ck.attacks) {
      const p = c.get(ck.attacks.from);
      if (!p) errors.push(`nessun pezzo in ${ck.attacks.from}`);
      else {
        for (const t of ck.attacks.targets) {
          if (!c.attackers(t, p.color).includes(ck.attacks.from)) errors.push(`${ck.attacks.from} non attacca ${t}`);
        }
      }
    }
    if (ck.pinned && !isPinned(c, ck.pinned)) errors.push(`il pezzo in ${ck.pinned} non è inchiodato`);
    // Difeso / non difeso: un pezzo del suo stesso colore controlla la casa
    for (const [key, want] of [['undefended', false], ['defended', true]]) {
      if (!ck[key]) continue;
      const p = c.get(ck[key]);
      if (!p) errors.push(`nessun pezzo in ${ck[key]}`);
      else if ((c.attackers(ck[key], p.color).length > 0) !== want) errors.push(`il pezzo in ${ck[key]} ${want ? 'non ' : ''}è difeso`);
    }
  } else if (step.kind === 'exercise') {
    if (!!step.solution === !!step.accept) errors.push('un esercizio ha "solution" oppure "accept"');
    const c = new Chess(step.fen);
    if (step.accept) {
      for (const uci of step.accept) if (!playUci(new Chess(step.fen), uci)) errors.push(`mossa accettata illegale: ${uci}`);
    } else if (step.solution) {
      if (step.solution.length % 2 === 0) errors.push('la soluzione deve finire con una mossa di chi risolve');
      for (const uci of step.solution) if (!playUci(c, uci)) { errors.push(`mossa illegale nella soluzione: ${uci}`); break; }
      if (step.mate && !c.isCheckmate()) errors.push('la soluzione non finisce con il matto');
    }
    if (!step.success) errors.push('manca il testo di "success"');
  } else {
    errors.push(`tipo di passo sconosciuto: ${step.kind}`);
  }
  return errors;
}

/**
 * La mossa dell'utente in un esercizio è giusta? Con "accept" vale qualsiasi mossa dell'elenco (tutte verificate
 * con Stockfish); con "solution" valgono le regole dei problemi (unica, tranne un matto all'ultima mossa).
 * @param {ExerciseStep} step
 * @param {number} index indice nella soluzione (0 = prima mossa)
 */
export function isCorrectLessonMove(step, fen, played, index = 0) {
  if (step.accept) return step.accept.includes(played);
  return isCorrectAttempt(fen, step.solution[index], played, index === step.solution.length - 1);
}
