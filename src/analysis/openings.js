// Riconoscimento dell'apertura (ECO e nome) e delle mosse di teoria ("Book"),
// usando il dataset lichess-org/chess-openings convertito da scripts/build-openings.mjs.

import { Chess } from '../../lib/chess.js';
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
   * Esploratore: le mosse legali che portano a una posizione di teoria del dataset, con il nome dell'apertura
   * se quella posizione ne ha uno. Il dataset non ha statistiche: l'ordine è solo alfabetico (prima le mosse con nome).
   * @param {string} fen
   * @returns {{ uci: string, san: string, eco: string|null, name: string|null }[]}
   */
  bookMoves(fen) {
    const out = [];
    for (const m of new Chess(fen).moves({ verbose: true })) {
      const after = new Chess(fen);
      after.move(m.san);
      if (!this.isBook(after.fen())) continue;
      const named = this.nameOf(after.fen());
      out.push({ uci: m.from + m.to + (m.promotion ?? ''), san: m.san, eco: named?.eco ?? null, name: named?.name ?? null });
    }
    return out.sort((a, b) => (!a.name - !b.name) || (a.name ?? a.san).localeCompare(b.name ?? b.san));
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
