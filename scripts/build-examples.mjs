// Costruisce la libreria di partite di esempio a partire da fonti pubbliche verificabili.
//
//   npm run build:examples
//
// Per ogni voce di data/examples/catalog.json (scritto a mano, senza mosse):
//  1. scarica l'archivio del giocatore da PGN Mentor (fonte principale) e trova la partita;
//  2. scarica la stessa partita da chessgames.com (controllo incrociato) e confronta mosse e risultato;
//  3. controlla legalità (parser + chess.js), risultato, mosse citate nella descrizione;
//  4. calcola l'apertura con il nostro OpeningBook.
// Le partite che superano tutti i controlli vanno in data/examples/games/<id>.pgn e in index.json;
// le altre vengono escluse e riportate in SOURCES.md con il motivo.
// I file scaricati restano in data/examples/source/ (esclusa da git): un secondo avvio non riscarica nulla.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gameFromPgn } from '../src/analysis/game-model.js';
import { OpeningBook } from '../src/analysis/openings.js';
import { UI_CONFIG } from '../src/config/ui.js';
import { checkGame, compareGames, categoriesOf, fullMoves } from './lib/examples.mjs';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const DIR = root('data/examples/');
const SRC = DIR + 'source/';
const PGNMENTOR = 'https://www.pgnmentor.com/players/';
const CHESSGAMES = 'https://www.chessgames.com';
// chessgames.com risponde solo a client che si presentano come browser.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };
const POLITE_DELAY_MS = 1500; // pausa tra due richieste a chessgames.com
const MATCH_PREFIX_PLIES = 20; // per riconoscere la partita giusta tra quelle di un torneo

const catalog = JSON.parse(readFileSync(DIR + 'catalog.json', 'utf8'));
const book = new OpeningBook(JSON.parse(readFileSync(root('data/openings/openings.json'), 'utf8')));
mkdirSync(SRC + 'chessgames', { recursive: true });

// Registro dei download (data e impronta SHA-256), per SOURCES.md.
const logPath = SRC + 'downloads.json';
const downloads = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : {};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const today = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Scarica `url` in `path` se non c'è già; restituisce il contenuto. */
async function download(url, path, { polite = false } = {}) {
  if (!existsSync(path)) {
    if (polite) await sleep(POLITE_DELAY_MS);
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error(`${url}: risposta vuota`);
    writeFileSync(path, buf);
    downloads[url] = { date: today(), sha256: sha256(buf) };
  }
  return readFileSync(path);
}

const tag = (pgn, name) => (pgn.match(new RegExp(`^\\[${name} "([^"]*)"\\]`, 'm')) || [])[1] ?? '';

/** @type {Map<string, string[]>} archivio → testi PGN delle singole partite */
const archives = new Map();
async function archiveGames(name) {
  if (!archives.has(name)) {
    const zip = SRC + `${name}.zip`;
    await download(`${PGNMENTOR}${name}.zip`, zip);
    const text = execFileSync('unzip', ['-p', zip], { maxBuffer: 1 << 28 }).toString('latin1').replace(/\r\n?/g, '\n');
    archives.set(name, text.split(/\n(?=\[Event )/).map((g) => g.trim()).filter(Boolean));
  }
  return archives.get(name);
}

/** Trova nell'archivio PGN Mentor l'unica partita che corrisponde al selettore del catalogo. */
async function fromPgnMentor(sel) {
  const has = (value, part) => value.toLowerCase().includes(part.toLowerCase());
  const found = new Map(); // mosse → testo (la stessa partita può comparire due volte)
  for (const text of await archiveGames(sel.archive)) {
    if (!has(tag(text, 'White'), sel.white) || !has(tag(text, 'Black'), sel.black)) continue;
    if (!tag(text, 'Date').startsWith(sel.date)) continue;
    if (sel.event && !has(tag(text, 'Event'), sel.event)) continue;
    if (sel.round && tag(text, 'Round') !== sel.round) continue;
    if (sel.eco && tag(text, 'ECO') !== sel.eco) continue;
    const game = gameFromPgn(text);
    if (sel.plies && game.plies.length !== sel.plies) continue;
    found.set(game.plies.map((p) => p.uci).join(' '), { text, game });
  }
  if (found.size !== 1) throw new Error(`PGN Mentor (${sel.archive}): ${found.size} partite corrispondono al selettore`);
  return [...found.values()][0];
}

const pgnUrl = (gid) => `${CHESSGAMES}/nodejs/game/viewGamePGN?text=1&gid=${gid}`;
const gameUrl = (gid) => `${CHESSGAMES}/perl/chessgame?gid=${gid}`;

async function chessgamesGame(gid) {
  const text = (await download(pgnUrl(gid), SRC + `chessgames/${gid}.pgn`, { polite: true })).toString('utf8');
  return { gid, text, game: gameFromPgn(text) };
}

/** Partita di chessgames.com: per ID, oppure cercata tra le partite di un torneo. */
async function fromChessgames(ref, primary) {
  if (ref.gid) return chessgamesGame(ref.gid);
  const list = `${CHESSGAMES}/perl/chess.pl?tid=${ref.tid}${ref.pid ? `&pid=${ref.pid}` : ''}`;
  const html = (await download(list, SRC + `chessgames/tid-${ref.tid}-${ref.pid ?? 0}.html`, { polite: true })).toString('latin1');
  const gids = [...new Set([...html.matchAll(/chessgame\?gid=(\d+)/g)].map((m) => Number(m[1])))];
  const prefix = (g) => g.plies.slice(0, MATCH_PREFIX_PLIES).map((p) => p.uci).join(' ');
  for (const gid of gids) {
    let cg;
    try { cg = await chessgamesGame(gid); } catch { continue; }
    if (prefix(cg.game) === prefix(primary)) return cg;
  }
  throw new Error(`chessgames.com: nessuna partita del torneo ${ref.tid} corrisponde (${gids.length} esaminate)`);
}

const included = [];
const excluded = [...(catalog.excluded ?? [])];
const sources = [];

for (const entry of catalog.games) {
  const label = `${entry.white} – ${entry.black}, ${entry.year}`;
  try {
    const main = await fromPgnMentor(entry.pgnmentor);
    const second = await fromChessgames(entry.chessgames, main.game);
    const { diff, note } = compareGames(main.game, second.game);
    if (diff) throw new Error(`PGN Mentor e chessgames.com non coincidono: ${diff}`);
    const problems = checkGame(main.game, entry);
    if (problems.length) throw new Error(problems.join('; '));

    const { opening } = book.identify(main.game.plies.map((p) => p.fenAfter));
    const file = `games/${entry.id}.pgn`;
    writeFileSync(DIR + file, main.text + '\n');
    included.push({
      id: entry.id,
      white: entry.white,
      black: entry.black,
      year: entry.year,
      event: entry.event,
      result: main.game.result,
      moves: fullMoves(main.game),
      plies: main.game.plies.length,
      categories: categoriesOf(main.game, entry.categories, UI_CONFIG.examples.miniatureMaxMoves),
      opening: opening ? { eco: opening.eco, name: opening.name } : null,
      famous: entry.famous,
      pgn: file,
    });
    const zipUrl = `${PGNMENTOR}${entry.pgnmentor.archive}.zip`;
    sources.push({ entry, zipUrl, gid: second.gid, game: main.game, note });
    console.log(`✔ ${label}: ${main.game.plies.length} semimosse, ${main.game.result}, 2 fonti concordi${note ? ` (${note})` : ''}`);
  } catch (err) {
    excluded.push({ id: entry.id, title: label, reason: err.message });
    console.log(`✘ ${label}: ${err.message}`);
  }
}

// I PGN di partite non più incluse vanno tolti.
const keep = new Set(included.map((g) => g.pgn.slice('games/'.length)));
for (const f of readdirSync(DIR + 'games')) if (!keep.has(f)) rmSync(DIR + 'games/' + f);

writeFileSync(DIR + 'index.json', JSON.stringify({ games: included }, null, 1) + '\n');
writeFileSync(logPath, JSON.stringify(downloads, null, 1) + '\n');

// SOURCES.md
const cell = (s) => String(s).replace(/\|/g, '\\|');
let md = `# Fonti della libreria di partite

File generato da \`scripts/build-examples.mjs\` (non modificarlo a mano: modifica \`catalog.json\` e rilancia
\`npm run build:examples\`).

Ogni partita è presa da **PGN Mentor** (fonte principale, archivi per giocatore) ed è confrontata mossa per mossa con
**chessgames.com** (seconda fonte). Viene inclusa solo se:
- tutte le mosse sono legali (parser PGN del progetto + chess.js);
- le due fonti hanno **le stesse mosse e lo stesso risultato** (unica eccezione accettata: una fonte si ferma prima
  e riporta le mosse mancanti, identiche, nel commento finale, come nei matti annunciati dell'Ottocento);
- il risultato è compatibile con la posizione finale (es. chi dà matto vince) e con l'intestazione \`Result\`;
- le mosse citate nella descrizione ("perché è famosa") compaiono davvero nella partita.

Limite: due fonti concordi riducono il rischio di errori di trascrizione, ma non lo azzerano (le banche dati
possono derivare da una stessa trascrizione storica).

## Partite incluse (${included.length})

| Partita | Semimosse | Risultato | Fonte principale (scaricata il, SHA-256 dell'archivio) | Seconda fonte (scaricata il) |
|---|---|---|---|---|
`;
for (const { entry, zipUrl, gid, game, note } of sources) {
  const z = downloads[zipUrl];
  const c = downloads[pgnUrl(gid)];
  md += `| \`${entry.id}\` ${cell(entry.white)} – ${cell(entry.black)}, ${entry.year} | ${game.plies.length} | ${game.result} `
    + `| [${entry.pgnmentor.archive}.zip](${zipUrl}) (${z?.date ?? '?'}, \`${z?.sha256.slice(0, 16) ?? '?'}…\`) `
    + `| [chessgames gid ${gid}](${gameUrl(gid)}) (${c?.date ?? '?'})${note ? `. Nota: ${cell(note)}` : ''} |\n`;
}
md += `\n## Partite escluse (${excluded.length})\n\n`;
md += excluded.length ? excluded.map((e) => `- **${e.title}**: ${e.reason}`).join('\n') + '\n' : 'Nessuna.\n';
writeFileSync(DIR + 'SOURCES.md', md);

console.log(`\n${included.length} partite incluse, ${excluded.length} escluse. Scritti index.json, games/, SOURCES.md.`);
