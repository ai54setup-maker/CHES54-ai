// Perft: numero di posizioni raggiungibili in N semimosse. Verifica la generazione delle mosse
// (arrocco, en passant, promozioni, inchiodature, scacchi) di chess.js con due controlli indipendenti:
//  1. i valori di riferimento pubblicati: https://www.chessprogramming.org/Perft_Results
//  2. il perft calcolato da Stockfish ("go perft N").
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Chess } from '../lib/chess.js';
import { nodeTransport } from '../src/engine/node-transport.js';

const POSITIONS = [
  { name: 'posizione iniziale', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', counts: [20, 400, 8902, 197281] },
  { name: 'Kiwipete (arrocchi, en passant, promozioni)', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', counts: [48, 2039, 97862] },
  { name: 'posizione 3 (en passant con scacco scoperto)', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', counts: [14, 191, 2812, 43238, 674624] },
  { name: 'posizione 4 (promozioni e arrocco)', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', counts: [6, 264, 9467] },
  { name: 'posizione 5', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', counts: [44, 1486, 62379] },
  { name: 'posizione 6', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', counts: [46, 2079, 89890] },
];

for (const p of POSITIONS) {
  test(`perft chess.js: ${p.name}`, () => {
    p.counts.forEach((expected, i) => {
      assert.equal(new Chess(p.fen).perft(i + 1), expected, `profondità ${i + 1}`);
    });
  });
}

// Controllo incrociato con Stockfish (motore reale, in un processo separato)
const transport = nodeTransport(fileURLToPath(new URL('../engine/stockfish.js', import.meta.url)));
let waiting = null;
transport.onLine((line) => {
  const m = line.match(/^Nodes searched: (\d+)/);
  if (m && waiting) waiting(Number(m[1]));
});
transport.onError(() => {});
after(() => transport.terminate());
const stockfishPerft = (fen, depth) => new Promise((resolve) => {
  waiting = resolve;
  transport.send(`position fen ${fen}`);
  transport.send(`go perft ${depth}`);
});

test('perft: chess.js e Stockfish danno gli stessi numeri', async () => {
  transport.send('uci');
  for (const p of POSITIONS) {
    const depth = Math.min(3, p.counts.length);
    assert.equal(await stockfishPerft(p.fen, depth), p.counts[depth - 1], `${p.name}, profondità ${depth}`);
  }
});
