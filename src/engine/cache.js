// Cache delle posizioni già analizzate.
//
// Chiave: i primi 4 campi della FEN (pezzi, turno, arrocchi, en passant). I contatori di
// semimosse e di mosse vengono ignorati: la stessa posizione raggiunta in momenti diversi
// della partita viene riconosciuta. (Il contatore delle 50 mosse può influire sulla valutazione
// solo quando è vicino a 100: limite accettato.)
//
// Un risultato salvato viene riusato solo se è "almeno buono" quanto la richiesta:
// stesse o più linee e profondità raggiunta sufficiente (vedi satisfies()).

/**
 * @typedef {{ depth: number|null, multiPv: number, movetimeMs: number|null }} AnalysisRequest
 */

/** @param {string} fen */
export function positionKey(fen) {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ');
}

const atLeast = (have, want) => want == null || (have != null && have >= want);
const noLessTime = (have, want) => have == null || (want != null && have >= want);

/**
 * Il risultato salvato soddisfa la nuova richiesta?
 * - deve avere almeno tante linee quante richieste;
 * - e deve aver raggiunto la profondità richiesta, oppure essere stato prodotto da una
 *   richiesta almeno altrettanto esigente (stessa o maggiore profondità e tempo) che si è
 *   fermata prima per il limite di tempo o perché la partita finiva.
 * @param {{ depth: number, request: AnalysisRequest, lines: unknown[], multiPv: number }} entry
 * @param {AnalysisRequest} req
 */
export function satisfies(entry, req) {
  if (entry.multiPv < req.multiPv) return false;
  if (req.depth != null && entry.depth >= req.depth) return true;
  return atLeast(entry.request.depth, req.depth) && noLessTime(entry.request.movetimeMs, req.movetimeMs);
}

/** Stesse impostazioni di ricerca (profondità, tempo, numero di linee). */
export function sameRequest(entry, req) {
  return entry.multiPv === req.multiPv && entry.request.depth === req.depth && entry.request.movetimeMs === req.movetimeMs;
}

export class AnalysisCache {
  /** @param {number} maxEntries */
  constructor(maxEntries) {
    this.maxEntries = maxEntries;
    /** @type {Map<string, any>} */
    this.map = new Map();
  }

  get size() {
    return this.map.size;
  }

  /**
   * @param {string} fen
   * @param {AnalysisRequest} req
   * @param {{ exact?: boolean }} [opts] exact: riusa solo risultati ottenuti con le stesse identiche
   *        impostazioni (per analisi riproducibili, es. la revisione di una partita)
   * @returns {any|null} il risultato, con le linee ridotte a req.multiPv
   */
  get(fen, req, opts = {}) {
    const key = positionKey(fen);
    const entry = this.map.get(key);
    if (!entry) return null;
    if (opts.exact ? !sameRequest(entry, req) : !satisfies(entry, req)) return null;
    // Aggiorna l'ordine LRU: la voce usata per ultima va in fondo.
    this.map.delete(key);
    this.map.set(key, entry);
    return { ...entry, fen, lines: entry.lines.slice(0, req.multiPv) };
  }

  /**
   * Salva un risultato, a meno che ce ne sia già uno migliore per la stessa posizione.
   * @param {string} fen
   * @param {{ depth: number, request: AnalysisRequest, lines: unknown[], multiPv: number }} result
   */
  set(fen, result) {
    const key = positionKey(fen);
    const old = this.map.get(key);
    if (old && satisfies(old, { ...result.request, multiPv: result.multiPv }) && old.depth >= result.depth) return;
    this.map.delete(key);
    this.map.set(key, result);
    while (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value);
  }

  clear() {
    this.map.clear();
  }
}
