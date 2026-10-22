// Costruisce l'albero delle varianti della sezione Aperture e lo fa valutare a Stockfish.
//
//   npm run build:opening-tree        (~40 minuti la prima volta; poi riusa la cache)
//
//  1. Legge il dataset lichess-org/chess-openings (data/openings/source/*.tsv, CC0): un nodo per posizione,
//     le trasposizioni portano allo stesso nodo, gli archi sono le mosse.
//  2. Analizza ogni posizione con il nostro Stockfish (ANALYSIS_CONFIG.openingTree): valutazione e mossa migliore.
//     Le analisi restano in data/openings/tree-source/sf.json (esclusa da git): un secondo avvio non le ripete.
//  3. Scrive data/openings/tree/index.json (catalogo per gruppo, famiglia e variante) e tree-<gruppo>.json (nodi).

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/engine/engine.js';
import { nodeTransport } from '../src/engine/node-transport.js';
import { ANALYSIS_CONFIG } from '../src/config/analysis.js';
import { buildTree, readTsv, GROUPS } from '../src/analysis/opening-tree.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const SRC = root('data/openings/source/');
const OUT = root('data/openings/tree/');
const CACHE_DIR = root('data/openings/tree-source/');
const cfg = ANALYSIS_CONFIG.openingTree;
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE_DIR, { recursive: true });

const rows = readdirSync(SRC).filter((f) => f.endsWith('.tsv')).sort().flatMap((f) => readTsv(readFileSync(SRC + f, 'utf8')));
const { nodes, lines } = buildTree(rows);
console.log(`${rows.length} linee, ${nodes.size} posizioni`);

// ---------- Stockfish ----------
const cachePath = CACHE_DIR + 'sf.json';
const cacheKey = `d${cfg.depth}m${cfg.multiPv}`;
let cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
if (cache.key !== cacheKey) cache = { key: cacheKey, results: {} };
const engine = new Engine(nodeTransport(root('engine/stockfish.js')));
await engine.ready;
const t0 = Date.now();
let done = 0;
const todo = [...nodes.values()].filter((n) => !cache.results[n.key]);
for (const n of todo) {
  const r = await engine.analyze(`${n.key} 0 1`, { depth: cfg.depth, multiPv: cfg.multiPv, movetimeMs: null });
  const l = r.lines[0];
  // [centipawn, matto, mossa migliore UCI, profondità] — punteggio dal punto di vista del Bianco
  cache.results[n.key] = l ? [l.score.cp, l.score.mate, l.pv[0], l.depth] : [null, null, null, 0];
  if (++done % 100 === 0) {
    writeFileSync(cachePath, JSON.stringify(cache));
    const s = (Date.now() - t0) / 1000;
    console.log(`  ${done}/${todo.length} posizioni (${s.toFixed(0)} s, ~${((s / done) * (todo.length - done) / 60).toFixed(0)} min alla fine)`);
  }
}
writeFileSync(cachePath, JSON.stringify(cache));
engine.terminate();

// ---------- file per l'app ----------
const node = (n) => ({
  k: n.key,
  n: n.named ? [n.named.eco, n.named.name] : 0,
  c: [...n.edges.values()].map((e) => [e.san, e.uci, e.to]),
  s: cache.results[n.key],
});
for (const g of GROUPS) {
  const out = {};
  for (const n of nodes.values()) if (n.group === g.id) out[n.id] = node(n);
  writeFileSync(`${OUT}tree-${g.id}.json`, JSON.stringify({ nodes: out }) + '\n');
}

// Catalogo: gruppo → famiglia → varianti (nell'ordine del dataset, cioè per ECO)
const families = new Map();
for (const l of lines) {
  const key = `${l.group}|${l.family}`;
  if (!families.has(key)) families.set(key, { name: l.family, group: l.group, eco: l.eco, variations: [] });
  families.get(key).variations.push({ name: l.variation, full: l.name, eco: l.eco, node: l.node, path: l.path.join(' ') });
}
const rootNode = [...nodes.values()].find((n) => n.id === 'root');
writeFileSync(OUT + 'index.json', JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  source: 'lichess-org/chess-openings (CC0)',
  stockfish: { engine: 'Stockfish 17.1 lite (engine/)', depth: cfg.depth },
  root: node(rootNode),
  families: [...families.values()],
}) + '\n');
console.log(`Fatto: ${families.size} famiglie, ${lines.length} varianti, ${nodes.size} posizioni.`);
