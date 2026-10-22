// Sezione Aperture, studio di una famiglia: nomi univoci delle varianti, albero leggibile delle diramazioni,
// prossima mossa attesa (Impara e Ripasso), scelta della variante da ripassare, migrazione dei vecchi ripassi.
// Le mosse vengono solo dal dataset (percorsi delle varianti): nessuna mossa scritta a mano. Nessun DOM.

import { Chess } from '../../lib/chess.js';
import { LEARNED_BOX } from './my-mistakes.js';

/** SAN di un percorso UCI dalla posizione iniziale. */
export function sansOf(path) {
  const c = new Chess();
  return path.map((u) => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
}

/** Mossa con il numero: (indice 0, "e4") → "1.e4"; (indice 1, "d5") → "1...d5". */
export const numbered = (ply, san) => `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? '.' : '...'}${san}`;

/**
 * Nomi univoci delle varianti di una famiglia. Le varianti con lo stesso nome (anche vuoto = linea principale) si
 * distinguono con la mossa da cui si separano dalle omonime, es. "Linea principale (2.d4)".
 * @param {Array<{ name: string, path: string[] }>} variations
 * @param {string} mainLabel nome da usare quando la variante non ha nome ("Linea principale")
 * @param {(san: string) => string} [fmt] notazione delle mosse aggiunte (es. italiana); il nome resta com'è
 * @returns {string[]} nell'ordine delle varianti
 */
export function uniqueLabels(variations, mainLabel, fmt = (x) => x) {
  const base = variations.map((v) => v.name || mainLabel);
  const sans = variations.map((v) => sansOf(v.path).map(fmt));
  const firstDiff = (a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  };
  const start = base.map((name, i) => {
    const twins = base.map((n, j) => (n === name && j !== i ? j : -1)).filter((j) => j >= 0);
    if (!twins.length) return null;
    // Mossa da cui questa variante si separa da tutte le omonime (se è più corta di un'omonima: la sua ultima mossa)
    const p = variations[i].path;
    return Math.min(p.length - 1, Math.max(...twins.map((j) => firstDiff(p, variations[j].path))));
  });
  // Con tre o più omonime una mossa può non bastare: se ne aggiunge una alla volta finché il nome è unico
  const labels = base.map((name, i) => (start[i] == null ? name : null));
  for (let extra = 1; extra <= 40 && labels.includes(null); extra++) {
    const cand = base.map((name, i) => {
      if (labels[i] != null) return labels[i];
      const from = Math.max(0, Math.min(start[i], sans[i].length - extra));
      const moves = sans[i].slice(from, from + extra).map((s, k) => numbered(from + k, s)).join(' ');
      return `${name} (${moves})`;
    });
    cand.forEach((l, i) => { if (labels[i] == null && cand.filter((x) => x === l).length === 1) labels[i] = l; });
  }
  return labels.map((l, i) => l ?? `${base[i]} (${i + 1})`);
}

/**
 * Albero delle varianti della famiglia (trie dei percorsi dalla posizione iniziale).
 * Nodo: { ply, uci, san, children: Map<uci, nodo>, ends: number[] (varianti che finiscono qui) }.
 */
export function familyTrie(variations) {
  const root = { ply: 0, uci: null, san: null, children: new Map(), ends: [] };
  variations.forEach((v, idx) => {
    const sans = sansOf(v.path);
    let n = root;
    v.path.forEach((uci, i) => {
      if (!n.children.has(uci)) n.children.set(uci, { ply: i + 1, uci, san: sans[i], children: new Map(), ends: [] });
      n = n.children.get(uci);
    });
    n.ends.push(idx);
  });
  return root;
}

/** Nodo del trie dopo un percorso, o null se il percorso esce dall'albero della famiglia. */
export function walk(trie, path) {
  let n = trie;
  for (const uci of path) {
    n = n.children.get(uci);
    if (!n) return null;
  }
  return n;
}

/** Percorso comune a tutte le varianti (il tronco da cui partono le diramazioni). */
export function commonPath(trie) {
  const out = [];
  let n = trie;
  while (n.children.size === 1 && !n.ends.length) {
    n = [...n.children.values()][0];
    out.push(n.uci);
  }
  return out;
}

/** Linea principale di un'apertura: la variante senza nome più corta (es. 1.d4 d5 2.c4 per il Gambetto di donna). */
export function mainPathOf(variations) {
  const mains = variations.filter((v) => !v.name).sort((a, b) => a.path.length - b.path.length);
  return mains[0]?.path ?? null;
}

/**
 * Albero leggibile per la pagina dell'apertura: parte dalla linea principale; le catene senza diramazioni diventano
 * una riga. Le varianti che non passano dalla linea principale (altri ordini di mosse, trasposizioni) vanno in `others`.
 * Riga: { moves: string[] (con il numero), path: string[], label: string|null, variation: number|null, children: Riga[] }.
 * @param {string[]} labels nomi univoci (uniqueLabels)
 * @param {Array<{ path: string[] }>} variations
 */
export function familyRows(trie, labels, variations = null, mainPath = null) {
  let start = mainPath ?? commonPath(trie);
  if (!walk(trie, start)) start = commonPath(trie);
  const trunk = walk(trie, start);
  const row = (node, path) => {
    const moves = [];
    let n = node;
    let p = path;
    for (;;) {
      moves.push(numbered(n.ply - 1, n.san));
      p = [...p, n.uci];
      if (n.ends.length || n.children.size !== 1) break;
      n = [...n.children.values()][0];
    }
    const v = n.ends[0] ?? null;
    return { moves, path: p, label: v == null ? null : labels[v], variation: v, children: [...n.children.values()].map((c) => row(c, p)) };
  };
  const startKey = start.join(' ');
  const others = (variations ?? [])
    .map((v, i) => ({ v, i }))
    .filter(({ v }) => !(v.path.join(' ') + ' ').startsWith(startKey ? `${startKey} ` : ''))
    .map(({ v, i }) => ({ moves: sansOf(v.path).map((x, k) => numbered(k, x)), path: v.path, label: labels[i], variation: i, children: [] }));
  return {
    trunk: { moves: sansOf(start).map((x, i) => numbered(i, x)), path: start, label: trunk.ends.length ? labels[trunk.ends[0]] : null, variation: trunk.ends[0] ?? null },
    rows: [...trunk.children.values()].map((c) => row(c, start)),
    others,
  };
}

/** Variante (indice) a cui porta un ramo: quella che finisce più vicino (la prima incontrata scendendo). */
export function firstVariationBelow(node) {
  const queue = [node];
  while (queue.length) {
    const n = queue.shift();
    if (n.ends.length) return n.ends[0];
    queue.push(...n.children.values());
  }
  return null;
}

/**
 * Prossimo passo dello studio.
 * @param {{ trie: Object, path: string[], color: 'w'|'b', plan: string[]|null }} s plan = percorso della variante scelta
 * @returns {{ who: 'end' } | { who: 'app', uci: string } | { who: 'fork', options: Object[] } |
 *   { who: 'user', theory: Object[], planned: string|null }}
 */
export function nextStep({ trie, path, color, plan }) {
  const node = walk(trie, path);
  if (!node) return { who: 'end' };
  const onPlan = plan && plan.length > path.length && path.every((u, i) => plan[i] === u);
  if (plan && !onPlan) return { who: 'end' }; // la variante scelta è finita
  const children = [...node.children.values()];
  if (!children.length) return { who: 'end' };
  const mover = path.length % 2 === 0 ? 'w' : 'b';
  const planned = onPlan ? plan[path.length] : null;
  if (mover !== color) {
    if (planned) return { who: 'app', uci: planned };
    if (children.length === 1) return { who: 'app', uci: children[0].uci };
    return { who: 'fork', options: children };
  }
  return { who: 'user', theory: children, planned };
}

/**
 * Mossa dell'utente: teoria (un ramo dell'albero della famiglia) oppure fuori teoria.
 * @returns {{ theory: true, node: Object } | { theory: false, expected: string[] }} expected = mosse della teoria (UCI)
 */
export function judgeStudyMove(trie, path, uci, planned = null) {
  const node = walk(trie, path);
  const child = node?.children.get(uci);
  if (child) return { theory: true, node: child };
  const expected = planned ? [planned] : [...(node?.children.keys() ?? [])];
  return { theory: false, expected };
}

/**
 * Variante da ripassare: prima quelle già studiate con quel colore e non ancora imparate (a caso tra loro),
 * altrimenti una qualsiasi variante della famiglia (a caso).
 * @param {Array<{ path: string[] }>} variations
 * @param {Array<{ path: string, color: string, box: number }>} reps ripassi salvati
 */
export function pickReview(variations, reps, color, rng = Math.random) {
  const keys = new Set(variations.map((v) => v.path.join(' ')));
  const due = reps.filter((r) => r.color === color && r.box < LEARNED_BOX && keys.has(r.path));
  if (due.length) return due[Math.floor(rng() * due.length)].path.split(' ');
  return variations[Math.floor(rng() * variations.length)].path;
}

/**
 * Ripassi salvati con la versione precedente della sezione: { id, name, color, path, box, tries, addedAt }.
 * Si tengono tutti (scatole comprese) e si aggiunge la famiglia, trovata con `familyOf(path)`.
 */
export function migrateReps(list, familyOf) {
  return (Array.isArray(list) ? list : [])
    .filter((r) => r && typeof r.path === 'string' && (r.color === 'w' || r.color === 'b'))
    .map((r) => ({ ...r, id: `${r.color}|${r.path}`, family: r.family ?? familyOf(r.path) ?? null, box: Number(r.box) || 0, tries: Number(r.tries) || 0 }));
}

/**
 * Aperture del catalogo: le famiglie del dataset il cui nome inizia con quello di un'altra famiglia dello stesso gruppo
 * (es. "Queen's Gambit Accepted", "Queen's Gambit Declined" → "Queen's Gambit") diventano rami della stessa apertura,
 * così l'albero mostra "se cattura → Accepted, se gioca e6 → Declined". Il nome delle varianti unite prende il resto del
 * nome della famiglia ("Accepted: Normal Variation").
 * @param {Array<{ name: string, group: string, eco: string, variations: Array<{ name: string, full: string, eco: string, path: string }> }>} families
 */
export function mergeFamilies(families) {
  const byGroup = new Map();
  for (const f of families) {
    if (!byGroup.has(f.group)) byGroup.set(f.group, []);
    byGroup.get(f.group).push(f);
  }
  const out = [];
  for (const list of byGroup.values()) {
    // La base di una famiglia: la famiglia più corta dello stesso gruppo il cui nome è un prefisso ("X " o "X,")
    const baseOf = (f) => list
      .filter((b) => b !== f && (f.name.startsWith(`${b.name} `) || f.name.startsWith(`${b.name},`)))
      .sort((a, b) => a.name.length - b.name.length)[0] ?? null;
    const merged = new Map();
    for (const f of list) {
      const base = baseOf(f) ?? f;
      if (!merged.has(base.name)) merged.set(base.name, { name: base.name, group: base.group, eco: base.eco, variations: [] });
      const suffix = base === f ? '' : f.name.slice(base.name.length).replace(/^[\s,]+/, '');
      for (const v of f.variations) {
        merged.get(base.name).variations.push({ ...v, name: suffix ? (v.name ? `${suffix}: ${v.name}` : suffix) : v.name });
      }
    }
    out.push(...merged.values());
  }
  return out;
}
