// Versione inglese: ogni testo italiano usato con t() o presente nell'HTML ha la sua traduzione in src/i18n/en.js,
// con gli stessi segnaposto {nome}; le lezioni e la libreria hanno i testi inglesi per ogni voce.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { EN } from '../src/i18n/en.js';
import { t, setLang, detectLang, fmtNum } from '../src/i18n/i18n.js';
import { UI_CONFIG } from '../src/config/ui.js';
import { ENGINE_CONFIG } from '../src/config/engine.js';

const root = (p) => new URL(`../${p}`, import.meta.url);

/** Testi letterali passati a t(...): anche t(cond ? 'a' : 'b', …). Si fermano al primo argomento. */
export function tKeys(src) {
  const keys = [];
  const re = /\bt\(/g;
  let m;
  while ((m = re.exec(src))) {
    if (/[\w$.]/.test(src[m.index - 1] ?? '')) continue; // es. "list(", "this.t("
    let i = m.index + 2;
    let depth = 0;
    let first = '';
    // primo argomento: fino alla virgola o alla parentesi di chiusura a profondità 0
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "'" || c === '"' || c === '`') {
        let j = i + 1;
        while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
        first += src.slice(i, j + 1);
        i = j;
        continue;
      }
      if ('([{'.includes(c)) depth++;
      if (')]}'.includes(c)) { if (depth === 0) break; depth--; }
      if (c === ',' && depth === 0) break;
      first += c;
    }
    for (const s of first.matchAll(/'((?:[^'\\]|\\.)*)'/g)) keys.push(s[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  }
  return keys;
}

/** Testi e attributi visibili dell'HTML (come li normalizza translateDom). */
function htmlKeys(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const keys = [];
  for (const m of body.matchAll(/>([^<]+)</g)) keys.push(m[1]);
  for (const m of body.matchAll(/\b(?:placeholder|aria-label|title|data-sub|data-short)="([^"]*)"/g)) keys.push(m[1]);
  const decode = (s) => s.replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  return keys.map((k) => decode(k).replace(/\s+/g, ' ').trim()).filter((k) => /[A-Za-zÀ-ÿ]{2}/.test(k));
}

// Testi che restano uguali in inglese (nomi propri, sigle) o che non sono testo dell'interfaccia
const SAME = new Set(['CHES', '.com', 'CHES54.com', 'Lichess', 'Chess.com', 'FEN / PGN', 'GNU General Public License versione 3',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'Stockfish', 'EN']);

// Etichette passate a t() come variabili (configurazione e mappe interne)
const INDIRECT = [
  ...UI_CONFIG.puzzles.themes.map((x) => x.label), ...UI_CONFIG.puzzles.levels.map((x) => x.label),
  ...UI_CONFIG.examples.categories.map((x) => x.label), ...UI_CONFIG.reviewDepthPresets.map((x) => x.label),
  ...ENGINE_CONFIG.depthPresets.map((x) => x.label),
  'Tutti', 'Tutte', // filtri "tutti i temi" / "tutte le difficoltà / categorie"
  'Brillante', 'Ottima', 'Migliore', 'Eccellente', 'Buona', 'Teoria', 'Imprecisione', 'Errore', 'Errore grave', // classification.js
  'scacco matto', 'stallo', 'materiale insufficiente', 'triplice ripetizione', 'regola delle 50 mosse', 'abbandono', // play.js
  '{who} sta leggermente meglio', '{who} ha un chiaro vantaggio', '{who} ha un vantaggio decisivo', // app.js ADV_TEXT
  'Vinta', 'Persa', 'Patta', // online-games.js
];

function sourceFiles() {
  return readdirSync(root('src'), { recursive: true }).filter((f) => f.endsWith('.js') && !f.startsWith('i18n')).map((f) => `src/${f}`);
}
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('ogni testo di t() e dell\'HTML ha la traduzione inglese, con gli stessi segnaposto', () => {
  const keys = new Set(INDIRECT);
  for (const f of sourceFiles()) for (const k of tKeys(readFileSync(root(f), 'utf8'))) keys.add(k);
  for (const k of htmlKeys(readFileSync(root('index.html'), 'utf8'))) keys.add(k);
  // (le stringhe di un carattere sono confronti come c === 'w' dentro t(...), non testi)
  const missing = [...keys].filter((k) => k.length > 1 && !SAME.has(k) && EN[k] == null);
  assert.deepEqual(missing, [], `traduzioni mancanti:\n${missing.join('\n')}`);
  const wrong = [...keys].filter((k) => EN[k] != null && placeholders(k) !== placeholders(EN[k]));
  assert.deepEqual(wrong, [], 'segnaposto diversi');
});

test('t(): italiano invariato, inglese dal dizionario, segnaposto sostituiti', () => {
  setLang('it');
  assert.equal(t('Tocca al {color}: trova la mossa migliore', { color: 'Bianco' }), 'Tocca al Bianco: trova la mossa migliore');
  assert.equal(fmtNum(2.5), '2,5');
  setLang('en');
  assert.equal(t('Tocca al {color}: trova la mossa migliore', { color: 'White' }), EN['Tocca al {color}: trova la mossa migliore'].replace('{color}', 'White'));
  assert.equal(t('testo senza traduzione'), 'testo senza traduzione');
  assert.equal(fmtNum(2.5), '2.5');
  setLang('it');
});

test('detectLang: scelta salvata, altrimenti lingua del browser', () => {
  assert.equal(detectLang('en', ['it-IT']), 'en');
  assert.equal(detectLang('', ['it-IT', 'en']), 'it');
  assert.equal(detectLang('', ['de-DE', 'en-US']), 'en');
  assert.equal(detectLang('xx', []), 'en');
});

test('lezioni e libreria: testi inglesi per ogni voce e ogni passo; mosse citate verificate', () => {
  const it = JSON.parse(readFileSync(root('data/lessons/lessons.json'), 'utf8'));
  const en = JSON.parse(readFileSync(root('data/lessons/lessons.en.json'), 'utf8'));
  for (const c of it.categories) assert.ok(en.categories[c.id], `categoria ${c.id}`);
  for (const l of it.lessons) {
    const x = en.lessons[l.id];
    assert.ok(x?.title && x.summary, `lezione ${l.id}`);
    assert.equal(x.steps.length, l.steps.length, `${l.id}: numero di passi`);
    l.steps.forEach((s, i) => {
      assert.ok(x.steps[i].text, `${l.id} passo ${i + 1}: testo`);
      if (s.kind === 'explain') assert.ok(x.steps[i].title, `${l.id} passo ${i + 1}: titolo`);
      if (s.kind === 'exercise') assert.ok(x.steps[i].success, `${l.id} passo ${i + 1}: success`);
    });
  }
  const catalog = JSON.parse(readFileSync(root('data/examples/catalog.json'), 'utf8'));
  const lib = JSON.parse(readFileSync(root('data/examples/index.en.json'), 'utf8'));
  const index = JSON.parse(readFileSync(root('data/examples/index.json'), 'utf8'));
  for (const g of index.games) {
    const x = lib.games[g.id];
    assert.ok(x?.event && x.famous, `libreria ${g.id}`);
    // Le mosse citate nel testo inglese devono essere tra quelle verificate sulla partita (catalog.mentions)
    const entry = catalog.games.find((c) => c.id === g.id);
    for (const m of x.famous.matchAll(/\b\d+\.(?:\.\.)?[KQRBN]?[a-h]?x?[a-h][1-8][+#]?/g)) {
      if (x.notMoves?.includes(m[0])) continue; // riferimento storico dichiarato, non una mossa della partita
      assert.ok(entry.mentions?.includes(m[0]), `${g.id}: ${m[0]} non è tra le mosse verificate`);
    }
  }
});

test('inglese: spiegazioni, notazione e messaggi d\'errore', async () => {
  const { formatExplanation } = await import('../src/ui/explanations.js');
  const { toItalian, parseUserMove } = await import('../src/ui/notation.js');
  const { Chess } = await import('../lib/chess.js');
  const { gameFromPgn } = await import('../src/analysis/game-model.js');
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  setLang('en');
  try {
    assert.equal(formatExplanation({ kind: 'allowsMate', mateIn: 2, line: { fen: start, pv: ['g1f3'] } }).text, 'Allows the opponent to mate in 2.');
    assert.equal(toItalian('Nf3'), 'Nf3');
    // "R" in inglese è la torre: Rf1 non deve diventare una mossa del re
    const c = new Chess('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
    assert.deepEqual(parseUserMove(c, 'Rd1'), { from: 'a1', to: 'd1', promotion: undefined });
    assert.throws(() => gameFromPgn('1. e4 e5 2. Ke3'), /Illegal move: 2\. Ke3/);
  } finally {
    setLang('it');
  }
  assert.equal(toItalian('Nf3'), 'Cf3');
});
