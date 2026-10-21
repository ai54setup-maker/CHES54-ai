// Verifica con Stockfish gli esercizi delle lezioni (data/lessons/lessons.json).
//
//   npm run check:lessons                 verifica tutto e scrive data/lessons/VERIFIED.md e verified.json
//   npm run check:lessons -- --explore FEN valuta ogni mossa legale di una posizione (per scrivere gli esercizi)
//
// Regole: src/analysis/lesson.js (controlli statici) e src/analysis/puzzle.js (soluzioni); parametri in
// ANALYSIS_CONFIG.puzzles e ANALYSIS_CONFIG.lessons. Il test test/lessons.test.mjs controlla che verified.json
// corrisponda al contenuto attuale di lessons.json: dopo ogni modifica alle lezioni va rilanciato questo script.

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Chess } from '../lib/chess.js';
import { Engine } from '../src/engine/engine.js';
import { nodeTransport } from '../src/engine/node-transport.js';
import { toPov, formatScore } from '../src/engine/score.js';
import { ANALYSIS_CONFIG } from '../src/config/analysis.js';
import { winPercent } from '../src/analysis/winpct.js';
import { playUci, verifySolverMove, verifyReply } from '../src/analysis/puzzle.js';
import { staticErrors } from '../src/analysis/lesson.js';
import { recognizeTactic } from '../src/analysis/tactics.js';

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const P = ANALYSIS_CONFIG.puzzles;
const L = ANALYSIS_CONFIG.lessons;
const engine = new Engine(nodeTransport(root('engine/stockfish.js')));
await engine.ready;

/** Win% di chi muove in `fen` dopo ciascuna mossa legale, ordinate dalla migliore. */
async function rankMoves(fen) {
  const c = new Chess(fen);
  const me = c.turn();
  const out = [];
  for (const m of c.moves({ verbose: true })) {
    const after = new Chess(fen);
    after.move(m.san);
    const uci = m.from + m.to + (m.promotion ?? '');
    let score;
    if (after.isGameOver()) {
      // Matto dato da chi muove (punteggio dal punto di vista del Bianco) oppure patta
      score = after.isCheckmate() ? { cp: null, mate: me === 'w' ? 1 : -1 } : { cp: 0, mate: null };
    } else {
      engine.newGame();
      const r = await engine.analyze(after.fen(), { depth: L.moveDepth, multiPv: 1, movetimeMs: null });
      score = r.lines[0]?.score ?? { cp: 0, mate: null };
    }
    out.push({ uci, san: m.san, score, win: winPercent(toPov(score, me)) });
  }
  return out.sort((a, b) => b.win - a.win);
}

if (process.argv.includes('--explore')) {
  const fen = process.argv[process.argv.indexOf('--explore') + 1];
  for (const m of await rankMoves(fen)) {
    console.log(`${m.san.padEnd(8)} ${m.uci.padEnd(6)} ${formatScore(m.score).padStart(7)}  win% ${m.win.toFixed(1)}`);
  }
  engine.terminate();
  process.exit(0);
}

const text = readFileSync(root('data/lessons/lessons.json'), 'utf8');
const data = JSON.parse(text);
const report = [];
let failures = 0;

async function checkSolution(step) {
  const c = new Chess(step.fen);
  engine.newGame();
  for (let i = 0; i < step.solution.length; i++) {
    const fen = c.fen();
    const solver = i % 2 === 0;
    const isFinal = i === step.solution.length - 1;
    const r = await engine.analyze(fen, solver
      ? { depth: P.depth, multiPv: P.multiPv, movetimeMs: null }
      : { depth: P.replyDepth, multiPv: P.replyMultiPv, movetimeMs: null });
    const v = solver ? verifySolverMove(r, fen, step.solution[i], isFinal) : verifyReply(r, fen, step.solution[i]);
    if (!v.ok) return `${solver ? 'mossa' : 'risposta'} ${step.solution[i]}: ${v.reason}`;
    if (i === 0 && step.tactic) {
      const t = recognizeTactic(fen, r.lines[0].pv);
      if (t?.kind !== step.tactic) return `tattica attesa ${step.tactic}, riconosciuta ${t?.kind ?? 'nessuna'} (linea ${r.lines[0].pv.slice(0, 6).join(' ')})`;
    }
    if (i === 0) step._eval = formatScore(r.lines[0].score);
    playUci(c, step.solution[i]);
  }
  return null;
}

async function checkAccept(step) {
  const ranked = await rankMoves(step.fen);
  const best = ranked[0].win;
  const bad = [];
  for (const m of ranked) {
    const loss = best - m.win;
    const accepted = step.accept.includes(m.uci);
    if (accepted && loss > L.acceptTolerance) bad.push(`${m.san} accettata ma perde ${loss.toFixed(1)}`);
    if (!accepted && loss < L.rejectGap) bad.push(`${m.san} non accettata ma perde solo ${loss.toFixed(1)}`);
  }
  step._eval = formatScore(ranked[0].score);
  return bad.length ? bad.join('; ') : null;
}

for (const lesson of data.lessons) {
  for (const [i, step] of lesson.steps.entries()) {
    const where = `${lesson.id} passo ${i + 1}`;
    const errs = staticErrors(step);
    let engineErr = null;
    if (!errs.length && step.kind === 'exercise') engineErr = step.solution ? await checkSolution(step) : await checkAccept(step);
    const ok = !errs.length && !engineErr;
    if (!ok) failures++;
    report.push({ where, kind: step.kind, ok, error: [...errs, engineErr].filter(Boolean).join('; '), eval: step._eval });
    console.log(`${ok ? '✔' : '✖'} ${where} (${step.kind})${ok ? '' : ': ' + report.at(-1).error}`);
  }
}
engine.terminate();

const sha = createHash('sha256').update(text).digest('hex');
const date = new Date().toISOString().slice(0, 10);
if (!failures) writeFileSync(root('data/lessons/verified.json'), JSON.stringify({ sha256: sha, date }, null, 2) + '\n');
writeFileSync(root('data/lessons/VERIFIED.md'), `# Lezioni: verifica

Generato da \`npm run check:lessons\` il ${date}. SHA-256 di \`lessons.json\`: \`${sha}\`.
Esito: ${failures ? `**${failures} passi non verificati**` : 'tutti i passi verificati'}.

- Spiegazioni: posizioni e mosse legali; scacco, matto, stallo, attacchi e inchiodature dichiarati nel passo
  controllati con chess.js.
- Esercizi con una soluzione: ogni mossa come nei problemi (prima scelta di Stockfish a profondità ${P.depth}, unica buona;
  risposte a profondità ${P.replyDepth}); il nome della tattica, se indicato, è quello riconosciuto dall'Allenatore
  (\`recognizeTactic\`) sulla linea del motore.
- Esercizi con più risposte: valutate tutte le mosse legali a profondità ${L.moveDepth}; le accettate perdono al massimo
  ${L.acceptTolerance} punti di win% rispetto alla migliore, tutte le altre almeno ${L.rejectGap}.

| Passo | Tipo | Esito | Valutazione iniziale (Bianco) |
|---|---|---|---|
${report.map((r) => `| ${r.where} | ${r.kind === 'exercise' ? 'esercizio' : 'spiegazione'} | ${r.ok ? '✔' : '✖ ' + r.error} | ${r.eval ?? ''} |`).join('\n')}
`);
console.log(failures ? `\n${failures} passi NON verificati` : '\nTutte le lezioni verificate.');
process.exit(failures ? 1 : 0);
