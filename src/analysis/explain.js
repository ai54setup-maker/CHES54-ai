// Spiegazioni delle mosse ricavate SOLO dalle linee del motore.
//
// Per ogni mossa si confrontano due varianti di Stockfish:
//  - R: la mossa giocata seguita dalla risposta migliore dell'avversario (linea della posizione dopo);
//  - B: la linea migliore nella posizione prima (cosa avrebbe giocato il motore).
// Da queste si ricavano fatti verificabili (matto concesso o mancato, materiale perso, forchetta,
// sacrificio, unica mossa). Ogni fatto contiene la variante che lo dimostra; il testo italiano
// viene prodotto dall'interfaccia (src/ui/explanations.js). Se nessun fatto è dimostrabile dalla
// linea, non si restituisce nulla.

import { Chess } from '../../lib/chess.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { uciToMove } from './game-model.js';
import { materialAlongLine } from './material.js';
import { povView, materialSacrificed } from './classify.js';

const X = ANALYSIS_CONFIG.explanations;
const VALUES = ANALYSIS_CONFIG.materialValues;
const ERRORS = ['inaccuracy', 'mistake', 'blunder'];

/**
 * @typedef {{ fen: string, pv: string[] }} CitedLine  variante citata: mosse UCI a partire da fen
 * @typedef {{ piece: string, square: string }} PieceAt
 * @typedef {(
 *   { kind: 'allowsMate', mateIn: number, line: CitedLine } |
 *   { kind: 'missesMate', mateIn: number, line: CitedLine } |
 *   { kind: 'allowsFork', forker: PieceAt, targets: PieceAt[], loss: number, line: CitedLine } |
 *   { kind: 'hangs', piece: PieceAt, loss: number, line: CitedLine } |
 *   { kind: 'losesMaterial', loss: number, captured: PieceAt[], line: CitedLine } |
 *   { kind: 'missesMaterial', gain: number, line: CitedLine } |   gain = materiale in più rispetto alla mossa giocata
 *   { kind: 'sacrifice', amount: number, line: CitedLine } |
 *   { kind: 'onlyMove', secondUci: string, secondScore: object, bestScore: object, line: CitedLine }
 * )} Explanation
 */

/**
 * @param {{ ply: import('./game-model.js').Ply, before: import('./classify.js').PositionEval,
 *           after: import('./classify.js').PositionEval, classification: string }} m
 * @returns {Explanation[]}
 */
export function explainMove(m) {
  const { ply, before, after, classification } = m;
  const facts = [];
  const color = ply.color;
  const refutation = after.lines[0]?.pv ?? []; // risposta migliore dell'avversario
  const playedLine = [ply.uci, ...refutation];
  const bestLine = before.lines[0]?.pv ?? [];
  const cite = (pv, plies = X.linePlies) => ({ fen: ply.fenBefore, pv: pv.slice(0, plies) });

  if (ERRORS.includes(classification)) {
    const vb = povView(before, color);
    const va = povView(after, color);
    // Matto concesso: dopo la mossa l'avversario ha un matto forzato (che prima non c'era)
    if (va.kind === 'mate' && va.n < 0 && !(vb.kind === 'mate' && vb.n < 0)) {
      const n = -va.n;
      facts.push({ kind: 'allowsMate', mateIn: n, line: cite(playedLine, 1 + 2 * n - 1) });
    }
    // Matto mancato: prima c'era un matto forzato, dopo non più
    if (vb.kind === 'mate' && vb.n > 0 && !(va.kind === 'mate' && va.n > 0) && va.kind !== 'mating') {
      facts.push({ kind: 'missesMate', mateIn: vb.n, line: cite(bestLine, 2 * vb.n - 1) });
    }
    facts.push(...materialFacts(ply, playedLine, bestLine, cite));
  }

  if (classification === 'brilliant') {
    const amount = materialSacrificed(ply.fenBefore, ply.uci, refutation);
    if (amount > 0) facts.push({ kind: 'sacrifice', amount, line: cite(playedLine) });
  }
  if (classification === 'great' && before.lines.length >= 2) {
    facts.push({
      kind: 'onlyMove',
      secondUci: before.lines[1].pv[0],
      secondScore: before.lines[1].score,
      bestScore: before.lines[0].score,
      line: { fen: ply.fenBefore, pv: before.lines[1].pv.slice(0, X.linePlies) },
    });
  }
  return facts.slice(0, X.maxPerMove);
}

/**
 * Materiale perso con la mossa giocata rispetto alla linea migliore, e come (forchetta, pezzo
 * lasciato in presa, catture), oppure materiale che la linea migliore avrebbe vinto.
 */
function materialFacts(ply, playedLine, bestLine, cite) {
  const color = ply.color;
  const min = 1 + X.materialPlies;
  const played = materialAlongLine(ply.fenBefore, playedLine, color, min, X.maxPlies);
  const best = bestLine.length ? materialAlongLine(ply.fenBefore, bestLine, color, min, X.maxPlies) : null;
  // Solo misure affidabili (scambi conclusi): altrimenti nessuna spiegazione sul materiale.
  if (!played.settled || (best && !best.settled)) return [];
  const loss = played.start - played.end;
  const bestLoss = best ? best.start - best.end : 0;
  if (loss - bestLoss < X.minMaterial) return [];

  const line = cite(playedLine, Math.max(X.linePlies, played.played));
  if (loss >= X.minMaterial) {
    const fork = findFork(ply, playedLine);
    if (fork) return [{ kind: 'allowsFork', ...fork, loss, line }];
    const theirs = played.captures.filter((c) => c.by !== color);
    const first = theirs[0];
    const moved = ply.promotion ?? ply.piece;
    // "In presa": l'avversario cattura il pezzo appena mosso e si perde almeno il suo valore
    if (first && first.square === ply.to && first.piece === moved && loss >= VALUES[moved]) {
      return [{ kind: 'hangs', piece: { piece: first.piece, square: first.square }, loss, line }];
    }
    return [{ kind: 'losesMaterial', loss, captured: theirs.map((c) => ({ piece: c.piece, square: c.square })), line }];
  }
  // La mossa non perde materiale, ma quella migliore ne guadagnava di più (differenza tra le due linee)
  if (bestLoss < 0) return [{ kind: 'missesMaterial', gain: loss - bestLoss, line: cite(bestLine, Math.max(X.linePlies, best.played)) }];
  return [];
}

/**
 * Forchetta: la prima risposta dell'avversario nella linea del motore porta un pezzo ad attaccare
 * almeno due pezzi di chi ha mosso (re compreso, o pezzi da forkMinValue in su).
 */
function findFork(ply, playedLine) {
  if (playedLine.length < 2) return null;
  const chess = new Chess(ply.fenBefore);
  try {
    chess.move(uciToMove(playedLine[0]));
    chess.move(uciToMove(playedLine[1]));
  } catch {
    return null;
  }
  const sq = playedLine[1].slice(2, 4);
  const forker = chess.get(sq);
  if (!forker) return null;
  const targets = chess.board().flat()
    .filter((p) => p && p.color === ply.color && (p.type === 'k' || VALUES[p.type] >= X.forkMinValue))
    .filter((p) => chess.attackers(p.square, forker.color).includes(sq))
    .map((p) => ({ piece: p.type, square: p.square }));
  return targets.length >= 2 ? { forker: { piece: forker.type, square: sq }, targets } : null;
}
