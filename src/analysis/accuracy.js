// Precisione (accuracy) delle mosse e della partita, con le formule di Lichess
// (lila: modules/analyse/src/main/AccuracyPercent.scala).

import { ANALYSIS_CONFIG } from '../config/analysis.js';

const A = ANALYSIS_CONFIG.accuracy;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Precisione di una mossa a partire dalla win% di chi muove prima e dopo la mossa.
 * @param {number} before win% (0–100) di chi muove, prima della mossa
 * @param {number} after  win% (0–100) di chi muove, dopo la mossa
 */
export function moveAccuracy(before, after) {
  if (after >= before) return 100;
  const loss = before - after;
  return clamp(A.a * Math.exp(-A.k * loss) + A.b + A.uncertaintyBonus, 0, 100);
}

/** Media aritmetica; null se non ci sono valori. */
export function meanAccuracy(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function harmonicMean(values) {
  return values.length / values.reduce((s, v) => s + 1 / Math.max(A.harmonicFloor, v), 0);
}

function weightedMean(pairs) {
  const w = pairs.reduce((s, [, wt]) => s + wt, 0);
  return w === 0 ? null : pairs.reduce((s, [v, wt]) => s + v * wt, 0) / w;
}

// Deviazione standard della popolazione (come scalalib Maths.standardDeviation).
function standardDeviation(values) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

/**
 * Precisione della partita per ciascun colore, come Lichess: per ogni colore la media tra
 * (1) la media delle precisioni pesata sulla volatilità della win% in una finestra di mosse e
 * (2) la media armonica delle precisioni.
 *
 * @param {number[]} whiteWinPercents win% del Bianco nella posizione iniziale e dopo ogni semimossa
 *                                    (lunghezza = numero di semimosse + 1)
 * @param {'w'|'b'} startColor        chi gioca la prima semimossa
 * @returns {{ w: number|null, b: number|null }}
 */
export function gameAccuracy(whiteWinPercents, startColor = 'w') {
  const all = whiteWinPercents;
  const moves = all.length - 1;
  if (moves < 1) return { w: null, b: null };
  const windowSize = clamp(Math.floor(moves / A.windowDivisor), A.minWindow, A.maxWindow);

  // Le prime mosse riusano la prima finestra, poi la finestra scorre (come lila).
  const windows = [];
  for (let i = 0; i < Math.min(windowSize, all.length) - 2; i++) windows.push(all.slice(0, windowSize));
  if (all.length <= windowSize) windows.push(all.slice());
  else for (let i = 0; i + windowSize <= all.length; i++) windows.push(all.slice(i, i + windowSize));
  const weights = windows.map((w) => clamp(standardDeviation(w), A.minWeight, A.maxWeight));

  const per = { w: [], b: [] };
  for (let i = 0; i < moves && i < weights.length; i++) {
    const color = (i % 2 === 0) === (startColor === 'w') ? 'w' : 'b';
    const before = color === 'w' ? all[i] : 100 - all[i];
    const after = color === 'w' ? all[i + 1] : 100 - all[i + 1];
    per[color].push([moveAccuracy(before, after), weights[i]]);
  }
  const forColor = (pairs) => {
    if (!pairs.length) return null;
    const weighted = weightedMean(pairs);
    const harmonic = harmonicMean(pairs.map(([v]) => v));
    return weighted == null ? null : (weighted + harmonic) / 2;
  };
  return { w: forColor(per.w), b: forColor(per.b) };
}
