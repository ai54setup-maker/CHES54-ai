// Pagina "Sostieni CHES54": sponsors.json valido (campi, file delle immagini, link https), immagini leggere,
// nessuna parola da ente registrato nei testi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { validateSponsors, visibleSponsors } from '../src/ui/support.js';

const dir = new URL('../data/sponsors/', import.meta.url);
const data = JSON.parse(readFileSync(new URL('sponsors.json', dir), 'utf8'));
const exists = (f) => existsSync(new URL(f, dir));
const LOGO_MAX = 200 * 1024;
const PHOTO_MAX = 400 * 1024;

test('sponsors.json: campi obbligatori, file esistenti, link https', () => {
  assert.deepEqual(validateSponsors(data, exists), []);
  for (const s of data.sponsors) {
    if (s.logo) assert.ok(statSync(new URL(s.logo, dir)).size <= LOGO_MAX, `${s.id}: logo oltre 200 KB`);
    if (s.photo) assert.ok(statSync(new URL(s.photo, dir)).size <= PHOTO_MAX, `${s.id}: foto oltre 400 KB`);
  }
});

test('validazione: errori chiari per i dati sbagliati', () => {
  const ok = { id: 'bar-roma', name: 'Bar Roma', city: 'Brescia', description: { it: 'Caffè.', en: 'Coffee.' }, url: 'https://example.com', logo: 'bar.webp' };
  assert.deepEqual(validateSponsors({ sponsors: [ok] }), []);
  assert.deepEqual(validateSponsors({ sponsors: [{ ...ok, logo: null }] }), []); // senza logo: scheda con il solo nome
  assert.match(validateSponsors({ sponsors: [{ ...ok, url: 'http://example.com' }] })[0], /https/);
  assert.match(validateSponsors({ sponsors: [{ ...ok, url: 'javascript:alert(1)' }] })[0], /https/);
  assert.match(validateSponsors({ sponsors: [{ ...ok, description: { it: 'Caffè.' } }] })[0], /descrizione \(en\)/);
  assert.match(validateSponsors({ sponsors: [ok] }, () => false)[0], /non esiste/);
  assert.match(validateSponsors({ sponsors: [{ ...ok, logo: '../index.html' }] })[0], /logo non valido/);
  assert.match(validateSponsors({ sponsors: [ok, ok] })[0], /id ripetuto/);
  assert.match(validateSponsors({})[0], /sponsors/);
  // Nascosto: bastano id e nome; non viene mostrato
  const hidden = { id: 'presto', name: 'In arrivo', hidden: true };
  assert.deepEqual(validateSponsors({ sponsors: [hidden] }), []);
  assert.deepEqual(visibleSponsors({ sponsors: [hidden, ok, { ...ok, id: 'rotto', url: '' }] }).map((s) => s.id), ['bar-roma']);
});

test('testi: progetto gratuito e indipendente, nessuna parola da ente registrato', () => {
  const texts = ['index.html', 'src/i18n/en.js', 'src/ui/support.js'].map((p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(texts, /non[ -]?profit|onlus|associazione|beneficenza|charity/i);
  assert.match(texts, /progetto gratuito e indipendente/);
});
