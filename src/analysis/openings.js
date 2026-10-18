// Riconoscimento dell'apertura (ECO e nome) e delle mosse di teoria ("Book"),
// usando il dataset lichess-org/chess-openings convertito da scripts/build-openings.mjs.

import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { positionKey } from '../engine/cache.js';

/**
 * @typedef {{ eco: string, name: string, ply: number }} Opening
 *   ply = indice (0-based) della semimossa dopo cui si raggiunge la posizione con quel nome
 */

export class OpeningBook {
  /** @param {{ positions: Record<string, [string, string] | 0> }} data contenuto di openings.json */
  constructor(data) {
    this.positions = data.positions;
  }

  /** La posizione fa parte di una linea di teoria? */
  isBook(fen) {
    return positionKey(fen) in this.positions;
  }

  /** @returns {{ eco: string, name: string } | null} */
  nameOf(fen) {
    const v = this.positions[positionKey(fen)];
    return v ? { eco: v[0], name: v[1] } : null;
  }

  /**
   * Analizza la sequenza delle posizioni dopo ogni semimossa.
   * - bookPlies: quante semimosse iniziali sono di teoria (consecutive dall'inizio);
   * - opening: la posizione con nome più avanzata raggiunta entro openings.maxPly semimosse
   *   (anche per trasposizione).
   * @param {string[]} fensAfter FEN dopo ciascuna semimossa
   * @returns {{ bookPlies: number, opening: Opening|null }}
   */
  identify(fensAfter) {
    let bookPlies = 0;
    while (bookPlies < fensAfter.length && this.isBook(fensAfter[bookPlies])) bookPlies++;
    let opening = null;
    const limit = Math.min(fensAfter.length, ANALYSIS_CONFIG.openings.maxPly);
    for (let i = 0; i < limit; i++) {
      const found = this.nameOf(fensAfter[i]);
      if (found) opening = { ...found, ply: i };
    }
    return { bookPlies, opening };
  }
}

/**
 * Carica il dataset nel browser.
 * @param {string} [url]
 */
export async function loadOpeningBook(url = ANALYSIS_CONFIG.openings.dataUrl) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dataset aperture non trovato (${res.status})`);
  return new OpeningBook(await res.json());
}
