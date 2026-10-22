// Testo italiano delle spiegazioni (i fatti vengono da src/analysis/explain.js).
// Nessuna logica scacchistica qui: solo formulazione. Funzioni pure, usabili anche da terminale.

import { formatScore } from '../engine/score.js';
import { numberedLine, uciLineToSan } from './notation.js';
import { getLang } from '../i18n/i18n.js';

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
  if (getLang() === 'en') return { text: explanationEn(e), line };
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

// ---------- English ----------
const NAME_EN = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const atEn = (x) => `the ${NAME_EN[x.piece]} on ${x.square}`;
const pointsEn = (n) => `${n} ${n === 1 ? 'point' : 'points'} of material`;
const listEn = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? '');

function explanationEn(e) {
  switch (e.kind) {
    case 'allowsMate': return `Allows the opponent to mate in ${e.mateIn}.`;
    case 'missesMate': return `There was a forced mate in ${e.mateIn}.`;
    case 'allowsFork': return `Allows a fork: ${atEn(e.forker)} attacks ${listEn(e.targets.map(atEn))}: ${pointsEn(e.loss)} lost.`;
    case 'hangs': return `The ${NAME_EN[e.piece.piece]} just moved to ${e.piece.square} is left hanging: ${pointsEn(e.loss)} lost.`;
    case 'losesMaterial': {
      const caught = e.captured.length ? ` (the opponent captures ${listEn(e.captured.slice(0, 3).map(atEn))})` : '';
      return `Loses ${pointsEn(e.loss)}${caught}.`;
    }
    case 'missesMaterial': return `The best move won ${pointsEn(e.gain)} more.`;
    case 'sacrifice': return `Sacrifices ${pointsEn(e.amount)}, and the engine line shows that the sacrifice works.`;
    case 'onlyMove': {
      const second = uciLineToSan(e.line.fen, [e.secondUci])[0] ?? e.secondUci;
      return `Only good move: the engine's second choice, ${second}, is worth ${formatScore(e.secondScore)} against ${formatScore(e.bestScore)}.`;
    }
    default: return '';
  }
}
