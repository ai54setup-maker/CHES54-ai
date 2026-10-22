// Sezione "Aperture": albero delle varianti costruito dal dataset lichess-org/chess-openings (CC0) e statistiche reali
// per fascia di punteggio dal database delle partite di Lichess (CC0). Usato dagli script (build-opening-tree.mjs,
// build-opening-stats.mjs), dall'interfaccia (src/ui/openings.js) e dai test. Solo dati: nessun DOM, rete o motore.

import { Chess } from '../../lib/chess.js';
import { positionKey } from '../engine/cache.js';
import { parsePgn } from './pgn.js';

/** Gruppi per prima mossa del Bianco. */
export const GROUPS = Object.freeze([
  Object.freeze({ id: 'e4', label: '1.e4' }),
  Object.freeze({ id: 'd4', label: '1.d4' }),
  Object.freeze({ id: 'c4', label: '1.c4' }),
  Object.freeze({ id: 'other', label: '' }), // "Altre" (testo tradotto nell'interfaccia)
]);

/** Gruppo della prima mossa (SAN). */
export const groupOf = (firstSan) => (['e4', 'd4', 'c4'].includes(firstSan) ? firstSan : 'other');

/** "Sicilian Defense: Najdorf Variation, English Attack" → famiglia "Sicilian Defense", variante "Najdorf Variation, English Attack" */
export function splitName(name) {
  const i = name.indexOf(':');
  return i < 0 ? { family: name.trim(), variation: '' } : { family: name.slice(0, i).trim(), variation: name.slice(i + 1).trim() };
}

/** SAN senza i segni di scacco, matto e commento (le partite e il dataset li scrivono in modo diverso). */
export const normSan = (san) => san.replace(/[+#!?]+$/, '');

/**
 * Albero delle varianti: un nodo per posizione (le trasposizioni portano allo stesso nodo), archi = mosse.
 * @param {Array<{ eco: string, name: string, pgn: string }>} rows righe del dataset
 * @returns {{ nodes: Map<string, TreeNode>, lines: Array<{ eco, name, family, variation, group, node: string, path: string[] }> }}
 *
 * @typedef {{ id: string, key: string, group: string, ply: number, named: { eco: string, name: string }|null,
 *   edges: Map<string, { san: string, uci: string, to: string }> }} TreeNode
 */
export function buildTree(rows) {
  const nodes = new Map(); // key → node
  const counters = {};
  const root = { id: 'root', key: positionKey(new Chess().fen()), group: 'root', ply: 0, named: null, edges: new Map() };
  nodes.set(root.key, root);
  const lines = [];
  for (const row of rows) {
    const sans = parsePgn(row.pgn).moves.map((m) => m.san);
    if (!sans.length) continue;
    const group = groupOf(normSan(sans[0]));
    const c = new Chess();
    let node = root;
    const path = [];
    for (const san of sans) {
      const m = c.move(san);
      const uci = m.from + m.to + (m.promotion ?? '');
      path.push(uci);
      const key = positionKey(c.fen());
      let next = nodes.get(key);
      if (!next) {
        counters[group] = (counters[group] ?? 0) + 1;
        next = { id: `${group}:${counters[group]}`, key, group, ply: path.length, named: null, edges: new Map() };
        nodes.set(key, next);
      }
      if (!node.edges.has(normSan(m.san))) node.edges.set(normSan(m.san), { san: m.san, uci, to: next.id });
      node = next;
    }
    const { family, variation } = splitName(row.name);
    // Stessa posizione con due nomi (trasposizione): vale il primo, come in openings.json
    if (!node.named) node.named = { eco: row.eco, name: row.name };
    lines.push({ eco: row.eco, name: row.name, family, variation, group, node: node.id, path });
  }
  return { nodes, lines };
}

/** Righe di un file TSV del dataset (eco, name, pgn). */
export const readTsv = (text) => text.trim().split('\n').slice(1).map((r) => {
  const [eco, name, pgn] = r.split('\t');
  return { eco, name, pgn };
});

// ---------- statistiche dalle partite ----------

/** Cadenza come la calcola Lichess: tempo base + 40 × incremento (secondi). */
export function speedOf(timeControl) {
  if (!timeControl || timeControl === '-') return 'correspondence';
  const [base, inc] = timeControl.split('+').map(Number);
  const est = base + 40 * (inc || 0);
  if (est < 30) return 'ultrabullet';
  if (est < 180) return 'bullet';
  if (est < 480) return 'blitz';
  if (est < 1500) return 'rapid';
  return 'classical';
}

/** Fascia del punteggio. @param {Array<{ id: string, min: number, max: number }>} bands */
export const bandOf = (rating, bands) => bands.find((b) => rating >= b.min && rating < b.max)?.id ?? null;

/** Mosse (SAN) dal testo di una partita PGN, senza commenti, numeri, varianti e risultato; al massimo `max`. */
export function movetextSans(text, max) {
  const clean = text.replace(/\{[^}]*\}/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\$\d+/g, ' ');
  const out = [];
  for (const tok of clean.split(/\s+/)) {
    if (!tok || /^\d+\.+$/.test(tok) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;
    const san = tok.replace(/^\d+\.+/, '');
    if (!san) continue;
    out.push(san);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Aggiunge una partita alle statistiche: si seguono le mosse lungo l'albero; per ogni posizione dell'albero si conta la
 * mossa giocata (anche se esce dall'albero), nella fascia di chi muove, con il risultato finale. Ci si ferma alla prima
 * mossa fuori dall'albero.
 * @param {Map<string, Object>} stats id del nodo → fascia → SAN → [partite, vinte Bianco, patte, vinte Nero]
 * @param {Map<string, Object>} byId  id del nodo → nodo
 * @param {string[]} sans mosse della partita
 * @param {{ white: number, black: number, result: string }} game
 */
export function addGame(stats, byId, sans, { white, black, result }, bands) {
  const r = result === '1-0' ? 1 : result === '0-1' ? 3 : result === '1/2-1/2' ? 2 : 0;
  if (!r) return;
  let node = byId.get('root');
  for (let i = 0; i < sans.length && node; i++) {
    const band = bandOf(i % 2 === 0 ? white : black, bands);
    const san = normSan(sans[i]);
    if (band) {
      let perNode = stats.get(node.id);
      if (!perNode) stats.set(node.id, (perNode = {}));
      const perBand = (perNode[band] ??= {});
      const row = (perBand[san] ??= [0, 0, 0, 0]);
      row[0]++;
      row[r]++;
    }
    const edge = node.edges.get(san);
    node = edge ? byId.get(edge.to) : null;
  }
}

/**
 * Riduce le statistiche di un nodo: per fascia, totale e le `top` mosse più giocate.
 * @returns {Record<string, [number, Array<[string, number, number, number, number]>]>}
 */
export function compactStats(perNode, top) {
  const out = {};
  for (const [band, moves] of Object.entries(perNode)) {
    const rows = Object.entries(moves).map(([san, v]) => [san, ...v]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    out[band] = [rows.reduce((s, x) => s + x[1], 0), rows.slice(0, top)];
  }
  return out;
}

/**
 * Percentuali dal punto di vista di un colore. @param {[string, number, number, number, number]} row [san, n, w, d, b]
 */
export function scoreFor(row, color) {
  const [, n, w, d, b] = row;
  if (!n) return { win: 0, draw: 0, loss: 0 };
  const win = color === 'w' ? w : b;
  const loss = color === 'w' ? b : w;
  return { win: (win / n) * 100, draw: (d / n) * 100, loss: (loss / n) * 100 };
}

// ---------- allenamento ("ripassa la variante") ----------

/**
 * Mossa attesa a un passo dell'allenamento. Le mosse dell'avversario le gioca l'app.
 * @param {string[]} path mosse UCI della variante
 * @param {'w'|'b'} color colore di chi si allena
 * @param {number} i indice della semimossa
 * @returns {{ who: 'user'|'app'|'done', uci?: string }}
 */
export function trainingStep(path, color, i) {
  if (i >= path.length) return { who: 'done' };
  const mover = i % 2 === 0 ? 'w' : 'b';
  return { who: mover === color ? 'user' : 'app', uci: path[i] };
}

/** Chiave del ripasso di una variante (sequenza di mosse UCI) con un colore. */
export const repKey = (path, color) => `${color}|${path.join(' ')}`;
