// Idee delle aperture: famiglie esistenti, testi in italiano e inglese, e ogni mossa citata con il numero
// (es. 2.Cf3, 3...exd4) presente a quel punto in una variante della famiglia (dataset lichess-org/chess-openings).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from '../lib/chess.js';
import { normSan } from '../src/analysis/opening-tree.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const index = read('data/openings/tree/index.json');
const it = read('data/openings/ideas.json');
const en = read('data/openings/ideas.en.json');
const IT_TO_EN = { R: 'K', D: 'Q', T: 'R', A: 'B', C: 'N' };
const MOVE = /\b(\d+)\.(\.\.)?([KQRBNDTAC]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBNDTAC])?[+#]?|O-O(?:-O)?)/g;

/** SAN di ogni variante delle famiglie che iniziano con questo nome (es. "Center Game" → anche "Center Game Accepted"). */
function lines(family) {
  return index.families.filter((f) => f.name === family || f.name.startsWith(`${family} `)).flatMap((f) => f.variations.map((v) => {
    const c = new Chess();
    return v.path.split(' ').map((u) => normSan(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san));
  }));
}

test('idee: famiglie del catalogo, stesse famiglie in italiano e in inglese', () => {
  const names = new Set(index.families.map((f) => f.name));
  assert.equal(Object.keys(it.families).length, 20);
  for (const [name, f] of Object.entries(it.families)) {
    assert.ok(names.has(name), `famiglia inesistente: ${name}`);
    assert.ok(f.text.length >= 1 && f.text.every((p) => p.length > 20), name);
    assert.ok(en.families[name]?.text.length === f.text.length, `${name}: testo inglese mancante o di lunghezza diversa`);
  }
});

test('idee: ogni mossa citata con il numero esiste a quel punto in una variante della famiglia', () => {
  for (const [lang, file, toEn] of [['it', it, (s) => s.replace(/^[RDTAC]/, (c) => IT_TO_EN[c]).replace(/=([DTAC])/, (m, c) => `=${IT_TO_EN[c]}`)], ['en', en, (s) => s]]) {
    for (const [name, f] of Object.entries(file.families)) {
      const ls = lines(name);
      for (const p of f.text) {
        for (const m of p.matchAll(MOVE)) {
          const ply = (Number(m[1]) - 1) * 2 + (m[2] ? 1 : 0);
          const san = normSan(toEn(m[3]));
          assert.ok(ls.some((l) => l[ply] === san), `${lang} · ${name}: ${m[0]} non è in nessuna variante della famiglia`);
        }
      }
    }
  }
});
