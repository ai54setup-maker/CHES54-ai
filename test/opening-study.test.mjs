// Studio delle aperture: nomi univoci, diramazioni, prossima mossa (Impara e Ripasso), mossa fuori teoria,
// scelta del colore, scelta della variante da ripassare, migrazione dei vecchi ripassi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  uniqueLabels, familyTrie, familyRows, walk, commonPath, nextStep, judgeStudyMove, pickReview, migrateReps, numbered, firstVariationBelow,
} from '../src/analysis/opening-study.js';

// Gambetto di donna in piccolo (percorsi come nel dataset)
const QG = [
  { name: '', path: ['d2d4', 'd7d5', 'c2c4'] },
  { name: 'Accepted', path: ['d2d4', 'd7d5', 'c2c4', 'd5c4'] },
  { name: 'Accepted, Normal Variation', path: ['d2d4', 'd7d5', 'c2c4', 'd5c4', 'g1f3'] },
  { name: 'Declined', path: ['d2d4', 'd7d5', 'c2c4', 'e7e6'] },
  { name: 'Declined, Orthodox', path: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6'] },
  { name: 'Declined, Alatortsev', path: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'f8e7'] },
];

test('nomi univoci: le omonime si distinguono con la mossa da cui si separano (anche in tutto il dataset)', () => {
  // Come la Hippopotamus Defense: due "linee principali", una prefisso dell'altra
  const hippo = [{ name: '', path: ['e2e4', 'g8h6'] }, { name: '', path: ['e2e4', 'g8h6', 'd2d4', 'g7g6', 'c2c4', 'f7f6'] }];
  assert.deepEqual(uniqueLabels(hippo, 'Linea principale'), ['Linea principale (1...Nh6)', 'Linea principale (2.d4)']);
  assert.deepEqual(uniqueLabels(hippo, 'Linea principale', (s) => s.replace('N', 'C')), ['Linea principale (1...Ch6)', 'Linea principale (2.d4)']);
  assert.deepEqual(uniqueLabels(QG, 'Main line'), ['Main line', 'Accepted', 'Accepted, Normal Variation', 'Declined', 'Declined, Orthodox', 'Declined, Alatortsev']);
  const idx = JSON.parse(readFileSync(new URL('../data/openings/tree/index.json', import.meta.url), 'utf8'));
  for (const f of idx.families) {
    const labels = uniqueLabels(f.variations.map((v) => ({ name: v.name, path: v.path.split(' ') })), 'Linea principale');
    assert.equal(new Set(labels).size, labels.length, `${f.name}: nomi doppi`);
  }
});

test('albero della famiglia: tronco comune e diramazioni leggibili ("se gioca X → variante")', () => {
  const trie = familyTrie(QG);
  assert.deepEqual(commonPath(trie), ['d2d4', 'd7d5', 'c2c4']);
  const labels = uniqueLabels(QG, 'Linea principale');
  const { trunk, rows } = familyRows(trie, labels);
  assert.deepEqual(trunk.moves, ['1.d4', '1...d5', '2.c4']);
  assert.equal(trunk.label, 'Linea principale');
  assert.deepEqual(rows.map((r) => [r.moves[0], r.label]), [['2...dxc4', 'Accepted'], ['2...e6', 'Declined']]);
  const declined = rows[1];
  // 3.Nc3 (unica mossa della teoria, senza nome) si ferma dove il Nero ha due risposte: "se 3...Nf6 → …, se 3...Be7 → …"
  assert.deepEqual(declined.children.map((r) => [r.moves.join(' '), r.label]), [['3.Nc3', null]]);
  assert.deepEqual(declined.children[0].children.map((r) => [r.moves.join(' '), r.label]), [['3...Nf6', 'Declined, Orthodox'], ['3...Be7', 'Declined, Alatortsev']]);
  assert.equal(numbered(4, 'Nc3'), '3.Nc3');
  assert.equal(firstVariationBelow(walk(trie, ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3'])), 4);
});

test('scelta del colore e prossimo passo: l\'app muove l\'avversario, diramazioni, fine', () => {
  const trie = familyTrie(QG);
  // Con il Bianco: tocca a me alla prima mossa
  assert.equal(nextStep({ trie, path: [], color: 'w', plan: null }).who, 'user');
  // Con il Nero: la prima mossa la gioca l'app
  assert.deepEqual(nextStep({ trie, path: [], color: 'b', plan: null }), { who: 'app', uci: 'd2d4' });
  // Impara con il Bianco, dopo 2.c4: l'avversario ha due risposte teoriche → diramazione
  const fork = nextStep({ trie, path: ['d2d4', 'd7d5', 'c2c4'], color: 'w', plan: null });
  assert.equal(fork.who, 'fork');
  assert.deepEqual(fork.options.map((o) => o.uci), ['d5c4', 'e7e6']);
  // Con una variante scelta (piano) l'app gioca la risposta del piano, niente diramazione
  const plan = QG[4].path;
  assert.deepEqual(nextStep({ trie, path: ['d2d4', 'd7d5', 'c2c4'], color: 'w', plan }), { who: 'app', uci: 'e7e6' });
  assert.deepEqual(nextStep({ trie, path: plan.slice(0, 4), color: 'w', plan }).planned, 'b1c3');
  assert.equal(nextStep({ trie, path: plan, color: 'w', plan }).who, 'end');
});

test('mossa fuori teoria: riconosciuta, con la mossa della teoria da rimettere', () => {
  const trie = familyTrie(QG);
  const path = ['d2d4', 'd7d5'];
  assert.equal(judgeStudyMove(trie, path, 'c2c4').theory, true);
  assert.deepEqual(judgeStudyMove(trie, path, 'g1f3'), { theory: false, expected: ['c2c4'] });
  // Con un piano la mossa attesa è quella del piano
  assert.deepEqual(judgeStudyMove(trie, ['d2d4', 'd7d5', 'c2c4', 'e7e6'], 'g1f3', 'b1c3'), { theory: false, expected: ['b1c3'] });
});

test('ripasso: prima le varianti studiate e non imparate, altrimenti una a caso; migrazione dei vecchi dati', () => {
  const reps = [
    { color: 'w', path: QG[4].path.join(' '), box: 1 },
    { color: 'w', path: QG[5].path.join(' '), box: 3 }, // imparata
    { color: 'b', path: QG[3].path.join(' '), box: 0 }, // altro colore
  ];
  assert.deepEqual(pickReview(QG, reps, 'w', () => 0.99), QG[4].path);
  assert.deepEqual(pickReview(QG, [], 'w', () => 0), QG[0].path);
  const old = [{ id: 'w|d2d4 d7d5 c2c4', name: "Queen's Gambit", color: 'w', path: 'd2d4 d7d5 c2c4', box: 2, tries: 3, addedAt: 5 }, { bad: true }];
  const m = migrateReps(old, () => "Queen's Gambit");
  assert.equal(m.length, 1);
  assert.deepEqual(m[0], { id: 'w|d2d4 d7d5 c2c4', name: "Queen's Gambit", color: 'w', path: 'd2d4 d7d5 c2c4', box: 2, tries: 3, addedAt: 5, family: "Queen's Gambit" });
});

test('catalogo: famiglie unite (Queen\'s Gambit + Accepted + Declined) e albero con le due risposte del Nero', async () => {
  const { mergeFamilies, mainPathOf } = await import('../src/analysis/opening-study.js');
  const { UI_CONFIG } = await import('../src/config/ui.js');
  const idx = JSON.parse(readFileSync(new URL('../data/openings/tree/index.json', import.meta.url), 'utf8'));
  const openings = mergeFamilies(idx.families);
  assert.equal(openings.reduce((s, o) => s + o.variations.length, 0), 3865); // nessuna variante persa
  const qg = openings.find((o) => o.name === "Queen's Gambit" && o.group === 'd4');
  assert.ok(!openings.some((o) => o.name === "Queen's Gambit Declined" && o.group === 'd4')); // unita a Queen's Gambit
  const vars = qg.variations.map((v) => ({ name: v.name, path: v.path.split(' ') }));
  const main = mainPathOf(vars);
  assert.deepEqual(main, ['d2d4', 'd7d5', 'c2c4']);
  const { trunk, rows, others } = familyRows(familyTrie(vars), uniqueLabels(vars, 'Linea principale'), vars, main);
  assert.deepEqual(trunk.moves, ['1.d4', '1...d5', '2.c4']);
  assert.ok(others.length > 0 && others.every((o) => o.path.slice(0, 3).join(' ') !== 'd2d4 d7d5 c2c4')); // altri ordini di mosse
  const first = Object.fromEntries(rows.map((r) => [r.moves[0], r.label ?? '']));
  assert.match(first['2...dxc4'], /^Accepted/);
  assert.match(first['2...e6'], /^Declined/);
  // Nomi italiani: solo aperture che esistono nel catalogo
  const names = new Set(openings.map((o) => o.name));
  for (const k of Object.keys(UI_CONFIG.openings.italianNames)) assert.ok(names.has(k), `nome italiano per un'apertura inesistente: ${k}`);
});
