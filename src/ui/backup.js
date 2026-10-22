// Backup dei dati salvati nel browser (progressi, preferenze, partite): un file JSON da esportare e importare,
// per spostare i dati su un altro dispositivo senza account. makeBackup / readBackup non usano il DOM (testabili in Node).

/** Chiavi di localStorage dell'app (senza prefisso). Solo queste si esportano e si importano. */
export const BACKUP_KEYS = Object.freeze([
  'coach', 'coachLevel', 'depth', 'evals', 'free', 'lessonsDone', 'mode', 'multipv', 'myMistakes', 'onlineSource',
  'lang', 'onlineUser', 'pgn', 'playGame', 'pzLevel', 'pzStats', 'pzTheme', 'review', 'reviewDepth', 'section', 'setupDone', 'side', 'theme',
]);
const APP = 'CHES54.ai';
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/**
 * @param {{ get: (k: string, d: any) => any }} store
 * @param {string} version versione dell'app
 */
export function makeBackup(store, version, now = new Date()) {
  const data = {};
  for (const k of BACKUP_KEYS) {
    const v = store.get(k, null);
    if (v != null) data[k] = v;
  }
  return { app: APP, version, exportedAt: now.toISOString(), data };
}

/**
 * Legge e controlla un file di backup. Ignora le chiavi sconosciute; accetta solo testi.
 * @returns {{ entries: [string, string][], ignored: number, exportedAt: string }}
 * @throws {Error} con un messaggio per l'utente
 */
export function readBackup(text) {
  if (text.length > MAX_BACKUP_BYTES) throw new Error('Il file è troppo grande per essere un backup di CHES54.ai.');
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('Il file non è un backup valido (JSON non leggibile).');
  }
  if (!obj || obj.app !== APP || typeof obj.data !== 'object' || obj.data === null || Array.isArray(obj.data)) {
    throw new Error('Il file non è un backup di CHES54.ai.');
  }
  const entries = [];
  let ignored = 0;
  for (const [k, v] of Object.entries(obj.data)) {
    if (BACKUP_KEYS.includes(k) && typeof v === 'string') entries.push([k, v]);
    else ignored++;
  }
  if (!entries.length) throw new Error('Il backup non contiene dati di CHES54.ai.');
  return { entries, ignored, exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '' };
}

/** Nome del file: ches54-backup-AAAA-MM-GG.json */
export const backupFileName = (now = new Date()) => `ches54-backup-${now.toISOString().slice(0, 10)}.json`;
