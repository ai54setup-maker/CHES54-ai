// Sezione Aperture: albero delle varianti, statistiche dalle partite, ripasso; integrità dei file generati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Chess } from '../lib/chess.js';
import { positionKey } from '../src/engine/cache.js';
import { UI_CONFIG } from '../src/config/ui.js';
import {
  buildTree, splitName, normSan, groupOf, speedOf, bandOf, movetextSans, addGame, compactStats, scoreFor, trainingStep, repKey,
} from '../src/analysis/opening-tree.js';

const ROWS = [
  { eco: 'B20', name: 'Sicilian Defense', pgn: '1. e4 c5' },
  { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', pgn: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6' },
  { eco: 'C20', name: "King's Pawn Game", pgn: '1. e4 e5' },
  { eco: 'A40', name: "Queen's Pawn Game", pgn: '1. d4' },
  // Trasposizione: 1.Nf3 d5 2.d4 arriva alla stessa posizione di 1.d4 d5 2.Nf3
  { eco: 'D02', name: "Queen's Pawn Game: Zukertort Variation", pgn: '1. d4 d5 2. Nf3' },
  { eco: 'A06', name: 'Zukertort Opening: Queen Pawn Defense', pgn: '1. Nf3 d5 2. d4' },
];
const bands = UI_CONFIG.openings.ratingBands;

test('nomi, gruppi, SAN e cadenze', () => {
  assert.deepEqual(splitName('Sicilian Defense: Najdorf Variation, English Attack'), { family: 'Sicilian Defense', variation: 'Najdorf Variation, English Attack' });
  assert.deepEqual(splitName('Amar Opening'), { family: 'Amar Opening', variation: '' });
  assert.equal(groupOf('e4'), 'e4');
  assert.equal(groupOf('Nf3'), 'Nf3');
  assert.equal(groupOf('g3'), 'other');
  assert.equal(normSan('Qxf7#'), 'Qxf7');
  assert.equal(normSan('Bb5+'), 'Bb5');
  assert.equal(speedOf('60+0'), 'bullet');
  assert.equal(speedOf('180+2'), 'blitz');
  assert.equal(speedOf('600+0'), 'rapid');
  assert.equal(speedOf('1800+20'), 'classical');
  assert.equal(speedOf('-'), 'correspondence');
  assert.equal(bandOf(999, bands), 'u1000');
  assert.equal(bandOf(1400, bands), 'b1400');
  assert.equal(bandOf(2500, bands), 'b2200');
});

test('buildTree: un nodo per posizione, trasposizioni sullo stesso nodo, varianti con il percorso', () => {
  const { nodes, lines } = buildTree(ROWS);
  const root = [...nodes.values()].find((n) => n.id === 'root');
  assert.deepEqual([...root.edges.keys()].sort(), ['Nf3', 'd4', 'e4']);
  const najdorf = lines.find((l) => l.variation === 'Najdorf Variation');
  assert.equal(najdorf.family, 'Sicilian Defense');
  assert.equal(najdorf.group, 'e4');
  assert.equal(najdorf.path.length, 10);
  assert.equal(najdorf.path[0], 'e2e4');
  // Trasposizione
  const after = (pgn) => { const c = new Chess(); for (const m of pgn) c.move(m); return positionKey(c.fen()); };
  const k = after(['d4', 'd5', 'Nf3']);
  assert.equal(k, after(['Nf3', 'd5', 'd4']));
  const n = nodes.get(k);
  assert.equal(n.named.name, "Queen's Pawn Game: Zukertort Variation"); // vale il primo nome
  assert.equal(lines.filter((l) => l.node === n.id).length, 2);
});

test('statistiche: si segue l\'albero, fascia di chi muove, risultato; ci si ferma fuori dall\'albero', () => {
  const { nodes } = buildTree(ROWS);
  const byId = new Map([...nodes.values()].map((x) => [x.id, x]));
  const stats = new Map();
  const sans = movetextSans('1. e4 { [%clk 0:03:00] } c5 2. Nf3 d6 3. Bb5+ Bd7 1-0', 30);
  assert.deepEqual(sans, ['e4', 'c5', 'Nf3', 'd6', 'Bb5+', 'Bd7']);
  addGame(stats, byId, sans, { white: 1500, black: 2300, result: '1-0' }, bands);
  addGame(stats, byId, ['e4', 'e5'], { white: 1500, black: 1450, result: '1/2-1/2' }, bands);
  addGame(stats, byId, ['e4'], { white: 1500, black: 1450, result: '*' }, bands); // senza risultato: ignorata
  const root = stats.get('root');
  assert.deepEqual(root.b1400.e4, [2, 1, 1, 0]); // 2 partite: 1 vinta dal Bianco, 1 patta
  const afterE4 = stats.get(nodes.get(positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).id);
  assert.deepEqual(afterE4.b2200.c5, [1, 1, 0, 0]); //  il Nero (2300) ha giocato c5
  assert.deepEqual(afterE4.b1400.e5, [1, 0, 1, 0]);
  // 3.Bb5+ è fuori dall'albero: viene contata, poi ci si ferma (3...Bd7 non si conta)
  const afterD6 = [...stats.entries()].find(([, v]) => v.b1400?.Bb5);
  assert.ok(afterD6, 'la mossa fuori dall\'albero non è contata');
  assert.equal([...stats.values()].some((v) => v.b2200?.Bd7), false);
  const c = compactStats(root, 1);
  assert.deepEqual(c.b1400, [2, [['e4', 2, 1, 1, 0]]]);
  assert.deepEqual(scoreFor(['e4', 4, 2, 1, 1], 'b'), { win: 25, draw: 25, loss: 50 });
});

test('ripasso: l\'app gioca l\'avversario, chi si allena le sue mosse', () => {
  const path = ['e2e4', 'c7c5', 'g1f3'];
  assert.deepEqual(trainingStep(path, 'w', 0), { who: 'user', uci: 'e2e4' });
  assert.deepEqual(trainingStep(path, 'w', 1), { who: 'app', uci: 'c7c5' });
  assert.deepEqual(trainingStep(path, 'b', 0), { who: 'app', uci: 'e2e4' });
  assert.deepEqual(trainingStep(path, 'b', 3), { who: 'done' });
  assert.equal(repKey(path, 'b'), 'b|e2e4 c7c5 g1f3');
});

test('file generati: catalogo e albero coerenti, valutazioni di Stockfish presenti', { skip: !existsSync(new URL('../data/openings/tree/index.json', import.meta.url)) }, () => {
  const idx = JSON.parse(readFileSync(new URL('../data/openings/tree/index.json', import.meta.url), 'utf8'));
  const trees = {};
  for (const g of ['e4', 'd4', 'c4', 'Nf3', 'other']) trees[g] = JSON.parse(readFileSync(new URL(`../data/openings/tree/tree-${g}.json`, import.meta.url), 'utf8')).nodes;
  const get = (id) => (id === 'root' ? idx.root : trees[id.split(':')[0]][id]);
  assert.ok(idx.families.length >= 100);
  let checked = 0;
  for (const f of idx.families) {
    for (const v of f.variations) {
      // Il percorso della variante si segue negli archi dell'albero e arriva al nodo indicato
      let node = idx.root;
      let id = 'root';
      for (const uci of v.path.split(' ')) {
        const e = node.c.find((x) => x[1] === uci);
        assert.ok(e, `${v.full}: ${uci} non è un arco dell'albero`);
        id = e[2];
        node = get(id);
      }
      assert.equal(id, v.node, v.full);
      checked++;
    }
  }
  assert.equal(checked, 3865);
  for (const nodes of Object.values(trees)) {
    for (const [id, n] of Object.entries(nodes)) {
      // Le posizioni finali (es. il matto di Légal) non hanno mosse da valutare
      if (!new Chess(`${n.k} 0 1`).moves().length) continue;
      assert.ok(Array.isArray(n.s) && n.s[3] >= 1, `${id}: manca la valutazione di Stockfish`);
      // La mossa consigliata è legale nella posizione
      if (n.s[2]) assert.ok(new Chess(`${n.k} 0 1`).moves({ verbose: true }).some((m) => m.from + m.to + (m.promotion ?? '') === n.s[2]), id);
    }
  }
});
