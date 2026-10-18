// Regola di CLAUDE.md: ogni file servito va nella lista FILES di sw.js (per l'uso offline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = (p) => new URL(`../${p}`, import.meta.url);
const sw = readFileSync(root('sw.js'), 'utf8');

test('sw.js: tutti i moduli di src/ (tranne quelli solo per Node) sono nella cache offline', () => {
  const modules = readdirSync(root('src'), { recursive: true })
    .filter((f) => f.endsWith('.js') && !f.endsWith('node-transport.js'));
  const missing = modules.filter((f) => !sw.includes(`'${f}'`));
  assert.deepEqual(missing, []);
});

test('sw.js: i file elencati esistono', () => {
  const list = [...sw.matchAll(/'([\w./-]+\.(?:js|json|css|html|svg|png|wasm|md|webmanifest))'/g)].map((m) => m[1]);
  // I moduli sono elencati senza "src/" (vedi .map in sw.js); gli altri file dalla radice.
  for (const f of list) assert.ok(existsSync(root(f)) || existsSync(root(`src/${f}`)), `${f} non esiste`);
});
