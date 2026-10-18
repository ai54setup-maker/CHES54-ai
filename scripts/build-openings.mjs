// Converte il dataset lichess-org/chess-openings (data/openings/source/*.tsv) in una tabella
// di posizioni: data/openings/openings.json.
//
//   node scripts/build-openings.mjs
//
// Ogni riga del dataset è una linea d'apertura con nome. Salviamo:
//  - la posizione finale della linea, con ECO e nome;
//  - tutte le posizioni intermedie della linea, senza nome: servono a riconoscere le mosse "Book".
// Chiave = primi 4 campi della FEN (come la cache del motore).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from '../lib/chess.js';
import { parsePgn } from '../src/analysis/pgn.js';
import { positionKey } from '../src/engine/cache.js';

const dir = fileURLToPath(new URL('../data/openings/', import.meta.url));
const files = readdirSync(dir + 'source').filter((f) => f.endsWith('.tsv')).sort();

/** @type {Record<string, [string, string] | 0>} */
const positions = {};
let named = 0;
let duplicates = 0;

for (const file of files) {
  const rows = readFileSync(dir + 'source/' + file, 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    for (const { san } of parsePgn(pgn).moves) {
      chess.move(san);
      const key = positionKey(chess.fen());
      if (!(key in positions)) positions[key] = 0;
    }
    const key = positionKey(chess.fen());
    if (positions[key] !== 0) {
      duplicates++; // stessa posizione con due nomi (trasposizione): teniamo il primo
      continue;
    }
    positions[key] = [eco, name];
    named++;
  }
}

writeFileSync(dir + 'openings.json', JSON.stringify({ source: 'lichess-org/chess-openings (CC0)', positions }));
console.log(`${files.length} file, ${Object.keys(positions).length} posizioni, ${named} con nome, ${duplicates} duplicati ignorati`);
