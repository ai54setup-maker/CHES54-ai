// Testo italiano dei suggerimenti dell'Allenatore (i fatti vengono da src/analysis/tactics.js).
// Nessuna logica scacchistica qui: solo formulazione. Funzioni pure.

import { numberedLine, uciLineToSan } from './notation.js';
import { getLang } from '../i18n/i18n.js';

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
  if (getLang() === 'en') return formatHintEn(h, { user, level });
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

// ---------- English ----------
const NAME_EN = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const theEn = (piece) => `the ${NAME_EN[piece]}`;
const listEn = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] ?? '');

function formatHintEn(h, { user, level }) {
  const mine = h.side === user;
  if (level === 'hint') {
    if (h.threat) return { title: 'Watch out', text: 'Your opponent has a threat: can you see it?', line: '' };
    const what = h.kind === 'mate' ? 'a mate' : 'a tactic';
    return { title: 'Hint', text: `There is ${what} for ${h.side === 'w' ? 'White' : 'Black'}${mine ? ' (you)' : ''}: find it!`, line: '' };
  }
  const san = uciLineToSan(h.line.fen, [h.move])[0] ?? h.move;
  const line = numberedLine(h.line.fen, h.line.pv);
  const targets = listEn(h.targets.map((x) => theEn(x.piece)));
  const [front, back] = h.targets;
  let core;
  switch (h.kind) {
    case 'mate': core = `${san} leads to mate in ${h.mateIn}`; break;
    case 'fork': core = `fork: ${san} attacks ${targets}`; break;
    case 'pin': core = `pin: ${san} pins ${theEn(front.piece)} ${back.piece === 'k' ? 'to the king' : `to ${theEn(back.piece)}`}`; break;
    case 'skewer': core = `skewer: ${san} attacks ${theEn(front.piece)} and, behind it, ${theEn(back.piece)}`; break;
    case 'discovered': core = `discovered attack: ${san} unleashes ${theEn(h.attacker.piece)} against ${targets}`; break;
    case 'hanging': core = `${theEn(front.piece)} on ${front.square} is hanging: ${san}`; break;
    default: core = `${san} wins material (${h.gain} ${h.gain === 1 ? 'point' : 'points'})`;
  }
  let text;
  if (h.threat) {
    if (h.kind === 'hanging') text = `Watch out: ${mine ? 'the opponent\'s piece' : `your ${NAME_EN[front.piece]}`} on ${front.square} is hanging (threat: ${san}).`;
    else if (h.kind === 'mate') text = `${mine ? 'You threaten' : 'Your opponent threatens'} mate in ${h.mateIn} with ${san}.`;
    else if (h.kind === 'material') text = `${mine ? 'You threaten' : 'Your opponent threatens'} ${san}.`;
    else text = `${mine ? 'You threaten' : 'Your opponent threatens'} a ${core}.`;
  } else if (mine) {
    if (h.kind === 'mate') text = `${san} leads to mate in ${h.mateIn}!`;
    else if (h.kind === 'hanging' || h.kind === 'material') text = `${cap(core)}.`;
    else text = `You have a ${core}.`;
  } else if (h.kind === 'mate') {
    text = `Watch out: your opponent has mate in ${h.mateIn} (${san}).`;
  } else if (h.kind === 'hanging') {
    text = `Watch out: your ${NAME_EN[front.piece]} on ${front.square} is hanging (${san}).`;
  } else if (h.kind === 'material') {
    text = `Watch out: your opponent can win material with ${san}.`;
  } else {
    text = `Watch out: your opponent has a ${core}.`;
  }
  return { title: h.threat ? 'Threat' : mine ? 'Chance' : 'Danger', text, line };
}
