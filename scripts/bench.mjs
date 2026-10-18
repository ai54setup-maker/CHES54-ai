// Misura il tempo di analisi di una partita intera con diverse impostazioni del motore.
//
//   node scripts/bench.mjs [partita.pgn] [--depths 10,14,18] [--multipv 1,2]
//
// Ogni misura parte con la memoria del motore vuota (come la revisione nell'app).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Engine } from '../src/engine/engine.js';
import { nodeTransport } from '../src/engine/node-transport.js';
import { gameFromPgn } from '../src/analysis/game-model.js';
import { analyzeGame } from '../src/analysis/game-analyzer.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { depths: { type: 'string', default: '10,14,18' }, multipv: { type: 'string', default: '1,2' } },
});
const game = gameFromPgn(readFileSync(positionals[0] ?? root('data/examples/games/kasparov-topalov-1999.pgn'), 'utf8'));
const positions = game.plies.length + 1;
console.log(`Partita: ${game.headers.White ?? '?'} – ${game.headers.Black ?? '?'}, ${game.plies.length} semimosse (${positions} posizioni)\n`);
console.log('profondità  MultiPV   tempo totale   per posizione   Bianco/Nero (precisione)');

for (const depth of values.depths.split(',').map(Number)) {
  for (const multiPv of values.multipv.split(',').map(Number)) {
    // Motore nuovo per ogni misura: nessuna cache tra una misura e l'altra
    const engine = new Engine(nodeTransport(root('engine/stockfish.js')));
    await engine.ready;
    const t0 = performance.now();
    const a = await analyzeGame(game, engine, { settings: { depth, multiPv, movetimeMs: null } });
    const ms = performance.now() - t0;
    engine.terminate();
    const acc = `${a.players.w.accuracy.toFixed(1)} / ${a.players.b.accuracy.toFixed(1)}`;
    console.log(`${String(depth).padStart(10)}  ${String(multiPv).padStart(7)}   ${(ms / 1000).toFixed(1).padStart(10)} s   ${(ms / positions).toFixed(0).padStart(10)} ms   ${acc}`);
  }
}
