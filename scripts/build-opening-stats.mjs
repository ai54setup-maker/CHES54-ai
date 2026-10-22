// Statistiche reali delle aperture per fascia di punteggio Lichess (sezione Aperture).
//
//   npm run build:opening-stats                 (~10–20 minuti: dipende soprattutto dalla connessione)
//   npm run build:opening-stats -- latest 50000  (prova veloce con poche partite)
//
// Fonte: database delle partite di Lichess, https://database.lichess.org/ (licenza CC0), file mensile più recente.
// Lo script legge in streaming solo l'inizio del file (UI_CONFIG.openings.games partite, ~330 MB ogni milione):
// tiene le partite valutate nelle cadenze scelte, segue le mosse lungo l'albero del dataset delle aperture e conta,
// per ogni posizione e per la fascia di chi muove, la mossa giocata e il risultato finale.
// Scrive data/openings/tree/stats-<gruppo>.json e data/openings/STATS-SOURCES.md.
// Nessun account e nessuna API: il file è un download pubblico.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createZstdDecompress } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { UI_CONFIG } from '../src/config/ui.js';
import { buildTree, readTsv, GROUPS, speedOf, movetextSans, addGame, compactStats } from '../src/analysis/opening-tree.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const CFG = UI_CONFIG.openings;
const LIST = 'https://database.lichess.org/standard/list.txt';

const rows = readdirSync(root('data/openings/source/')).filter((f) => f.endsWith('.tsv')).sort()
  .flatMap((f) => readTsv(readFileSync(root(`data/openings/source/${f}`), 'utf8')));
const { nodes } = buildTree(rows);
const byId = new Map([...nodes.values()].map((n) => [n.id, n]));

const arg = process.argv[2];
const url = arg && arg !== 'latest' ? arg : (await (await fetch(LIST)).text()).trim().split('\n')[0];
const GAMES = Number(process.argv[3]) || CFG.games;
console.log(`Fonte: ${url}\nLeggo ${GAMES.toLocaleString('it-IT')} partite…`);
const t0 = Date.now();
const res = await fetch(url);
if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
const lastModified = res.headers.get('last-modified');
let bytes = 0;
const body = Readable.fromWeb(res.body);
body.on('data', (d) => { bytes += d.length; });
const input = body.pipe(createZstdDecompress());
const rl = createInterface({ input, crlfDelay: Infinity });

const stats = new Map();
let read = 0;
let kept = 0;
let h = {};
for await (const line of rl) {
  if (line.startsWith('[')) {
    const m = /^\[(\w+) "(.*)"\]$/.exec(line);
    if (m) h[m[1]] = m[2];
    continue;
  }
  if (!line.startsWith('1.')) continue;
  // Riga delle mosse: fine di una partita
  read++;
  const white = Number(h.WhiteElo);
  const black = Number(h.BlackElo);
  if (CFG.speeds.includes(speedOf(h.TimeControl)) && white && black && (!h.Variant || h.Variant === 'Standard')) {
    kept++;
    addGame(stats, byId, movetextSans(line, CFG.maxPlies), { white, black, result: h.Result }, CFG.ratingBands);
  }
  h = {};
  if (read % 500000 === 0) console.log(`  ${read.toLocaleString('it-IT')} lette, ${kept.toLocaleString('it-IT')} tenute (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (read >= GAMES) break;
}
rl.close();
input.destroy();
body.destroy();

// ---------- file per l'app ----------
const bandIds = CFG.ratingBands.map((b) => b.id);
// Un file per gruppo; la posizione iniziale in un file a parte (serve qualunque sia la prima mossa)
for (const g of [...GROUPS, { id: 'root' }]) {
  const out = {};
  for (const [id, perNode] of stats) {
    if (byId.get(id).group !== g.id) continue;
    const c = compactStats(perNode, CFG.topMoves);
    // Fasce con troppo poche partite: non si salvano (l'app non le mostra) → 0
    const row = bandIds.map((b) => (c[b] && c[b][0] >= CFG.minGamesShown ? c[b] : 0));
    if (row.some(Boolean)) out[id] = row;
  }
  writeFileSync(root(`data/openings/tree/stats-${g.id}.json`), JSON.stringify({ bands: bandIds, nodes: out }) + '\n');
}
const perBand = Object.fromEntries(bandIds.map((b) => [b, stats.get('root')?.[b] ? Object.values(stats.get('root')[b]).reduce((s, v) => s + v[0], 0) : 0]));
writeFileSync(root('data/openings/STATS-SOURCES.md'), `# Statistiche delle aperture: fonte

File generato da \`npm run build:opening-stats\` il ${new Date().toISOString().slice(0, 10)}. Non modificarlo a mano.

- Fonte: database delle partite di Lichess, <${url}> (ultima modifica: ${lastModified}).
- Licenza: **CC0 1.0** (pubblico dominio), <https://database.lichess.org/>. Nessun account né API: download pubblico.
- Lette le prime ${read.toLocaleString('it-IT')} partite del file (${(bytes / 1e9).toFixed(2)} GB compressi), tenute
  ${kept.toLocaleString('it-IT')}: partite valutate in cadenza ${CFG.speeds.join(', ')} (bullet escluso), con entrambi i punteggi.
- Per ogni posizione dell'albero (dataset lichess-org/chess-openings) si conta la mossa giocata e il risultato finale,
  nella fascia di **chi muove**. Ci si ferma alla prima mossa che esce dall'albero (che viene comunque contata).
- **Fasce di punteggio Lichess (non Elo FIDE):** ${CFG.ratingBands.map((b) => b.label).join(', ')}.
- Partite per fascia (prima mossa del Bianco): ${CFG.ratingBands.map((b) => `${b.label}: ${perBand[b.id].toLocaleString('it-IT')}`).join('; ')}.
- Tenute per posizione e fascia le ${CFG.topMoves} mosse più giocate. Nell'app le statistiche di una posizione si mostrano
  solo con almeno ${CFG.minGamesShown} partite nella fascia.
`);
console.log(`Fatto in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${kept.toLocaleString('it-IT')} partite usate.`);
process.exit(0);
