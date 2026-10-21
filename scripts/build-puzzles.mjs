// Costruisce la raccolta di problemi a partire dal database pubblico di Lichess (CC0).
//
//   npm run build:puzzles
//
//  1. Scarica in streaming l'inizio di https://database.lichess.org/lichess_db_puzzle.csv.zst (decompressione
//     zstd di Node) e salva le prime MAX_ROWS righe in data/puzzles/source/ (esclusa da git).
//  2. Tiene i problemi di buona qualità (popolarità, numero di partite giocate, punteggio stabile, durata).
//  3. Li divide per tema principale (UI_CONFIG.puzzles.themes, temi assegnati da Lichess) e difficoltà (levels).
//  4. Verifica OGNI mossa della soluzione con il nostro Stockfish (regole in src/analysis/puzzle.js):
//     un problema non confermato viene escluso, con il motivo, e si prova il successivo.
//  5. Scrive data/puzzles/puzzles.json e data/puzzles/SOURCES.md.
// Le verifiche già fatte restano in data/puzzles/source/verified.json: un secondo avvio non le ripete.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createZstdDecompress } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/engine/engine.js';
import { nodeTransport } from '../src/engine/node-transport.js';
import { ANALYSIS_CONFIG } from '../src/config/analysis.js';
import { UI_CONFIG } from '../src/config/ui.js';
import { parsePuzzleRow, puzzleStart, playUci, verifySolverMove, verifyReply, primaryTheme, levelOf } from '../src/analysis/puzzle.js';
import { Chess } from '../lib/chess.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const DIR = root('data/puzzles/');
const SRC = DIR + 'source/';
const DB_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const MAX_ROWS = 600000; // righe lette dall'inizio del database (circa un decimo)
const PER_BUCKET = 15; //    problemi per coppia tema × difficoltà
const MAX_TRIES = 45; //     candidati verificati al massimo per coppia
// Qualità minima (dati di Lichess)
const MIN_POPULARITY = 85; // gradimento dei giocatori, da -100 a 100
const MIN_PLAYS = 300;
const MAX_RATING_DEVIATION = 90; // punteggio del problema stabile
const MAX_MOVES = 8; //            semimosse, compresa la prima dell'avversario (al massimo 4 mosse da trovare)

const cfg = ANALYSIS_CONFIG.puzzles;
const themes = UI_CONFIG.puzzles.themes.map((t) => t.id);
const levels = UI_CONFIG.puzzles.levels;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
mkdirSync(SRC, { recursive: true });

// ---------- 1. download parziale ----------
const slicePath = SRC + 'puzzles-slice.csv';
const metaPath = SRC + 'download.json';
if (!existsSync(slicePath)) {
  console.log(`Scarico le prime ${MAX_ROWS} righe di ${DB_URL}…`);
  const res = await fetch(DB_URL);
  if (!res.ok) throw new Error(`${DB_URL}: HTTP ${res.status}`);
  const lines = [];
  const input = Readable.fromWeb(res.body).pipe(createZstdDecompress());
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    lines.push(line);
    if (lines.length > MAX_ROWS) break; // + intestazione
  }
  rl.close();
  input.destroy();
  const text = lines.join('\n') + '\n';
  writeFileSync(slicePath, text);
  writeFileSync(metaPath, JSON.stringify({
    url: DB_URL, date: today(), lastModified: res.headers.get('last-modified'), rows: lines.length - 1, sha256: sha256(text),
  }, null, 2));
}
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

// ---------- 2–3. selezione dei candidati ----------
const buckets = new Map(); // "tema|livello" → righe candidate
let read = 0;
let quality = 0;
for (const line of readFileSync(slicePath, 'utf8').split('\n')) {
  const p = parsePuzzleRow(line);
  if (!p) continue;
  read++;
  if (p.popularity < MIN_POPULARITY || p.plays < MIN_PLAYS || p.ratingDeviation > MAX_RATING_DEVIATION || p.moves.length > MAX_MOVES) continue;
  quality++;
  const theme = primaryTheme(p.themes, themes);
  const level = levelOf(p.rating, levels);
  if (!theme || !level) continue;
  const key = `${theme}|${level}`;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(p);
}
// Ordine stabile: prima i problemi giocati da più persone
for (const list of buckets.values()) list.sort((a, b) => b.plays - a.plays || a.id.localeCompare(b.id));

// ---------- 4. verifica con Stockfish ----------
const cachePath = SRC + 'verified.json';
const cacheKey = `d${cfg.depth}m${cfg.multiPv}g${cfg.minGap}r${cfg.replyDepth}t${cfg.replyTolerance}`;
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
if (cache.key !== cacheKey) Object.assign(cache, { key: cacheKey, results: {} });
const saveCache = () => writeFileSync(cachePath, JSON.stringify(cache));

const engine = new Engine(nodeTransport(root('engine/stockfish.js')));
await engine.ready;

/** @returns {Promise<{ ok: boolean, reason?: string, eval?: object }>} */
async function verify(p) {
  const start = puzzleStart(p);
  if (!start) return { ok: false, reason: 'prima mossa illegale' };
  engine.newGame();
  const c = new Chess(start.fen);
  let startEval = null;
  for (let i = 0; i < start.solution.length; i++) {
    const uci = start.solution[i];
    const fen = c.fen();
    const solverTurn = i % 2 === 0;
    const isFinal = i === start.solution.length - 1;
    const r = solverTurn
      ? await engine.analyze(fen, { depth: cfg.depth, multiPv: cfg.multiPv, movetimeMs: null })
      : await engine.analyze(fen, { depth: cfg.replyDepth, multiPv: cfg.replyMultiPv, movetimeMs: null });
    if (i === 0) startEval = r.lines[0]?.score ?? null;
    const v = solverTurn ? verifySolverMove(r, fen, uci, isFinal) : verifyReply(r, fen, uci);
    if (!v.ok) return { ok: false, reason: `${solverTurn ? 'mossa' : 'risposta'} ${Math.floor(i / 2) + 1}: ${v.reason}` };
    if (!playUci(c, uci)) return { ok: false, reason: 'mossa illegale nella soluzione' };
  }
  return { ok: true, eval: startEval };
}

const chosen = [];
const excluded = {}; // motivo → quanti
const t0 = Date.now();
let done = 0;
for (const theme of themes) {
  for (const level of levels) {
    const list = buckets.get(`${theme}|${level.id}`) ?? [];
    let ok = 0;
    for (const p of list.slice(0, MAX_TRIES)) {
      if (ok >= PER_BUCKET) break;
      let v = cache.results[p.id];
      if (!v) {
        v = await verify(p);
        cache.results[p.id] = v;
        if (++done % 20 === 0) {
          saveCache();
          console.log(`  ${done} verificati (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
        }
      }
      if (v.ok) {
        ok++;
        chosen.push({
          id: p.id, fen: p.fen, moves: p.moves.join(' '), rating: p.rating, theme, level: level.id,
          themes: p.themes.filter((t) => themes.includes(t)), eval: v.eval, url: p.gameUrl,
        });
      } else {
        const why = v.reason.replace(/^(mossa|risposta) \d+: /, '$1: ');
        excluded[why] = (excluded[why] ?? 0) + 1;
      }
    }
    console.log(`${theme.padEnd(17)} ${level.id.padEnd(7)} ${String(ok).padStart(2)}/${PER_BUCKET} (candidati: ${list.length})`);
  }
}
saveCache();
engine.terminate();

// ---------- 5. file generati ----------
const out = {
  generated: today(),
  source: { url: DB_URL, lastModified: meta.lastModified, license: 'CC0 1.0' },
  verification: { engine: 'Stockfish 17.1 lite (engine/)', depth: cfg.depth, multiPv: cfg.multiPv, minGap: cfg.minGap,
    replyDepth: cfg.replyDepth, replyTolerance: cfg.replyTolerance },
  puzzles: chosen,
};
writeFileSync(DIR + 'puzzles.json', JSON.stringify(out) + '\n');

const counts = themes.map((t) => `| ${UI_CONFIG.puzzles.themes.find((x) => x.id === t).label} | `
  + levels.map((l) => chosen.filter((p) => p.theme === t && p.level === l.id).length).join(' | ') + ' |').join('\n');
const sources = `# Problemi: fonte e verifica

File generato da \`npm run build:puzzles\` il ${today()}. Non modificarlo a mano.

## Fonte
- Database dei problemi di Lichess: <${DB_URL}> (ultima modifica del file: ${meta.lastModified}).
- Licenza: **CC0 1.0** (pubblico dominio), <https://database.lichess.org/#puzzles>.
- Letti in streaming il ${meta.date} i primi ${meta.rows} problemi del file (non tutto il database).
  SHA-256 delle righe lette (\`data/puzzles/source/puzzles-slice.csv\`, esclusa da git): \`${meta.sha256}\`.
- Ogni problema conserva il suo identificativo Lichess (\`https://lichess.org/training/<id>\`) e il link alla partita da cui viene.

## Selezione
- Problemi letti: ${read}; di buona qualità: ${quality} (popolarità ≥ ${MIN_POPULARITY}, partite giocate ≥ ${MIN_PLAYS},
  deviazione del punteggio ≤ ${MAX_RATING_DEVIATION}, al massimo ${MAX_MOVES} semimosse).
- Tema principale = il primo, in quest'ordine, tra i temi assegnati da Lichess: ${themes.join(', ')}.
  **I temi sono quelli di Lichess** (calcolati dal loro programma), non una nostra valutazione.
- Difficoltà dal punteggio Lichess del problema: ${levels.map((l) => `${l.label} ${l.min}–${l.max - 1}`).join(', ')}.
- Fino a ${PER_BUCKET} problemi per tema e difficoltà, prima quelli giocati da più persone (al massimo ${MAX_TRIES} candidati provati).

## Verifica con Stockfish (regole in \`src/analysis/puzzle.js\`)
- Mosse da trovare: profondità ${cfg.depth}, MultiPV ${cfg.multiPv}. La mossa deve essere la prima scelta del motore e
  l'unica buona (la seconda linea perde almeno ${cfg.minGap} punti di win%; con un matto, la seconda linea non deve dare
  un matto altrettanto veloce). All'ultima mossa basta che la mossa dia scacco matto.
- Risposte dell'avversario: profondità ${cfg.replyDepth}, MultiPV ${cfg.replyMultiPv}; prima scelta del motore o al massimo
  ${cfg.replyTolerance} punti di win% peggiore.

## Risultato: ${chosen.length} problemi
| Tema | ${levels.map((l) => l.label).join(' | ')} |
|---|${levels.map(() => '---').join('|')}|
${counts}

## Esclusi dalla verifica
${Object.entries(excluded).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- nessuno'}
`;
writeFileSync(DIR + 'SOURCES.md', sources);
console.log(`\n${chosen.length} problemi scritti in data/puzzles/puzzles.json`);
