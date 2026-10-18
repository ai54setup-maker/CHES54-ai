// Analizza una partita PGN da riga di comando, senza browser.
//
//   node scripts/analyze-pgn.mjs partita.pgn [--depth 14] [--multipv 2] [--movetime 500] [--game 1] [--json]
//
// Usa lo stesso codice dell'app (src/) con Stockfish eseguito in Node.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Engine } from '../src/engine/engine.js';
import { nodeTransport } from '../src/engine/node-transport.js';
import { ANALYSIS_CONFIG } from '../src/config/analysis.js';
import { splitPgnGames } from '../src/analysis/pgn.js';
import { gameFromPgn } from '../src/analysis/game-model.js';
import { OpeningBook } from '../src/analysis/openings.js';
import { analyzeGame } from '../src/analysis/game-analyzer.js';
import { formatScore } from '../src/engine/score.js';
import { formatExplanation } from '../src/ui/explanations.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    depth: { type: 'string' },
    multipv: { type: 'string' },
    movetime: { type: 'string' },
    game: { type: 'string', default: '1' },
    json: { type: 'boolean', default: false },
  },
});
if (!positionals[0]) {
  console.error('Uso: node scripts/analyze-pgn.mjs partita.pgn [--depth N] [--multipv N] [--movetime ms] [--game N] [--json]');
  process.exit(1);
}

const games = splitPgnGames(readFileSync(positionals[0], 'utf8'));
const game = gameFromPgn(games[Number(values.game) - 1] ?? '');
const settings = {
  ...ANALYSIS_CONFIG.gameAnalysis,
  ...(values.depth && { depth: Number(values.depth) }),
  ...(values.multipv && { multiPv: Number(values.multipv) }),
  ...(values.movetime && { movetimeMs: Number(values.movetime) }),
};
const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const book = new OpeningBook(JSON.parse(readFileSync(root(ANALYSIS_CONFIG.openings.dataUrl), 'utf8')));
const engine = new Engine(nodeTransport(root('engine/stockfish.js')));

try {
  const a = await analyzeGame(game, engine, {
    book,
    settings,
    onProgress: (d, t) => process.stderr.write(`\rAnalisi: ${d}/${t} posizioni`),
  });
  process.stderr.write('\n');
  if (values.json) {
    console.log(JSON.stringify(a, null, 1));
  } else {
    print(a);
  }
} finally {
  engine.terminate();
}

function print(a) {
  const h = a.headers;
  console.log(`${h.White ?? '?'} – ${h.Black ?? '?'}  ${a.result}`);
  if (a.opening) console.log(`Apertura: ${a.opening.eco} ${a.opening.name}`);
  console.log(`Motore: profondità ${a.settings.depth ?? '-'}, MultiPV ${a.settings.multiPv}, tempo ${a.settings.movetimeMs ?? '-'} ms\n`);
  for (const m of a.moves) {
    const p = m.ply;
    const num = `${p.moveNumber}${p.color === 'w' ? '.' : '...'}`;
    const evalAfter = m.after.terminal === 'checkmate' ? '#' : formatScore(m.after.score);
    const best = m.isBest ? '' : `  (migliore: ${m.bestSan})`;
    console.log(`${num.padStart(5)} ${p.san.padEnd(8)} ${m.classification.padEnd(10)} prec ${m.accuracy.toFixed(0).padStart(3)}  perdita ${m.winLoss.toFixed(1).padStart(5)}  eval ${evalAfter}${best}`);
    for (const e of m.explanations) {
      const { text, line } = formatExplanation(e);
      console.log(`        ↳ ${text}  [${line}]`);
    }
  }
  console.log('');
  for (const [color, name] of [['w', 'Bianco'], ['b', 'Nero']]) {
    const pl = a.players[color];
    const counts = Object.entries(pl.counts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ');
    console.log(`${name}: precisione ${fmt(pl.accuracy)} (media semplice ${fmt(pl.meanAccuracy)}) — ${counts}`);
  }
  if (a.keyMoments.length) {
    console.log('\nMomenti chiave:');
    for (const k of a.keyMoments) {
      const p = a.moves[k.index].ply;
      console.log(`  ${p.moveNumber}${p.color === 'w' ? '.' : '...'} ${p.san}  win% Bianco ${k.swing > 0 ? '+' : ''}${k.swing.toFixed(1)}`);
    }
  }
  console.log(`\nTempo di analisi: ${(a.durationMs / 1000).toFixed(1)} s`);
}

function fmt(v) {
  return v == null ? '-' : v.toFixed(1);
}
