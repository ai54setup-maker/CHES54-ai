// Normalizzazione dei punteggi del motore.
//
// Convenzione del progetto: un punteggio "normalizzato" è SEMPRE dal punto di vista del Bianco.
//   { cp: 35,   mate: null } → il Bianco è avanti di 0,35 pedoni
//   { cp: null, mate: 3 }    → il Bianco dà matto in 3 mosse ("M3")
//   { cp: null, mate: -5 }   → il Nero dà matto in 5 mosse ("-M5")
// Centipawn e matto non si mescolano mai: esattamente uno dei due è un numero.

/** @typedef {{ cp: number|null, mate: number|null }} Score */

// Evita "-0", che verrebbe stampato come "-0.00".
const negate = (n) => -n + 0;

/**
 * Converte un punteggio UCI (dal punto di vista di chi muove) al punto di vista del Bianco.
 * @param {Score} raw
 * @param {'w'|'b'} sideToMove
 * @returns {Score}
 */
export function toWhitePov(raw, sideToMove) {
  if (raw.mate === 0) {
    // "mate 0" arriva solo se chi muove ha già subito matto: è una posizione finale,
    // che va riconosciuta con le regole (chess.js), non con un punteggio.
    throw new RangeError('Punteggio "mate 0": la posizione è già di scacco matto');
  }
  if (sideToMove === 'w') return { cp: raw.cp, mate: raw.mate };
  return {
    cp: raw.cp == null ? null : negate(raw.cp),
    mate: raw.mate == null ? null : negate(raw.mate),
  };
}

/**
 * Dal punto di vista del Bianco al punto di vista del colore indicato.
 * @param {Score} white
 * @param {'w'|'b'} color
 * @returns {Score}
 */
export function toPov(white, color) {
  if (color === 'w') return { cp: white.cp, mate: white.mate };
  return {
    cp: white.cp == null ? null : negate(white.cp),
    mate: white.mate == null ? null : negate(white.mate),
  };
}

/** @param {Score} score */
export const isMateScore = (score) => score.mate != null;

/**
 * Testo compatto di un punteggio normalizzato: "+0.35", "-1.20", "0.00", "M3", "-M5".
 * @param {Score} score
 */
export function formatScore(score) {
  if (score.mate != null) return (score.mate < 0 ? '-M' : 'M') + Math.abs(score.mate);
  const v = score.cp / 100;
  if (v === 0) return '0.00';
  return (v > 0 ? '+' : '') + v.toFixed(2);
}
