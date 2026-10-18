// Testo italiano delle spiegazioni (i fatti vengono da src/analysis/explain.js).
// Nessuna logica scacchistica qui: solo formulazione. Funzioni pure, usabili anche da terminale.

import { formatScore } from '../engine/score.js';
import { numberedLine, uciLineToSan } from './notation.js';

const NAME = { p: 'il pedone', n: 'il cavallo', b: "l'alfiere", r: 'la torre', q: 'la donna', k: 'il re' };
const NAME_CAP = { p: 'Il pedone', n: 'Il cavallo', b: "L'alfiere", r: 'La torre', q: 'La donna', k: 'Il re' };

const at = (x) => `${NAME[x.piece]} in ${x.square}`;
const points = (n) => `${n} ${n === 1 ? 'punto' : 'punti'} di materiale`;
const lose = (n) => (n === 1 ? 'si perde 1 punto di materiale' : `si perdono ${n} punti di materiale`);
const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items.at(-1)}` : items[0] ?? '');

/**
 * @param {import('../analysis/explain.js').Explanation} e
 * @returns {{ text: string, line: string }} line = variante citata, in SAN italiana numerata
 */
export function formatExplanation(e) {
  const line = numberedLine(e.line.fen, e.line.pv);
  switch (e.kind) {
    case 'allowsMate':
      return { text: `Permette all'avversario di dare matto in ${e.mateIn}.`, line };
    case 'missesMate':
      return { text: `C'era un matto forzato in ${e.mateIn}.`, line };
    case 'allowsFork':
      return { text: `Permette una forchetta: ${at(e.forker)} attacca ${list(e.targets.map(at))}: ${lose(e.loss)}.`, line };
    case 'hangs':
      return { text: `${NAME_CAP[e.piece.piece]} appena mosso in ${e.piece.square} resta in presa: ${lose(e.loss)}.`.replace(/^(La \S+) appena mosso/, '$1 appena mossa'), line };
    case 'losesMaterial': {
      const caught = e.captured.length ? ` (l'avversario cattura ${list(e.captured.slice(0, 3).map(at))})` : '';
      return { text: `Perde ${points(e.loss)}${caught}.`, line };
    }
    case 'missesMaterial':
      return { text: `La mossa migliore guadagnava ${points(e.gain)} in più.`, line };
    case 'sacrifice':
      return { text: `Sacrifica ${points(e.amount)}, e la linea del motore mostra che il sacrificio funziona.`, line };
    case 'onlyMove': {
      const second = uciLineToSan(e.line.fen, [e.secondUci])[0] ?? e.secondUci;
      return { text: `Unica mossa buona: la seconda scelta del motore, ${second}, vale ${formatScore(e.secondScore)} contro ${formatScore(e.bestScore)}.`, line };
    }
    default:
      return { text: '', line };
  }
}
