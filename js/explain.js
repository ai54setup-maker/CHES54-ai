// Spiegazioni brevi, in italiano, dell'idea dietro una mossa.
// Sono euristiche semplici (sviluppo, centro, catture, minacce, sicurezza del re):
// non sostituiscono il motore, ma aiutano a capire perché una mossa è buona.

import { Chess } from '../lib/chess.js';

const NAME = { p: 'il pedone', n: 'il cavallo', b: "l'alfiere", r: 'la torre', q: 'la donna', k: 'il re' };
const NAME_SHORT = { p: 'pedone', n: 'cavallo', b: 'alfiere', r: 'torre', q: 'donna', k: 're' };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const CENTER = ['d4', 'e4', 'd5', 'e5'];

function piecesOf(chess, color) {
  return chess.board().flat().filter((p) => p && p.color === color);
}

/**
 * @param {string} fen posizione prima della mossa
 * @param {string} uci mossa in formato UCI (es. g1f3)
 * @param {{cp:number|null, mate:number|null}} score valutazione dal punto di vista di chi muove
 */
export function explainMove(fen, uci, score) {
  const chess = new Chess(fen);
  const us = chess.turn();
  const them = us === 'w' ? 'b' : 'w';
  const backRank = us === 'w' ? '1' : '8';
  const wasAttacked = chess.isAttacked(uci.slice(0, 2), them);

  let m;
  try {
    m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return '';
  }

  const ideas = [];

  if (m.san.endsWith('#')) return 'Scacco matto!';
  if (score && score.mate > 0) ideas.push(`forza il matto in ${score.mate}`);

  if (m.isKingsideCastle() || m.isQueensideCastle()) {
    ideas.push('arrocca: mette al sicuro il re e attiva la torre');
  }
  if (m.isPromotion()) ideas.push(`promuove il pedone a ${NAME_SHORT[m.promotion]}`);

  if (m.captured) {
    const gain = VALUE[m.captured] - VALUE[m.piece];
    const defended = chess.isAttacked(m.to, them);
    if (!defended) ideas.push(`cattura ${NAME[m.captured]} gratis`);
    else if (gain > 0) ideas.push(`guadagna materiale prendendo ${NAME[m.captured]}`);
    else if (gain === 0) ideas.push(`cambia ${NAME[m.piece]} con ${NAME[m.captured]}`);
    else ideas.push(`cattura ${NAME[m.captured]}`);
  }

  if (m.san.includes('+')) ideas.push('dà scacco al re');

  // Sviluppo dei pezzi minori dalla prima traversa
  if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === backRank) ideas.push('sviluppa un pezzo');

  // Minacce: pezzi avversari attaccati dal pezzo mosso, indifesi o di valore maggiore
  const threats = [];
  for (const p of piecesOf(chess, them)) {
    if (p.type === 'k') continue;
    if (!chess.attackers(p.square, us).includes(m.to)) continue;
    const hanging = !chess.isAttacked(p.square, them);
    if (hanging || VALUE[p.type] > VALUE[m.piece]) threats.push(p);
  }
  if (threats.length >= 2) {
    ideas.push(`attacco doppio su ${threats.slice(0, 2).map((p) => `${NAME_SHORT[p.type]} in ${p.square}`).join(' e ')}`);
  } else if (threats.length === 1) {
    ideas.push(`attacca ${NAME[threats[0].type]} in ${threats[0].square}`);
  }

  // Controllo del centro
  const centerHits = CENTER.filter((sq) => sq === m.to || chess.attackers(sq, us).includes(m.to));
  if (centerHits.length && !m.captured) ideas.push('controlla il centro');

  if (wasAttacked && !chess.isAttacked(m.to, them) && m.piece !== 'p') ideas.push(`mette al sicuro ${NAME[m.piece]}`);

  if (ideas.length === 0) {
    if (m.piece === 'p') ideas.push('guadagna spazio con il pedone');
    else if (m.piece === 'k') ideas.push('migliora la posizione del re');
    else if (m.piece === 'r') ideas.push('attiva la torre');
    else if (m.piece === 'q') ideas.push('attiva la donna');
    else ideas.push('migliora la posizione del pezzo');
  }

  const parts = ideas.slice(0, 3);
  const text = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts.at(-1) : parts[0];
  return text.charAt(0).toUpperCase() + text.slice(1);
}
