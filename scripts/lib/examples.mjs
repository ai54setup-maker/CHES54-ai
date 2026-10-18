// Controlli sulle partite della libreria (data/examples/), usati sia da scripts/build-examples.mjs
// sia da test/examples.test.mjs, così le regole sono scritte in un solo posto.

const DECISIVE = { '1-0': 'w', '0-1': 'b' };

/**
 * Controlla che la partita sia coerente: risultato valido e compatibile con la posizione finale,
 * mosse citate nella descrizione presenti davvero.
 * @param {import('../../src/analysis/game-model.js').Game} game
 * @param {{ mentions?: string[] }} entry voce del catalogo
 * @returns {string[]} elenco dei problemi (vuoto = tutto a posto)
 */
export function checkGame(game, entry = {}) {
  const problems = [];
  const { result, ending, plies } = game;
  if (!['1-0', '0-1', '1/2-1/2'].includes(result)) problems.push(`risultato non valido: ${result}`);
  if (!plies.length) problems.push('nessuna mossa');
  const last = plies.at(-1);
  if (ending === 'checkmate' && last && DECISIVE[result] !== last.color) {
    problems.push(`la partita finisce con il matto dato da ${last.color === 'w' ? 'Bianco' : 'Nero'}, ma il risultato è ${result}`);
  }
  if (['stalemate', 'insufficient'].includes(ending) && result !== '1/2-1/2') {
    problems.push(`posizione finale patta per regola (${ending}), ma il risultato è ${result}`);
  }
  if (game.headers.Result && game.headers.Result !== result) {
    problems.push(`intestazione Result ${game.headers.Result} diversa dal risultato nelle mosse ${result}`);
  }
  for (const mention of entry.mentions ?? []) {
    const m = mention.match(/^(\d+)(\.\.\.|\.)(\S+)$/);
    if (!m) { problems.push(`mossa citata in un formato non valido: ${mention} (atteso es. 30.Ba3 o 17...Be6)`); continue; }
    const [, num, dots, san] = m;
    const color = dots === '.' ? 'w' : 'b';
    if (!plies.some((p) => p.moveNumber === Number(num) && p.color === color && p.san === san)) {
      problems.push(`la descrizione cita ${mention}, che non c'è nella partita`);
    }
  }
  return problems;
}

/** Numero di mosse "da tabellone" (1. e4 e5 = 1 mossa). */
export const fullMoves = (game) => Math.ceil(game.plies.length / 2);

/**
 * Categorie finali: quelle del catalogo più "miniature" se la partita è vinta entro maxMoves.
 * @param {import('../../src/analysis/game-model.js').Game} game
 * @param {string[]} categories
 * @param {number} maxMoves
 */
export function categoriesOf(game, categories, maxMoves) {
  const out = [...categories];
  if (game.result in DECISIVE && fullMoves(game) <= maxMoves && !out.includes('miniature')) out.push('miniature');
  return out;
}

const SAN_TOKEN = /^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?$/;
/** Mosse (SAN) scritte dentro un commento, nell'ordine in cui compaiono. */
const sanInComment = (text) => text.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).map((t) => t.replace(/[!?,;.]+$/, '')).filter((t) => SAN_TOKEN.test(t));

/**
 * Confronta due versioni della stessa partita (mosse e risultato).
 * Unico caso accettato senza coincidenza perfetta: una fonte si ferma prima e riporta le mosse
 * mancanti, identiche, nel commento dell'ultima mossa (tipico dei matti annunciati nell'Ottocento).
 * @returns {{ diff: string|null, note: string|null }} diff = prima differenza (null se coincidono)
 */
export function compareGames(a, b) {
  const n = Math.max(a.plies.length, b.plies.length);
  for (let i = 0; i < n; i++) {
    if (a.plies[i]?.uci === b.plies[i]?.uci) continue;
    const [long, short] = a.plies.length > b.plies.length ? [a, b] : [b, a];
    if (i === short.plies.length && long.result === short.result) {
      const missing = long.plies.slice(i).map((p) => p.san);
      const said = sanInComment(short.plies.at(-1)?.comment ?? '').join(' ');
      if (said.includes(missing.join(' '))) {
        return { diff: null, note: `una fonte si ferma alla semimossa ${i} e riporta le ultime ${missing.length} nel commento (${missing.join(' ')})` };
      }
    }
    const where = `${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'}`;
    return {
      diff: `prima differenza alla mossa ${where} (${a.plies[i]?.san ?? 'fine'} / ${b.plies[i]?.san ?? 'fine'}); `
        + `semimosse ${a.plies.length} / ${b.plies.length}`,
      note: null,
    };
  }
  if (a.result !== b.result) return { diff: `risultato diverso: ${a.result} / ${b.result}`, note: null };
  return { diff: null, note: null };
}
