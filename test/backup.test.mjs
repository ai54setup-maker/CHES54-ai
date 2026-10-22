// Backup dei dati: solo le chiavi dell'app, file estranei rifiutati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_KEYS, makeBackup, readBackup, backupFileName, MAX_BACKUP_BYTES } from '../src/ui/backup.js';

const fakeStore = (obj) => ({ get: (k, d) => (k in obj ? obj[k] : d) });

test('makeBackup: solo le chiavi dell\'app presenti', () => {
  const b = makeBackup(fakeStore({ theme: 'light', lessonsDone: '["fork"]', altro: 'x' }), '3.0.0', new Date('2026-10-22T10:00:00Z'));
  assert.equal(b.app, 'CHES54.ai');
  assert.deepEqual(b.data, { theme: 'light', lessonsDone: '["fork"]' });
  assert.equal(b.exportedAt, '2026-10-22T10:00:00.000Z');
  assert.equal(backupFileName(new Date('2026-10-22T10:00:00Z')), 'ches54-backup-2026-10-22.json');
});

test('readBackup: andata e ritorno; chiavi sconosciute e valori non di testo ignorati', () => {
  const text = JSON.stringify({ ...makeBackup(fakeStore({ pzStats: '{"streak":3}' }), '3.0.0'), extra: 1 });
  assert.deepEqual(readBackup(text).entries, [['pzStats', '{"streak":3}']]);
  const r = readBackup(JSON.stringify({ app: 'CHES54.ai', data: { theme: 'dark', __proto__x: 'a', evil: '<script>', side: 5 } }));
  assert.deepEqual(r.entries, [['theme', 'dark']]);
  assert.equal(r.ignored, 3);
  assert.ok(BACKUP_KEYS.includes('myMistakes'));
});

test('readBackup: file non validi', () => {
  assert.throws(() => readBackup('non json'), /JSON/);
  assert.throws(() => readBackup('{"app":"Altro","data":{}}'), /non è un backup di CHES54/);
  assert.throws(() => readBackup('{"app":"CHES54.ai","data":[]}'), /non è un backup/);
  assert.throws(() => readBackup('{"app":"CHES54.ai","data":{"x":"y"}}'), /non contiene dati/);
  assert.throws(() => readBackup(' '.repeat(MAX_BACKUP_BYTES + 1)), /troppo grande/);
});
