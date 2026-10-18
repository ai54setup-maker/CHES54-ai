// Testo italiano dei suggerimenti dell'Allenatore (i fatti vengono da src/analysis/tactics.js).
// Nessuna logica scacchistica qui: solo formulazione. Funzioni pure.

import { numberedLine, uciLineToSan } from './notation.js';

const NAME = { p: 'pedone', n: 'cavallo', b: 'alfiere', r: 'torre', q: 'donna', k: 're' };
const ART = { p: 'il', n: 'il', b: "l'", r: 'la', q: 'la', k: 'il' };
const the = (piece) => (ART[piece] === "l'" ? `l'${NAME[piece]}` : `${ART[piece]} ${NAME[piece]}`);
const COLOR = { w: 'Bianco', b: 'Nero' };
const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} e ${items.at(-1)}` : items[0] ?? '');

/**
 * @param {import('../analysis/tactics.js').Hint} h
 * @param {Object} o
 * @param {'w'|'b'} o.user   colore dell'utente
 * @param {'hint'|'solution'} o.level
 * @returns {{ title: string, text: string, line: string }} line = variante del motore (vuota nel livello "indizio")
 */
export function formatHint(h, { user, level }) {
  const mine = h.side === user;
  if (level === 'hint') {
    if (h.threat) return { title: 'Attenzione', text: "L'avversario ha una minaccia: riesci a vederla?", line: '' };
    const what = h.kind === 'mate' ? 'un matto' : 'una tattica';
    return { title: 'Indizio', text: `C'è ${what} per il ${COLOR[h.side]}${mine ? ' (tu)' : ''}: cercala!`, line: '' };
  }
  const san = uciLineToSan(h.line.fen, [h.move])[0] ?? h.move;
  const line = numberedLine(h.line.fen, h.line.pv);
  const targets = list(h.targets.map((t) => the(t.piece)));
  const [front, back] = h.targets;
  let core;
  switch (h.kind) {
    case 'mate': core = `con ${san} c'è un matto in ${h.mateIn}`; break;
    case 'fork': core = `forchetta: ${san} attacca ${targets}`; break;
    case 'pin': core = `inchiodatura: ${san} inchioda ${the(front.piece)} ${back.piece === 'k' ? 'al re' : `contro ${the(back.piece)}`}`; break;
    case 'skewer': core = `infilata: ${san} attacca ${the(front.piece)} e, dietro, ${the(back.piece)}`; break;
    case 'discovered': core = `attacco di scoperta: ${san} libera ${the(h.attacker.piece)} contro ${targets}`; break;
    case 'hanging': core = `${the(front.piece)} in ${front.square} è in presa: ${san}`; break;
    default: core = `${san} vince materiale (${h.gain} ${h.gain === 1 ? 'punto' : 'punti'})`;
  }
  let text;
  if (h.threat) {
    // Minaccia contro chi deve muovere
    if (h.kind === 'hanging') text = `Attenzione: ${mine ? 'il pezzo avversario' : `il tuo ${NAME[front.piece]}`} in ${front.square} è in presa (minaccia ${san}).`;
    else if (h.kind === 'mate') text = `${mine ? 'Minacci' : "L'avversario minaccia"} matto in ${h.mateIn} con ${san}.`;
    else if (h.kind === 'material') text = `${mine ? 'Minacci' : "L'avversario minaccia"} ${san}.`;
    else text = `${mine ? 'Minacci' : "L'avversario minaccia"} una ${core}.`;
  } else if (mine) {
    if (h.kind === 'mate') text = `Con ${san} c'è un matto in ${h.mateIn}!`;
    else if (h.kind === 'hanging') text = `${cap(core)}.`;
    else if (h.kind === 'material') text = `${cap(core)}.`;
    else text = `Hai una ${core}.`;
  } else if (h.kind === 'mate') {
    text = `Attenzione: l'avversario ha il matto in ${h.mateIn} (${san}).`;
  } else if (h.kind === 'hanging') {
    text = `Attenzione: il tuo ${NAME[front.piece]} in ${front.square} è in presa (${san}).`;
  } else if (h.kind === 'material') {
    text = `Attenzione: l'avversario può vincere materiale con ${san}.`;
  } else {
    text = `Attenzione: l'avversario ha una ${core}.`;
  }
  return { title: h.threat ? 'Minaccia' : mine ? 'Occasione' : 'Pericolo', text, line };
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
