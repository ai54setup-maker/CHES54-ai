// Test della classe Engine con un motore finto: verifica il protocollo senza avviare Stockfish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, AnalysisCancelled, goCommand } from '../src/engine/engine.js';
import { ENGINE_CONFIG } from '../src/config/engine.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

function fakeEngine() {
  const sent = [];
  let emit;
  const transport = {
    send: (cmd) => sent.push(cmd),
    onLine: (cb) => { emit = cb; },
    onError: () => {},
    terminate: () => {},
  };
  const engine = new Engine(transport, ENGINE_CONFIG);
  const say = (...lines) => lines.forEach((l) => emit(l));
  say('uciok', 'readyok');
  return { engine, sent, say };
}

test('avvio: uci, Hash dalla configurazione, isready', () => {
  const { sent, engine } = fakeEngine();
  assert.deepEqual(sent, ['uci', `setoption name Hash value ${ENGINE_CONFIG.hashMb}`, 'isready']);
  assert.equal(engine.isReady, true);
});

test('go: profondità, tempo o entrambi', () => {
  assert.equal(goCommand({ depth: 16, movetimeMs: null }), 'go depth 16');
  assert.equal(goCommand({ depth: null, movetimeMs: 500 }), 'go movetime 500');
  assert.equal(goCommand({ depth: 18, movetimeMs: 2000 }), 'go depth 18 movetime 2000');
  assert.throws(() => goCommand({ depth: null, movetimeMs: null }));
});

test('MultiPV configurabile, punteggi convertiti al punto di vista del Bianco', async () => {
  const { engine, sent, say } = fakeEngine();
  const p = engine.analyze(AFTER_E4, { depth: 10, multiPv: 2 });
  assert.deepEqual(sent.slice(3), ['setoption name MultiPV value 2', `position fen ${AFTER_E4}`, 'go depth 10']);
  say(
    'info depth 10 multipv 1 score cp -25 lowerbound pv c7c5', // parziale: ignorata
    'info depth 10 multipv 1 score cp -30 pv e7e5 g1f3',
    'info depth 10 multipv 2 score mate -4 pv f7f6 d1h5',
    'bestmove e7e5 ponder g1f3',
  );
  const r = await p;
  assert.equal(r.sideToMove, 'b');
  assert.equal(r.depth, 10);
  assert.equal(r.bestMove, 'e7e5');
  assert.deepEqual(r.lines.map((l) => l.score), [{ cp: 30, mate: null }, { cp: null, mate: 4 }]);
  assert.equal(r.fromCache, false);
});

test('cache: la seconda richiesta non interroga il motore', async () => {
  const { engine, sent, say } = fakeEngine();
  const p = engine.analyze(START, { depth: 8, multiPv: 1 });
  say('info depth 8 multipv 1 score cp 20 pv e2e4', 'bestmove e2e4');
  await p;
  const before = sent.length;
  const again = await engine.analyze(START.replace(' 0 1', ' 0 5'), { depth: 8, multiPv: 1 });
  assert.equal(sent.length, before);
  assert.equal(again.fromCache, true);
  assert.deepEqual(again.lines[0].score, { cp: 20, mate: null });
});

test('coda: le richieste partono una alla volta, MultiPV reimpostato solo se cambia', async () => {
  const { engine, sent, say } = fakeEngine();
  const a = engine.analyze(START, { depth: 6, multiPv: 1 });
  const b = engine.analyze(AFTER_E4, { depth: 6, multiPv: 1 });
  assert.equal(sent.filter((c) => c.startsWith('go')).length, 1);
  say('info depth 6 multipv 1 score cp 15 pv d2d4', 'bestmove d2d4');
  await a;
  assert.equal(sent.filter((c) => c.startsWith('go')).length, 2);
  assert.equal(sent.filter((c) => c.startsWith('setoption name MultiPV')).length, 1);
  say('info depth 6 multipv 1 score cp -20 pv c7c5', 'bestmove c7c5');
  assert.equal((await b).lines[0].score.cp, 20);
});

test('cancelAll: rifiuta coda e ricerca in corso, che non finisce in cache', async () => {
  const { engine, sent, say } = fakeEngine();
  const a = engine.analyze(START, { depth: 20, multiPv: 1 });
  const b = engine.analyze(AFTER_E4, { depth: 20, multiPv: 1 });
  engine.cancelAll();
  assert.equal(sent.at(-1), 'stop');
  await assert.rejects(b, AnalysisCancelled);
  say('info depth 9 multipv 1 score cp 20 pv e2e4', 'bestmove e2e4');
  await assert.rejects(a, AnalysisCancelled);
  assert.equal(engine.cache.size, 0);
});

test('aggiornamenti parziali solo quando tutte le linee hanno la stessa profondità', async () => {
  const { engine, say } = fakeEngine();
  const depths = [];
  const p = engine.analyze(START, { depth: 2, multiPv: 2, onUpdate: (r) => depths.push(r.lines.map((l) => l.depth)) });
  say(
    'info depth 1 multipv 1 score cp 10 pv e2e4',
    'info depth 1 multipv 2 score cp 5 pv d2d4',
    'info depth 2 multipv 1 score cp 12 pv e2e4',
    'info depth 2 multipv 2 score cp 8 pv d2d4',
    'bestmove e2e4',
  );
  await p;
  assert.deepEqual(depths, [[1], [1, 1], [2, 2]]);
});

test('posizione senza mosse legali: nessuna linea', async () => {
  const { engine, say } = fakeEngine();
  const p = engine.analyze('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1', { depth: 5, multiPv: 1 });
  say('info depth 0 score mate 0', 'bestmove (none)');
  const r = await p;
  assert.deepEqual(r.lines, []);
  assert.equal(r.bestMove, null);
});

test('MultiPV fuori dai limiti della configurazione', async () => {
  const { engine } = fakeEngine();
  await assert.rejects(engine.analyze(START, { multiPv: ENGINE_CONFIG.maxMultiPv + 1 }), RangeError);
  await assert.rejects(engine.analyze(START, { multiPv: 0 }), RangeError);
});

test('newGame: "ucinewgame" in coda, dopo la ricerca in corso', async () => {
  const { engine, sent, say } = fakeEngine();
  const a = engine.analyze(START, { depth: 5, multiPv: 1 });
  const reset = engine.newGame();
  assert.ok(!sent.includes('ucinewgame'), 'non durante una ricerca');
  say('info depth 5 multipv 1 score cp 20 pv e2e4', 'bestmove e2e4');
  await a;
  assert.deepEqual(sent.slice(-2), ['ucinewgame', 'isready']);
  let resolved = false;
  reset.then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false, 'attende readyok');
  say('readyok');
  await reset;
  const b = engine.analyze(AFTER_E4, { depth: 5, multiPv: 1 });
  assert.equal(sent.at(-1), 'go depth 5');
  say('info depth 5 multipv 1 score cp -20 pv e7e5', 'bestmove e7e5');
  await b;
});
