// CHES54.ai – interfaccia: revisione della partita e analisi della partita mossa per mossa.
// Qui ci sono solo lo stato dell'interfaccia e il collegamento tra i moduli: motore (src/engine),
// logica di analisi (src/analysis) e componenti grafici (src/ui). Nessuna formula scacchistica.

import { Chess } from '../../lib/chess.js';
import { Engine, AnalysisCancelled } from '../engine/engine.js';
import { formatScore } from '../engine/score.js';
import { ENGINE_CONFIG } from '../config/engine.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { UI_CONFIG } from '../config/ui.js';
import { splitPgnGames, parsePgn, PgnError } from '../analysis/pgn.js';
import { gameFromPgn, createGame, withMoveAt, truncateGame, gameToPgn, uciToMove } from '../analysis/game-model.js';
import { analyzeGame, analyzeLine, positionEval } from '../analysis/game-analyzer.js';
import { advantageOf, turningPoint } from '../analysis/advantage.js';
import { coachHints, nullMoveFen } from '../analysis/tactics.js';
import { formatHint } from './coach.js';
import { loadOpeningBook } from '../analysis/openings.js';
import { retryCandidates, evaluateAttempt, RETRY_CLASSIFICATIONS } from '../analysis/retry.js';
import { Board } from './board.js';
import { toItalian, numberedLine, parseUserMove } from './notation.js';
import { renderEvalBar } from './evalbar.js';
import { EvalGraph } from './eval-graph.js';
import { renderEngineLines, renderEngineMessage } from './engine-lines.js';
import { renderMoveList } from './move-list.js';
import { renderSummary } from './summary.js';
import { CLASS_INFO, classIcon } from './classification.js';
import { formatExplanation } from './explanations.js';
import { explainMove } from '../analysis/explain.js';
import { Library } from './library.js';
import { PuzzleTrainer } from './puzzles.js';
import { LessonPlayer } from './lessons.js';
import { OnlineGames } from './online-games.js';
import { mistakesFromReview, mergeMistakes } from '../analysis/my-mistakes.js';
import { loadMistakes, saveMistakes } from './puzzles.js';

const $ = (id) => document.getElementById(id);
const COLOR_NAME = { w: 'Bianco', b: 'Nero' };
const GRAPH_MARKS = ['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder'];
const fmt1 = (v) => v.toFixed(1).replace('.', ',');
const UNSTABLE_NOTE = 'Era la prima scelta del motore nella posizione precedente, ma analizzando la posizione dopo la mossa '
  + 'il motore la valuta peggio: a questa profondità la valutazione è instabile. Una profondità maggiore può chiarire.';

// ---------- preferenze (facoltative: l'app funziona anche senza localStorage) ----------
const store = {
  get(k, d) { try { return localStorage.getItem(UI_CONFIG.storagePrefix + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(UI_CONFIG.storagePrefix + k, v); } catch { /* spazio esaurito o bloccato */ } },
};
const pickNum = (key, allowed, fallback) => {
  const v = Number(store.get(key, fallback));
  return allowed.includes(v) ? v : fallback;
};

// ---------- stato ----------
const state = {
  mode: store.get('mode', 'review') === 'analysis' ? 'analysis' : 'review',
  review: { status: 'empty', game: null, analysis: null, progress: [0, 0] }, // status: empty | running | done
  free: createGame(),
  cursors: { review: 0, analysis: 0 }, // posizione mostrata (0 = iniziale) per ciascuna modalità
  orientation: 'w',
  retry: null, // { index, phase: 'waiting'|'thinking'|'done', attempt, showSolution, prevOrientation }
  depth: pickNum('depth', ENGINE_CONFIG.depthPresets.map((p) => p.depth), ENGINE_CONFIG.defaultDepth),
  multiPv: pickNum('multipv', ENGINE_CONFIG.multiPvOptions, ENGINE_CONFIG.multiPv),
  reviewDepth: pickNum('reviewDepth', UI_CONFIG.reviewDepthPresets.map((p) => p.depth), ANALYSIS_CONFIG.gameAnalysis.depth),
  // Analisi partita
  side: store.get('side', 'w') === 'b' ? 'b' : 'w', // colore con cui l'utente ha giocato
  setupDone: store.get('setupDone', '') === '1', //  impostazione iniziale fatta (colore, nomi, posizione)
  variation: null, // { base, game }: variante provata dalla posizione `base` della linea principale (state.free)
  redo: [], // mosse annullate (UCI), per "Ripeti"
  coach: { on: store.get('coach', '1') === '1', level: store.get('coachLevel', 'solution') === 'hint' ? 'hint' : 'solution' },
  coachPick: null, // suggerimento scelto (indice) nella posizione mostrata: freccia e variante
  // Sezione mostrata: le due con la scacchiera di analisi (= mode) oppure Lezioni / Problemi.
  section: null,
};
const BOARD_SECTIONS = ['review', 'analysis'];
const SECTIONS = [...BOARD_SECTIONS, 'lessons', 'puzzles'];
state.section = SECTIONS.includes(store.get('section', '')) ? store.get('section', '') : state.mode;
// Link diretto a una sezione (anche dalle scorciatoie dell'icona dell'app): ?section=lezioni / problemi / analisi / revisione
const SECTION_ALIASES = { revisione: 'review', analisi: 'analysis', lezioni: 'lessons', problemi: 'puzzles' };
const linked = new URLSearchParams(location.search).get('section');
const linkedSection = SECTION_ALIASES[linked] ?? linked;
if (SECTIONS.includes(linkedSection)) {
  state.section = linkedSection;
  if (BOARD_SECTIONS.includes(linkedSection)) state.mode = linkedSection;
}
const onBoard = () => BOARD_SECTIONS.includes(state.section);
// Analisi "dal vivo" della posizione mostrata; gen cambia a ogni nuova richiesta (le risposte vecchie si ignorano)
const live = { fen: null, pending: true, result: null, highlighted: null, gen: 0 };
let engine = null;
let engineFailed = false;
const bookPromise = loadOpeningBook().catch(() => null);

// Analisi partita: valutazioni finite del motore, per profondità e posizione.
const gameEvals = new Map();
const evalKey = (fen, depth = state.depth) => `${depth}|${fen}`;
const evalOf = (fen) => gameEvals.get(evalKey(fen));
let openingBook = null;
const lineMemo = new Map(); // analisi delle linee già calcolate (si svuota quando arriva una valutazione)
const moveMemo = new Map(); // analisi delle singole mosse: non si ricalcolano quelle che non cambiano
const MOVE_MEMO_MAX = 5000;
const coachCache = new Map(); // suggerimenti dell'Allenatore per profondità e posizione
bookPromise.then((b) => {
  openingBook = b;
  lineMemo.clear();
  if (state.mode === 'analysis') render();
});

const cur = () => state.cursors[state.mode];
const setCur = (i) => { state.cursors[state.mode] = i; };
const reviewDone = () => state.mode === 'review' && state.review.status === 'done';
const EMPTY_GAME = createGame();
const currentGame = () => (state.mode === 'review' ? state.review.game ?? EMPTY_GAME : state.variation?.game ?? state.free);
const fenAt = (game, i) => (i === 0 ? game.startFen : game.plies[i - 1].fenAfter);
const moveLabel = (ply) => `${ply.moveNumber}${ply.color === 'w' ? '.' : '…'} ${toItalian(ply.san)}`;

/** Posizione mostrata sulla scacchiera (in "ritenta" è quella del tentativo). */
function displayed() {
  const r = state.retry;
  if (r) {
    const m = state.review.analysis.moves[r.index];
    if (r.attempt) return { fen: r.attempt.ply.fenAfter, lastMove: r.attempt.ply };
    return { fen: m.ply.fenBefore, lastMove: state.review.game.plies[r.index - 1] ?? null };
  }
  const g = currentGame();
  return { fen: fenAt(g, cur()), lastMove: g.plies[cur() - 1] ?? null };
}

/** La posizione mostrata è finale? (matto o patta secondo le regole) */
function positionState(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) {
    const winner = c.turn() === 'w' ? 'b' : 'w';
    return { over: true, mateWinner: winner, text: `Scacco matto: vince il ${COLOR_NAME[winner]}.` };
  }
  if (c.isStalemate()) return { over: true, draw: true, text: 'Stallo: la partita è patta.' };
  if (c.isInsufficientMaterial()) return { over: true, draw: true, text: 'Patta per materiale insufficiente.' };
  if (c.isDrawByFiftyMoves()) return { over: true, draw: true, text: 'Patta per la regola delle 50 mosse.' };
  const g = currentGame();
  if (!state.retry && cur() === g.plies.length && g.ending === 'threefold') {
    return { over: true, draw: true, text: 'Patta per triplice ripetizione.' };
  }
  return { over: false };
}

// ---------- scacchiera ----------
const board = new Board($('board'), {
  canPick: (sq) => {
    if (state.retry) {
      if (state.retry.phase !== 'waiting') return false;
    } else if (state.mode === 'review' && !reviewDone()) {
      return false;
    }
    const c = new Chess(displayed().fen);
    if (c.isGameOver()) return false;
    const p = c.get(sq);
    return !!p && p.color === c.turn();
  },
  dests: (sq) => new Chess(displayed().fen).moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })),
  onMove: async (from, to) => {
    const c = new Chess(displayed().fen);
    const needsPromo = c.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
    const promotion = needsPromo ? await askPromotion(c.turn()) : undefined;
    if (needsPromo && !promotion) return render();
    playMove({ from, to, promotion });
  },
});

const graph = new EvalGraph($('eval-graph'), { onSelect: (i) => goTo(i) });
let graphShown = null; // dati attualmente disegnati nel grafico (per non ridisegnarlo a ogni render)

// ---------- mosse giocate dall'utente ----------
function playMove(move) {
  if (state.retry) return submitRetry(move);
  if (state.mode === 'review') {
    if (!reviewDone()) return false;
    // Una mossa diversa durante la revisione apre una variante in analisi libera.
    const g = withMoveAt(state.review.game, cur(), move);
    if (!g) return false;
    state.free = g;
    state.cursors.analysis = g.plies.length;
    Object.assign(state, { variation: null, redo: [], setupDone: true });
    store.set('setupDone', '1');
    saveFree();
    setMode('analysis');
    toast('Variante: ora sei in Analisi partita');
    return true;
  }
  return playInGame(move);
}

/** Analisi partita: la mossa allunga la linea mostrata, oppure apre una variante. */
function playInGame(move) {
  if (!state.setupDone) return false;
  const line = currentGame();
  const i = cur();
  const g = withMoveAt(line, i, move);
  if (!g) return false;
  state.redo = [];
  if (line.plies[i]?.uci === g.plies[i].uci) {
    setCur(i + 1); // è la mossa già presente nella linea: si va avanti
  } else if (!state.variation && i < line.plies.length) {
    // Mossa diversa a metà partita: la linea principale non si tocca, si prova una variante.
    state.variation = { base: i, game: g };
    setCur(i + 1);
    toast('Variante: la linea principale resta salvata');
  } else {
    if (state.variation) state.variation = { base: Math.min(state.variation.base, i), game: g };
    else {
      state.free = g;
      saveFree();
    }
    setCur(i + 1);
  }
  render({ animate: true });
  return true;
}

// ---------- navigazione ----------
function goTo(i) {
  if (state.retry) exitRetry(false);
  const max = currentGame().plies.length;
  const next = Math.max(0, Math.min(max, i));
  const animate = next === cur() + 1;
  setCur(next);
  render({ animate });
}

/** Cambia sezione. Revisione e Analisi partita usano setMode(); Lezioni e Problemi hanno una vista propria. */
function setSection(section) {
  if (BOARD_SECTIONS.includes(section)) return setMode(section);
  state.section = section;
  store.set('section', section);
  if (state.retry) exitRetry(false);
  // L'analisi dal vivo si ferma (una revisione in corso invece continua) e riparte al ritorno.
  if (state.review.status !== 'running') engine?.cancelAll();
  live.fen = null;
  render();
  showSectionView();
}

/** Lezioni / Problemi: il modulo della sezione viene creato la prima volta che serve. */
let puzzles = null;
let lessons = null;
function showSectionView() {
  if (state.section === 'lessons') {
    lessons ??= new LessonPlayer($('view-lessons'), {
      engine: () => (engineFailed ? null : engine),
      askPromotion,
      store,
    });
    lessons.show();
  }
  if (state.section === 'puzzles') {
    puzzles ??= new PuzzleTrainer($('view-puzzles'), {
      engine: () => (engineFailed ? null : engine),
      askPromotion,
      store,
      toast,
    });
    puzzles.show({ daily: new URLSearchParams(location.search).has('daily') });
  }
}

function setMode(mode) {
  if (state.retry) exitRetry(false);
  state.mode = mode;
  state.section = mode; // anche quando il cambio parte dall'app (es. variante dalla revisione)
  store.set('mode', mode);
  store.set('section', mode);
  if (mode === 'analysis' && state.setupDone) setOrientation(state.side);
  render();
}

// ---------- motore: analisi della posizione mostrata ----------
function startEngine() {
  try {
    engine = Engine.inWorker();
    engine.ready.catch(onEngineError);
  } catch {
    onEngineError();
  }
}

function onEngineError() {
  engineFailed = true;
  renderLive();
}

function storedEval(fen) {
  if (state.mode === 'analysis') return evalOf(fen) ?? null;
  if (state.mode !== 'review' || !state.review.analysis) return null;
  return state.review.analysis.positions.find((p) => p.fen === fen) ?? null;
}

/** Avvia (se serve) l'analisi della posizione mostrata e aggiorna linee, frecce e barra. */
function requestLive() {
  const d = displayed();
  if (live.fen !== d.fen) {
    Object.assign(live, { fen: d.fen, pending: true, result: null, highlighted: null });
    state.coachPick = null;
  }
  const busy = state.review.status === 'running' || state.retry?.phase === 'thinking'
    || state.retry?.phase === 'waiting' // durante "ritenta" le linee restano nascoste
    || (state.mode === 'review' && !reviewDone()) // nessuna partita caricata: niente da analizzare
    || (state.mode === 'analysis' && !state.setupDone)
    || !onBoard(); // Lezioni / Problemi: la scacchiera di analisi non è visibile
  if (!live.pending || busy || engineFailed || !engine) return renderLive();
  live.pending = false;
  live.gen++;
  if (positionState(d.fen).over) {
    engine.cancelAll();
    fillMissing();
    return renderLive();
  }
  const multiPv = state.mode === 'analysis' ? UI_CONFIG.gameMode.multiPv : state.multiPv;
  const stored = storedEval(d.fen);
  if (stored?.lines.length) live.result = { lines: stored.lines.slice(0, multiPv), depth: stored.depth, done: false, stored: true };
  engine.cancelAll(); // la nuova posizione ha la precedenza: l'analisi precedente si interrompe
  const fen = d.fen;
  const { mode, depth } = state;
  const gen = live.gen;
  engine.analyze(fen, { depth, multiPv, onUpdate: (r) => showLive(fen, r) })
    .then(async (r) => {
      showLive(fen, r);
      if (mode === 'analysis') {
        storeEval(fen, r, depth);
        await runCoach(fen, depth, gen);
        if (gen === live.gen) fillMissing();
      }
    })
    .catch((err) => { if (!(err instanceof AnalysisCancelled)) onEngineError(); });
  renderLive();
}

// ---------- analisi partita: valutazioni in sottofondo ----------
/** Salva una valutazione finita e aggiorna classificazioni, grafico e indicatori. */
function storeEval(fen, r, depth) {
  if (!r.done) return;
  gameEvals.set(evalKey(fen, depth), positionEval(r));
  lineMemo.clear();
  saveEvals();
  renderGame();
}

/**
 * Dopo l'analisi della posizione mostrata, valuta una alla volta le posizioni che ancora mancano
 * (prima la linea mostrata, poi la linea principale). Una nuova mossa o posizione interrompe la catena.
 */
function fillMissing() {
  if (state.mode !== 'analysis' || !state.setupDone || !engine || engineFailed) return;
  const gen = live.gen;
  for (const line of [currentGame(), state.free]) {
    const i = lineAnalysis(line).positions.findIndex((p) => !p);
    if (i < 0) continue;
    const fen = i === 0 ? line.startFen : line.plies[i - 1].fenAfter;
    const { depth } = state;
    engine.analyze(fen, { depth, multiPv: UI_CONFIG.gameMode.multiPv })
      .then((r) => {
        if (gen !== live.gen) return;
        storeEval(fen, r, depth);
        fillMissing();
      })
      .catch((err) => { if (!(err instanceof AnalysisCancelled)) onEngineError(); });
    return;
  }
}

/**
 * Allenatore: suggerimenti per la posizione mostrata, dalle linee del motore (MultiPV) e, se tocca
 * all'utente, dall'analisi a mossa nulla (che cosa minaccia l'avversario).
 */
async function runCoach(fen, depth, gen) {
  const key = evalKey(fen, depth);
  if (!state.coach.on || coachCache.has(key)) return renderCoach();
  const pe = gameEvals.get(key);
  if (!pe || pe.terminal) return renderCoach();
  const nf = fen.split(' ')[1] === state.side ? nullMoveFen(fen) : null;
  let threat = null;
  if (nf) {
    try {
      threat = positionEval(await engine.analyze(nf, { depth: ANALYSIS_CONFIG.coach.threatDepth, multiPv: 1 }));
    } catch (err) {
      if (!(err instanceof AnalysisCancelled)) onEngineError();
      return;
    }
  }
  if (gen !== live.gen) return;
  const hints = coachHints({ fen, pe, threat });
  coachCache.set(key, hints);
  // Avviso breve (utile sul telefono, dove il pannello può essere fuori schermo)
  if (hints.length && fen === displayed().fen) toast(`Allenatore: ${formatHint(hints[0], { user: state.side, level: state.coach.level }).text}`);
  renderCoach();
  renderLive(); // nel livello "Indizio" le linee si nascondono se c'è una tattica da trovare
}

/** Suggerimenti calcolati per la posizione mostrata (undefined = non ancora pronti). */
const coachFor = () => coachCache.get(evalKey(displayed().fen));

/** Livello "Indizio" con una tattica da trovare: linee e frecce del motore restano nascoste. */
function coachHides() {
  return state.mode === 'analysis' && state.coach.on && state.coach.level === 'hint'
    && state.coachPick == null && !!coachFor()?.length;
}

function renderCoach() {
  if (state.mode !== 'analysis' || !state.setupDone) return;
  $('coach-on').checked = state.coach.on;
  $('coach-level').hidden = !state.coach.on;
  const el = $('coach-body');
  if (!state.coach.on) {
    el.innerHTML = '<p class="hint">Allenatore spento: attivalo per ricevere suggerimenti tattici dopo ogni mossa.</p>';
    return;
  }
  const ps = positionState(displayed().fen);
  const hints = coachFor();
  if (ps.over || (hints && !hints.length)) {
    el.innerHTML = '<p class="hint">Nessuna tattica da segnalare in questa posizione.</p>';
    return;
  }
  if (!hints) {
    el.innerHTML = '<p class="hint">L\'allenatore sta guardando la posizione…</p>';
    return;
  }
  el.replaceChildren(...hints.map((h, i) => {
    const picked = state.coachPick === i;
    const f = formatHint(h, { user: state.side, level: picked ? 'solution' : state.coach.level });
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `coach-hint${h.threat ? ' threat' : ''}${picked ? ' picked' : ''}`;
    b.setAttribute('aria-pressed', String(picked));
    b.innerHTML = '<span class="coach-title"></span><span class="coach-text"></span>';
    b.querySelector('.coach-title').textContent = f.title;
    b.querySelector('.coach-text').textContent = f.text;
    if (picked && f.line) {
      const line = document.createElement('span');
      line.className = 'mc-line';
      line.textContent = `Variante del motore: ${f.line}`;
      b.append(line);
    } else {
      const more = document.createElement('span');
      more.className = 'coach-more';
      more.textContent = state.coach.level === 'hint' ? 'Tocca per la soluzione' : 'Tocca per la freccia e la variante';
      b.append(more);
    }
    b.addEventListener('click', () => {
      state.coachPick = picked ? null : i;
      renderCoach();
      renderLive();
    });
    return b;
  }));
}

/** Analisi (parziale) di una linea con le valutazioni pronte; memorizzata finché non ne arrivano di nuove. */
function lineAnalysis(game) {
  const key = `${state.depth}|${game.startFen}|${game.plies.map((p) => p.uci).join(' ')}|${game.ending}`;
  if (moveMemo.size > MOVE_MEMO_MAX) moveMemo.clear();
  if (!lineMemo.has(key)) lineMemo.set(key, analyzeLine(game, evalOf, openingBook, moveMemo));
  return lineMemo.get(key);
}

function showLive(fen, r) {
  if (fen !== live.fen) return;
  // Non sostituire l'analisi salvata della revisione con un risultato parziale meno profondo.
  if (live.result?.stored && !r.done && r.depth < live.result.depth) return;
  live.result = r;
  renderLive();
}

function refreshLive() {
  live.pending = true;
  requestLive();
}

// ---------- rendering ----------
function render({ animate = false } = {}) {
  renderTabs();
  renderVisibility();
  renderBoard(animate);
  renderTags();
  renderNav();
  renderMoves();
  renderReviewCards();
  renderGraph();
  renderGame();
  requestLive();
}

function renderTabs() {
  for (const b of document.querySelectorAll('.tabs [data-mode]')) {
    const on = b.dataset.mode === state.section;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    if (on) {
      $('section-title').textContent = b.textContent.trim();
      $('section-sub').textContent = b.dataset.sub;
    }
  }
  $('view-board').hidden = !onBoard();
  $('view-lessons').hidden = state.section !== 'lessons';
  $('view-puzzles').hidden = state.section !== 'puzzles';
  document.body.dataset.section = state.section;
}

function renderVisibility() {
  const rs = state.review.status;
  const inReview = state.mode === 'review';
  $('review-input').hidden = !(inReview && rs === 'empty');
  $('review-progress').hidden = !(inReview && rs === 'running');
  $('review-summary').hidden = !reviewDone() || !!state.retry;
  $('move-card').hidden = !reviewDone();
  const setup = !inReview && !state.setupDone; // Analisi partita, prima di "Inizia"
  $('graph-card').hidden = inReview ? !reviewDone() : setup;
  $('game-setup').hidden = !setup;
  $('adv-card').hidden = inReview || setup;
  $('coach-card').hidden = inReview || setup;
  $('variation-bar').hidden = inReview || setup || !state.variation;
  $('game-move-card').hidden = inReview || setup;
  $('setup-back').hidden = !state.free.plies.length;
  $('lines-control').hidden = !inReview; // in Analisi partita le linee sono sempre UI_CONFIG.gameMode.multiPv
  $('move-form').hidden = inReview || setup;
  $('input-error').hidden = inReview;
  $('analysis-tools').hidden = inReview || setup;
  $('lines-card').hidden = (inReview && rs !== 'done') || setup;
  $('moves-card').hidden = (inReview && rs !== 'done') || setup;
  if (inReview && rs === 'running') renderProgress();
}

function renderBoard(animate) {
  const d = displayed();
  const c = new Chess(d.fen);
  let check = null;
  if (c.inCheck()) check = c.board().flat().find((p) => p && p.type === 'k' && p.color === c.turn())?.square ?? null;
  board.setPosition(c.board().flat().filter(Boolean), d.lastMove ? { from: d.lastMove.from, to: d.lastMove.to } : null, check, animate);
  renderBadge();
  if (reviewDone()) graph.setCursor(state.retry ? state.retry.index : cur());
}

/** Icona della categoria sulla casa d'arrivo della mossa mostrata. */
function renderBadge() {
  let badge = null;
  if (state.retry?.attempt) {
    badge = { square: state.retry.attempt.ply.to, html: classIcon(state.retry.attempt.classification) };
  } else if (reviewDone() && !state.retry && cur() > 0) {
    const m = state.review.analysis.moves[cur() - 1];
    badge = { square: m.ply.to, html: classIcon(m.classification) };
  } else if (state.mode === 'analysis' && state.setupDone && cur() > 0) {
    const m = lineAnalysis(currentGame()).moves[cur() - 1];
    if (m) badge = { square: m.ply.to, html: classIcon(m.classification) };
  }
  board.setBadge(badge);
}

function renderTags() {
  const c = new Chess(displayed().fen);
  const turn = c.turn();
  const over = positionState(displayed().fen).over;
  const label = (color) => {
    if (state.mode === 'review' && state.review.game) {
      const h = state.review.game.headers;
      const name = (color === 'w' ? h.White : h.Black) || COLOR_NAME[color];
      const acc = state.review.analysis?.players[color].accuracy;
      return `${name}${acc != null ? ` · ${fmt1(acc)}` : ''}`;
    }
    const h = state.free.headers;
    const name = (color === 'w' ? h.White : h.Black) || COLOR_NAME[color];
    return state.setupDone && color === state.side ? `${name} (tu)` : name;
  };
  const top = state.orientation === 'w' ? 'b' : 'w';
  const bottom = state.orientation;
  for (const [el, color] of [[$('tag-top'), top], [$('tag-bottom'), bottom]]) {
    el.textContent = label(color);
    el.classList.toggle('to-move', !over && turn === color);
  }
}

function renderNav() {
  const max = currentGame().plies.length;
  const i = cur();
  const lock = state.mode === 'review' && !reviewDone();
  $('nav-first').disabled = lock || (i === 0 && !state.retry);
  $('nav-prev').disabled = lock || (i === 0 && !state.retry);
  $('nav-next').disabled = lock || i >= max;
  $('nav-last').disabled = lock || i >= max;
  $('btn-undo').disabled = state.mode !== 'analysis' || currentGame().plies.length === 0;
  $('btn-redo').disabled = !state.redo.length;
}

function renderMoves() {
  const game = currentGame();
  renderMoveList($('movelist'), {
    game,
    moves: reviewDone() ? state.review.analysis.moves : state.mode === 'analysis' ? lineAnalysis(game).moves : null,
    cursor: state.retry ? -1 : cur(),
    onSelect: (i) => goTo(i),
  });
}

function renderProgress() {
  const [done, total] = state.review.progress;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $('progress-fill').style.width = pct + '%';
  $('progress').setAttribute('aria-valuenow', String(pct));
  $('progress-text').textContent = `Stockfish sta analizzando ${done}/${total} posizioni (profondità ${state.reviewDepth})…`;
}

function renderLive() {
  const d = displayed();
  const ps = positionState(d.fen);
  const ol = $('lines');
  const info = $('depth-info');
  const r = live.result;
  const lines = r?.lines ?? [];

  // Testo e linee
  info.textContent = '';
  if (state.retry && state.retry.phase !== 'done') {
    renderEngineMessage(ol, state.retry.phase === 'thinking' ? 'Il motore sta valutando la tua mossa…' : 'Linee nascoste: trova tu la mossa migliore.');
  } else if (engineFailed) {
    renderEngineMessage(ol, 'Il motore non si è avviato. Apri l\'app tramite il server locale (vedi README), non con un doppio clic su index.html.');
  } else if (ps.over) {
    renderEngineMessage(ol, ps.text);
  } else if (state.review.status === 'running') {
    renderEngineMessage(ol, 'Il motore è occupato con la revisione della partita…');
  } else if (coachHides()) {
    renderEngineMessage(ol, 'Linee nascoste: c\'è una tattica da trovare. Tocca il suggerimento dell\'allenatore per la soluzione.');
  } else if (!lines.length) {
    renderEngineMessage(ol, engine?.isReady ? 'Analisi in corso…' : 'Avvio del motore…');
  } else {
    info.textContent = `profondità ${r.depth}${r.done ? ' ✓' : '…'}${r.fromCache ? ' · cache' : ''}`;
    renderEngineLines(ol, {
      fen: d.fen,
      lines,
      highlighted: live.highlighted,
      onPick: (i) => playMove(uciToMove(lines[i].pv[0])),
      onHover: (i) => { live.highlighted = i; renderArrows(); markHighlighted(); },
    });
  }
  renderArrows();

  // Barra di valutazione: in "ritenta" (prima del tentativo) usa la valutazione salvata della posizione
  let score = lines[0]?.score ?? null;
  if (!score && state.retry && !state.retry.attempt) score = state.review.analysis.moves[state.retry.index].before.score;
  renderEvalBar(
    { bar: $('evalbar'), fill: $('evalbar-fill'), label: $('evalbar-label') },
    { score: ps.over ? null : score, mateWinner: ps.mateWinner ?? null, draw: !!ps.draw, orientation: state.orientation },
  );
  if (state.mode === 'analysis' && state.setupDone) renderAdvantage(lineAnalysis(currentGame()));
}

function markHighlighted() {
  [...$('lines').children].forEach((li, i) => li.classList.toggle('hl', i === live.highlighted));
}

function renderArrows() {
  const r = state.retry;
  if (r && r.phase !== 'done') {
    if (r.showSolution) {
      const best = state.review.analysis.moves[r.index].bestMove;
      board.setArrows(best ? [{ from: best.slice(0, 2), to: best.slice(2, 4), ...UI_CONFIG.solutionArrow }] : []);
    } else {
      board.setArrows([]);
    }
    return;
  }
  const lines = live.result?.lines ?? [];
  if (positionState(displayed().fen).over || (state.mode === 'review' && !reviewDone())) return board.setArrows([]);
  if (state.mode === 'analysis') {
    const h = state.coachPick != null ? coachFor()?.[state.coachPick] : null;
    if (h) {
      const style = h.threat ? UI_CONFIG.coachThreatArrow : UI_CONFIG.coachArrow;
      return board.setArrows([{ from: h.move.slice(0, 2), to: h.move.slice(2, 4), ...style }]);
    }
    if (coachHides()) return board.setArrows([]);
  }
  const styles = UI_CONFIG.arrows;
  board.setArrows(lines.map((l, i) => {
    const s = styles[Math.min(i, styles.length - 1)];
    const hl = live.highlighted === i;
    return {
      from: l.pv[0].slice(0, 2),
      to: l.pv[0].slice(2, 4),
      color: hl && i > 0 ? UI_CONFIG.arrowHighlight : s.color,
      width: hl ? Math.max(s.width, 0.17) : s.width,
      opacity: hl ? 0.95 : live.highlighted != null && i !== 0 ? 0.2 : s.opacity,
    };
  }));
}

function evalText(pe) {
  if (pe.terminal === 'checkmate') return '#';
  if (pe.terminal === 'draw') return '½';
  return formatScore(pe.score);
}

/** Spiegazioni di una mossa, ciascuna con la variante del motore che la dimostra. */
function explanationsHtml(facts) {
  if (!facts?.length) return '';
  const items = facts.map((f) => {
    const { text, line } = formatExplanation(f);
    return `<li>${text}<span class="mc-line">Variante: ${line}</span></li>`;
  });
  return `<ul class="mc-explain">${items.join('')}</ul>`;
}

/** Intestazione della scheda di una mossa: categoria, valutazione, mossa migliore, spiegazioni. */
function moveDetailsHtml(m) {
  const info = CLASS_INFO[m.classification];
  let html = `<div class="mc-head">${classIcon(m.classification)}<div>
      <div class="mc-title">${moveLabel(m.ply)} <span class="cls-text cls-${m.classification}">${info.label}</span></div>
      <div class="mc-sub">Valutazione ${evalText(m.after)} · perdita ${fmt1(m.winLoss)} punti di win% · precisione ${Math.round(m.accuracy)}</div>
    </div></div>`;
  if (!m.isBest && m.bestSan && m.before.lines[0]) {
    html += `<p class="mc-best">Migliore: <b>${toItalian(m.bestSan)}</b> (${formatScore(m.before.lines[0].score)})
      <span class="mc-line">${numberedLine(m.ply.fenBefore, m.before.lines[0].pv, UI_CONFIG.lineMoves)}</span></p>`;
  }
  return html + explanationsHtml(m.explanations ?? explainMove(m));
}

// ---------- "I tuoi errori": esercizi dagli errori della revisione (praticati in Problemi) ----------
let savedMistakeIds = null; // id già salvati (si legge localStorage una volta sola)

function saveInfo(a) {
  savedMistakeIds ??= new Set(loadMistakes(store).map((x) => x.id));
  const h = a.headers ?? {};
  const user = (store.get('onlineUser', '') || '').toLowerCase();
  const me = user && h.White?.toLowerCase() === user ? 'w' : user && h.Black?.toLowerCase() === user ? 'b' : null;
  const counts = {};
  const saved = {};
  for (const c of ['w', 'b']) {
    const items = mistakesFromReview(a, c, '');
    counts[c] = items.length;
    saved[c] = items.length > 0 && items.every((x) => savedMistakeIds.has(x.id));
  }
  return { counts, saved, me };
}

function saveMyMistakes(a, color) {
  const h = a.headers ?? {};
  const label = `${h.White || 'Bianco'} – ${h.Black || 'Nero'}${h.UTCDate || h.Date ? `, ${(h.UTCDate || h.Date).replace(/\./g, '-')}` : ''}`;
  const { list, added } = mergeMistakes(loadMistakes(store), mistakesFromReview(a, color, label), UI_CONFIG.myMistakes.max);
  saveMistakes(store, list);
  savedMistakeIds = new Set(list.map((x) => x.id));
  toast(added ? `${added} ${added === 1 ? 'esercizio aggiunto' : 'esercizi aggiunti'}: li trovi in Problemi → I tuoi errori` : 'Erano già salvati');
  renderReviewCards();
}

function renderReviewCards() {
  if (!reviewDone()) return;
  const a = state.review.analysis;
  if (!state.retry) {
    renderSummary($('review-summary'), a, retryCandidates(a).length, saveInfo(a));
    for (const b of $('review-summary').querySelectorAll('[data-save]')) b.onclick = () => saveMyMistakes(a, b.dataset.save);
    $('btn-retry-all').onclick = () => {
      const first = retryCandidates(a)[0];
      if (first != null) startRetry(first);
    };
    $('btn-new-review').onclick = newReview;
  }
  const el = $('move-card');
  if (state.retry) return renderRetryCard(el, a);

  const i = cur();
  if (i === 0) {
    el.innerHTML = '<div class="mc-title">Posizione iniziale</div><p class="hint">Usa ◀ ▶ (o le frecce della tastiera), tocca il grafico oppure una mossa della lista.</p>';
    return;
  }
  const m = a.moves[i - 1];
  let html = moveDetailsHtml(m);
  if (m.isBest && RETRY_CLASSIFICATIONS.includes(m.classification)) html += `<p class="hint">${UNSTABLE_NOTE}</p>`;
  const key = a.keyMoments.find((k) => k.index === i - 1);
  if (key) html += `<p class="mc-key">Momento chiave: win% del Bianco ${key.swing > 0 ? '+' : '−'}${fmt1(Math.abs(key.swing))}</p>`;
  if (a.bookPlies === i && a.opening) html += `<p class="hint">Fine della teoria (${a.opening.name}).</p>`;
  if (RETRY_CLASSIFICATIONS.includes(m.classification)) {
    html += '<button type="button" class="btn" id="btn-retry-this">Ritenta questa mossa</button>';
  }
  el.innerHTML = html;
  $('btn-retry-this')?.addEventListener('click', () => startRetry(i - 1));
}

// ---------- ritenta la mossa ----------
function startRetry(index) {
  const a = state.review.analysis;
  const prevOrientation = state.retry ? state.retry.prevOrientation : state.orientation;
  state.retry = { index, phase: 'waiting', attempt: null, showSolution: false, prevOrientation };
  state.cursors.review = index;
  // La scacchiera si gira dalla parte di chi deve ritentare.
  setOrientation(a.moves[index].ply.color);
  render();
}

function exitRetry(doRender = true) {
  const r = state.retry;
  if (!r) return;
  if (r.phase === 'thinking') engine?.cancelAll();
  state.retry = null;
  setOrientation(r.prevOrientation);
  live.pending = true;
  if (doRender) render();
}

async function submitRetry(move) {
  const r = state.retry;
  if (r.phase !== 'waiting') return false;
  const a = state.review.analysis;
  const c = new Chess(a.moves[r.index].ply.fenBefore);
  let m;
  try { m = c.move(move); } catch { return false; }
  // Mostra subito la mossa; il giudizio arriva dal motore.
  r.phase = 'thinking';
  r.showSolution = false;
  r.attempt = { ply: { from: m.from, to: m.to, fenAfter: c.fen(), san: m.san }, classification: null };
  engine.cancelAll();
  render({ animate: true });
  try {
    const result = await evaluateAttempt({ analysis: a, index: r.index, move, engine });
    if (state.retry !== r) return true;
    r.attempt = result;
    r.phase = 'done';
    live.pending = true;
    render();
  } catch (err) {
    if (state.retry !== r) return true;
    r.phase = 'waiting';
    r.attempt = null;
    if (!(err instanceof AnalysisCancelled)) onEngineError();
    render();
  }
  return true;
}

function renderRetryCard(el, a) {
  const r = state.retry;
  const m = a.moves[r.index];
  const who = COLOR_NAME[m.ply.color];
  const head = `<div class="mc-head">${classIcon(m.classification)}<div>
      <div class="mc-title">Ritenta: ${moveLabel(m.ply)} <span class="cls-text cls-${m.classification}">${CLASS_INFO[m.classification].label}</span></div>
      <div class="mc-sub">Trova una mossa migliore per il ${who}.</div></div></div>`;
  const solution = r.showSolution && m.bestSan
    ? `<p class="mc-best">Soluzione: <b>${toItalian(m.bestSan)}</b> (${formatScore(m.before.lines[0].score)})
       <span class="mc-line">${numberedLine(m.ply.fenBefore, m.before.lines[0].pv, UI_CONFIG.lineMoves)}</span></p>` : '';
  const hasNext = retryCandidates(a).some((i) => i > r.index);
  const buttons = (list) => `<div class="toolbar two">${list.join('')}</div>`;
  const B = {
    again: '<button type="button" class="btn primary" data-act="again">Riprova</button>',
    solution: '<button type="button" class="btn" data-act="solution">Mostra soluzione</button>',
    next: `<button type="button" class="btn" data-act="next" ${hasNext ? '' : 'disabled'}>Errore successivo</button>`,
    exit: '<button type="button" class="btn" data-act="exit">Esci</button>',
  };

  if (r.phase === 'waiting') {
    el.innerHTML = head + solution + buttons([r.showSolution ? B.next : B.solution, B.exit]);
  } else if (r.phase === 'thinking') {
    el.innerHTML = head + `<p class="mc-feedback">Hai giocato <b>${toItalian(r.attempt.ply.san)}</b>: il motore la sta valutando…</p>`;
  } else {
    const att = r.attempt;
    const label = CLASS_INFO[att.classification].label;
    const isError = RETRY_CLASSIFICATIONS.includes(att.classification);
    const loss = `perdita ${fmt1(att.winLoss)} punti di win%`;
    let msg;
    if (isError && att.isBest) msg = `è la prima scelta del motore, ma analizzando la posizione dopo la mossa risulta "${label}" (${loss}): a questa profondità la valutazione è instabile.`;
    else if (isError) msg = `anche questa è una mossa da "${label}" (${loss}).`;
    else if (att.isBest || ['brilliant', 'great', 'best'].includes(att.classification)) msg = 'esatto, è la mossa migliore secondo il motore!';
    else if (att.classification === 'excellent') msg = `mossa eccellente (${loss}), quasi come la migliore.`;
    else msg = `buona mossa (${loss}), ma c'era di meglio.`;
    let reply = isError ? explanationsHtml(att.explanations) : '';
    if (isError && !reply && att.after.lines[0]) {
      reply = `<p class="mc-best">Il motore risponde: <span class="mc-line">${numberedLine(att.ply.fenAfter, att.after.lines[0].pv, UI_CONFIG.lineMoves)}</span></p>`;
    }
    el.innerHTML = head + `<p class="mc-feedback">${classIcon(att.classification)} <b>${toItalian(att.ply.san)}</b>: ${msg}</p>` + reply
      + buttons([B.again, B.solution, B.next, B.exit]);
  }
  el.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => retryAction(b.dataset.act));
  });
}

function retryAction(act) {
  const r = state.retry;
  const a = state.review.analysis;
  if (act === 'exit') return exitRetry();
  if (act === 'next') {
    const next = retryCandidates(a).find((i) => i > r.index);
    return next == null ? exitRetry() : startRetry(next);
  }
  r.phase = 'waiting';
  r.attempt = null;
  r.showSolution = act === 'solution';
  render();
}

// ---------- analisi partita: grafico, indicatori, schede ----------
/** Grafico della revisione o della partita in analisi (cresce man mano che le posizioni sono valutate). */
function renderGraph() {
  let win;
  let marks;
  let cursor;
  if (reviewDone()) {
    const a = state.review.analysis;
    win = a.positions.map((p) => p.winPct);
    marks = a.moves.map((m, i) => ({ index: i + 1, cls: m.classification })).filter((m) => GRAPH_MARKS.includes(m.cls));
    cursor = state.retry ? state.retry.index : cur();
  } else if (state.mode === 'analysis' && state.setupDone) {
    const a = lineAnalysis(currentGame());
    win = [];
    for (const p of a.positions) {
      if (!p) break;
      win.push(p.winPct);
    }
    marks = a.moves.map((m, i) => ({ index: i + 1, cls: m?.classification }))
      .filter((m) => m.index < win.length && GRAPH_MARKS.includes(m.cls));
    const tp = mainTurningPoint();
    if (tp && !state.variation && tp.moveIndex + 1 < win.length) marks.push({ index: tp.moveIndex + 1, cls: 'turning' });
    cursor = Math.min(cur(), Math.max(0, win.length - 1));
  } else {
    return;
  }
  const key = `${state.mode}|${win.join(',')}|${marks.map((m) => m.index + m.cls).join(',')}`;
  if (key !== graphShown) {
    graph.setData(win, marks);
    graphShown = key;
  }
  graph.setCursor(cursor);
}

/** Dove il giocatore ha iniziato a perdere vantaggio, sulla linea principale. */
function mainTurningPoint() {
  const a = lineAnalysis(state.free);
  return turningPoint(a.positions, a.moves, state.side);
}

/** Aggiorna tutto ciò che dipende dalle valutazioni (chiamata anche quando arriva una valutazione). */
function renderGame() {
  if (state.mode !== 'analysis' || !state.setupDone) return;
  const a = lineAnalysis(currentGame());
  renderAdvantage(a);
  renderGameMoveCard(a);
  renderVariationBar();
  renderCoach();
  renderBadge();
  renderGraph();
  renderMoves();
}

const ADV_TEXT = {
  slight: 'sta leggermente meglio',
  clear: 'ha un chiaro vantaggio',
  decisive: 'ha un vantaggio decisivo',
};

/** "Chi sta meglio e di quanto" nella posizione mostrata, e dove il giocatore ha perso il vantaggio. */
function renderAdvantage(a) {
  const el = $('adv-card');
  const i = cur();
  let pe = a.positions[i];
  let partial = false;
  if (!pe && live.fen === displayed().fen && live.result?.lines?.length) {
    pe = positionEval({ ...live.result, fen: live.fen }); // analisi ancora in corso
    partial = true;
  }
  const who = (color) => `il ${COLOR_NAME[color]}${color === state.side ? ' (tu)' : ''}`;
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  let html;
  if (!pe) {
    html = '<div class="adv-title">Valutazione in corso…</div>';
  } else {
    const adv = advantageOf(pe);
    let title;
    if (adv.level === 'checkmate') title = `Scacco matto: vince ${who(adv.side)}`;
    else if (adv.level === 'draw') title = 'Patta';
    else if (adv.level === 'mate') title = `${cap(who(adv.side))} ha il matto in ${Math.abs(adv.mate)}`;
    else if (adv.level === 'equal') title = 'Posizione equilibrata';
    else title = `${cap(who(adv.side))} ${ADV_TEXT[adv.level]}`;
    const whitePct = Math.round(adv.winPct);
    const sub = pe.terminal ? '' : `Valutazione ${formatScore(pe.score)} · win% del Bianco ${whitePct}${partial ? ' · analisi in corso…' : ''}`;
    html = `<div class="adv-title adv-${adv.side ?? 'none'}">${title}</div>
      <div class="adv-meter" role="img" aria-label="win% del Bianco ${whitePct}"><div class="adv-meter-fill" data-pct="${adv.winPct}"></div></div>
      ${sub ? `<div class="adv-sub">${sub}</div>` : ''}`;
  }
  const tp = mainTurningPoint();
  if (tp) {
    const ply = state.free.plies[tp.moveIndex];
    html += `<p class="adv-turn">Hai iniziato a perdere vantaggio con
      <button type="button" class="link-btn" data-goto="${tp.moveIndex + 1}">${moveLabel(ply)}</button>:
      la tua win% è scesa da ${Math.round(tp.peakWin)} a ${Math.round(tp.nowWin)}.</p>`;
  }
  el.innerHTML = html;
  // Larghezza impostata da JS e non con style="…" nell'HTML: la CSP del sito non permette stili inline
  for (const f of el.querySelectorAll('[data-pct]')) f.style.width = `${f.dataset.pct}%`;
  el.querySelector('[data-goto]')?.addEventListener('click', (e) => {
    state.variation = null;
    goTo(Number(e.currentTarget.dataset.goto));
  });
}

function renderGameMoveCard(a) {
  const el = $('game-move-card');
  const i = cur();
  if (i === 0) {
    el.innerHTML = `<div class="mc-title">Posizione iniziale</div>
      <p class="hint">Gioca la prima mossa: trascina un pezzo oppure scrivila qui sotto (es. e4, Cf3, O-O).</p>`;
    return;
  }
  const m = a.moves[i - 1];
  const ply = currentGame().plies[i - 1];
  let html = m ? moveDetailsHtml(m) : `<div class="mc-title">${moveLabel(ply)}</div><p class="hint">Stockfish sta valutando la mossa…</p>`;
  if (a.opening && i <= a.bookPlies) html += `<p class="hint">Teoria: ${a.opening.eco} · ${a.opening.name}</p>`;
  el.innerHTML = html;
}

function renderVariationBar() {
  const v = state.variation;
  if (!v) return;
  const replaced = state.free.plies[v.base];
  $('variation-text').textContent = `Stai provando una variante${replaced ? ` al posto di ${moveLabel(replaced)}` : ''}: `
    + 'la linea principale resta salvata.';
}

// ---------- revisione ----------
async function startReview() {
  const text = $('pgn-text').value;
  showReviewError('');
  let game;
  try {
    const games = splitPgnGames(text);
    if (!games.length) throw new PgnError('Incolla un PGN o apri un file.');
    const sel = $('game-select');
    game = gameFromPgn(games[sel.hidden ? 0 : Number(sel.value)] ?? games[0]);
    if (!game.plies.length) throw new PgnError('La partita non contiene mosse.');
  } catch (err) {
    showReviewError(err instanceof PgnError ? err.message : 'PGN non valido.');
    return;
  }
  if (state.retry) exitRetry(false);
  state.review = { status: 'running', game, analysis: null, progress: [0, game.plies.length + 1] };
  state.cursors.review = 0;
  engine?.cancelAll();
  render();
  if (!engine || engineFailed) {
    state.review.status = 'empty';
    showReviewError('Il motore non è disponibile.');
    return render();
  }
  try {
    const book = await bookPromise;
    const analysis = await analyzeGame(game, engine, {
      book,
      settings: { ...ANALYSIS_CONFIG.gameAnalysis, depth: state.reviewDepth },
      onProgress: (done, total) => {
        state.review.progress = [done, total];
        renderProgress();
      },
    });
    if (state.review.game !== game) return; // nel frattempo è iniziata un'altra revisione
    finishReview(game, analysis);
    saveReview();
  } catch (err) {
    if (state.review.game !== game) return;
    state.review = { status: 'empty', game: null, analysis: null, progress: [0, 0] };
    if (!(err instanceof AnalysisCancelled)) showReviewError(`Analisi non riuscita: ${err.message}`);
    render();
  }
}

function finishReview(game, analysis) {
  state.review = { status: 'done', game, analysis, progress: [0, 0] };
  graphShown = null; // il grafico va ridisegnato con la nuova revisione (renderGraph)
  live.pending = true;
  render();
}

function newReview() {
  if (state.retry) exitRetry(false);
  state.review = { status: 'empty', game: null, analysis: null, progress: [0, 0] };
  state.cursors.review = 0;
  store.set('review', '');
  render();
}

function showReviewError(msg) {
  $('review-error').textContent = msg;
}

function updateGameSelect() {
  const sel = $('game-select');
  let games = [];
  try { games = splitPgnGames($('pgn-text').value); } catch { /* il messaggio arriva premendo Analizza */ }
  const many = games.length > 1;
  sel.hidden = !many;
  $('game-select-label').hidden = !many;
  if (!many) return;
  sel.replaceChildren(...games.map((g, i) => {
    let text = `Partita ${i + 1}`;
    try {
      const h = parsePgn(g).headers;
      text = `${i + 1}. ${h.White ?? '?'} – ${h.Black ?? '?'} (${h.Result ?? '*'})`;
    } catch { /* testo non valido: resta il numero */ }
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = text;
    return o;
  }));
}

// ---------- salvataggio ----------
function saveFree() {
  store.set('free', gameToPgn(state.free));
}

/** Valutazioni della linea principale (così dopo una ricarica non si rifà l'analisi). */
function saveEvals() {
  const fens = new Set([state.free.startFen, ...state.free.plies.map((p) => p.fenAfter)]);
  const keep = [...gameEvals].filter(([k]) => fens.has(k.slice(k.indexOf('|') + 1)));
  store.set('evals', JSON.stringify(keep));
}

function saveReview() {
  const { game, analysis } = state.review;
  store.set('review', JSON.stringify({ pgn: gameToPgn(game), analysis }));
}

function restore() {
  try {
    const pgn = store.get('free', '') || store.get('pgn', ''); // 'pgn': versione precedente dell'app
    if (pgn) state.free = gameFromPgn(pgn);
  } catch {
    state.free = createGame();
  }
  state.cursors.analysis = state.free.plies.length;
  if (state.free.plies.length) state.setupDone = true; // partita salvata da una versione precedente dell'app
  try {
    for (const [k, v] of JSON.parse(store.get('evals', '') || '[]')) gameEvals.set(k, v);
  } catch { /* valutazioni salvate non leggibili: si rifanno */ }
  try {
    const saved = JSON.parse(store.get('review', '') || 'null');
    if (saved) {
      const game = gameFromPgn(saved.pgn);
      if (saved.analysis?.moves?.length === game.plies.length) finishReview(game, saved.analysis);
    }
  } catch { /* revisione salvata non leggibile: si riparte */ }
}

// ---------- dialoghi ----------
function askPromotion(color) {
  return new Promise((resolve) => {
    const dlg = $('dlg-promo');
    const box = $('promo-choice');
    box.replaceChildren();
    for (const p of ['q', 'r', 'b', 'n']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<img src="pieces/${color}${p.toUpperCase()}.svg" alt="${p}">`;
      b.onclick = () => { dlg.close(); resolve(p); };
      box.append(b);
    }
    dlg.onclose = () => resolve(null);
    dlg.showModal();
  });
}

function openIO() {
  $('io-fen').value = displayed().fen;
  $('io-pgn').value = gameToPgn(state.free);
  $('io-error').textContent = '';
  $('dlg-io').showModal();
}

function loadFromIO() {
  const fenTxt = $('io-fen').value.trim();
  const pgnTxt = $('io-pgn').value.trim();
  const err = $('io-error');
  try {
    if (pgnTxt && pgnTxt !== gameToPgn(state.free).trim()) {
      state.free = gameFromPgn(splitPgnGames(pgnTxt)[0] ?? '');
      state.cursors.analysis = state.free.plies.length;
      toast('Partita caricata');
    } else {
      state.free = createGame(fenTxt);
      state.cursors.analysis = 0;
      toast('Posizione caricata');
    }
  } catch (e) {
    err.textContent = e instanceof PgnError ? e.message : 'Testo non valido.';
    return;
  }
  Object.assign(state, { variation: null, redo: [], setupDone: true });
  store.set('setupDone', '1');
  saveFree();
  $('dlg-io').close();
  render();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback per http non sicuro (es. apertura dal telefono in rete locale)
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copiato negli appunti');
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), UI_CONFIG.toastMs);
}

// ---------- tema e orientamento ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#f5f7fb' : '#060b18';
}

function setOrientation(color) {
  state.orientation = color;
  board.setOrientation(color);
}

function buildSegmented(el, options, current, onPick) {
  el.replaceChildren();
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt.label;
    b.setAttribute('role', 'radio');
    const on = opt.value === current;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
    b.onclick = () => {
      [...el.children].forEach((x) => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      onPick(opt.value);
    };
    el.append(b);
  }
}

// ---------- eventi ----------
for (const b of document.querySelectorAll('.tabs [data-mode]')) b.onclick = () => setSection(b.dataset.mode);

$('nav-first').onclick = () => (state.retry ? exitRetry() : goTo(0));
$('nav-prev').onclick = () => (state.retry ? exitRetry() : goTo(cur() - 1));
$('nav-next').onclick = () => goTo(cur() + 1);
$('nav-last').onclick = () => goTo(currentGame().plies.length);
$('btn-flip').onclick = () => {
  setOrientation(state.orientation === 'w' ? 'b' : 'w');
  render();
};

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (!onBoard()) return (state.section === 'lessons' ? lessons : puzzles)?.onKey(e);
  if (state.mode === 'review' && !reviewDone()) return;
  const actions = {
    ArrowLeft: () => (state.retry ? exitRetry() : goTo(cur() - 1)),
    ArrowRight: () => goTo(cur() + 1),
    Home: () => goTo(0),
    End: () => goTo(currentGame().plies.length),
    f: () => $('btn-flip').click(),
  };
  const act = actions[e.key];
  if (act) {
    e.preventDefault();
    act();
  }
});

$('btn-analyze').onclick = startReview;
$('btn-cancel-review').onclick = () => engine?.cancelAll();
$('pgn-text').addEventListener('input', () => { showReviewError(''); updateGameSelect(); });
$('pgn-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  $('pgn-text').value = await file.text();
  e.target.value = '';
  showReviewError('');
  updateGameSelect();
});
// Libreria: la partita scelta passa dallo stesso percorso di un PGN incollato.
const library = new Library($('dlg-library'), (pgnText) => {
  $('pgn-text').value = pgnText;
  updateGameSelect();
  startReview();
});
$('btn-library').onclick = () => library.open();
const onlineGames = new OnlineGames($('dlg-online'), {
  store,
  onPick: (pgnText) => {
    $('pgn-text').value = pgnText;
    updateGameSelect();
    startReview();
  },
});
$('btn-online').onclick = () => onlineGames.open();

$('move-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('move-text');
  const c = new Chess(displayed().fen);
  if (c.isGameOver()) return ($('input-error').textContent = 'La partita è terminata.');
  const mv = parseUserMove(c, input.value);
  if (!mv) {
    $('input-error').textContent = `"${input.value}" non è una mossa legale per il ${COLOR_NAME[c.turn()]}. Esempi: e4, Cf3, O-O, e2e4.`;
    return;
  }
  if (playMove(mv)) input.value = '';
});
$('move-text').addEventListener('input', () => { $('input-error').textContent = ''; });

// ---------- analisi partita: comandi ----------
let setupColor = state.side;
buildSegmented($('setup-color'), [{ label: 'Bianco', value: 'w' }, { label: 'Nero', value: 'b' }], setupColor, (v) => { setupColor = v; });

$('btn-setup-start').onclick = () => {
  let g;
  try {
    g = createGame($('setup-fen').value.trim() || undefined);
  } catch (e) {
    $('setup-error').textContent = e instanceof PgnError ? e.message : 'FEN non valida.';
    return;
  }
  $('setup-error').textContent = '';
  const white = $('setup-white').value.trim();
  const black = $('setup-black').value.trim();
  g.headers = { ...(white && { White: white }), ...(black && { Black: black }) };
  Object.assign(state, { free: g, variation: null, redo: [], setupDone: true, side: setupColor });
  store.set('side', setupColor);
  store.set('setupDone', '1');
  setCur(0);
  saveFree();
  setOrientation(setupColor);
  render();
};
$('setup-back').onclick = () => {
  state.setupDone = true;
  store.set('setupDone', '1');
  render();
};

/** Sostituisce la linea mostrata (principale o variante) con `g`. */
function replaceLine(g) {
  if (state.variation) state.variation = { ...state.variation, game: g };
  else {
    state.free = g;
    saveFree();
  }
}

$('btn-undo').onclick = () => {
  // Toglie l'ultima mossa della linea mostrata; "Ripeti" la rimette.
  const line = currentGame();
  const n = line.plies.length;
  if (!n) return;
  state.redo.push(line.plies[n - 1].uci);
  if (state.variation && n - 1 <= state.variation.base) {
    // La variante è vuota: si torna alla linea principale.
    setCur(state.variation.base);
    state.variation = null;
    state.redo = [];
  } else {
    replaceLine(truncateGame(line, n - 1));
    setCur(Math.min(cur(), n - 1));
  }
  render();
};
$('btn-redo').onclick = () => {
  const uci = state.redo.pop();
  if (!uci) return;
  const line = currentGame();
  const g = withMoveAt(line, line.plies.length, uciToMove(uci));
  if (!g) {
    state.redo = [];
    return render();
  }
  replaceLine(g);
  setCur(g.plies.length);
  render({ animate: true });
};
$('btn-var-main').onclick = () => {
  const { base } = state.variation;
  state.variation = null;
  state.redo = [];
  setCur(base);
  render();
};
$('btn-var-promote').onclick = () => {
  state.free = { ...state.variation.game, headers: state.free.headers };
  state.variation = null;
  state.redo = [];
  saveFree();
  saveEvals();
  toast('La variante ora è la linea principale');
  render();
};
$('btn-reset').onclick = () => {
  // Non cancella nulla finché non si preme "Inizia": "Torna alla partita" annulla.
  const h = state.free.headers;
  $('setup-white').value = h.White ?? '';
  $('setup-black').value = h.Black ?? '';
  $('setup-fen').value = '';
  state.setupDone = false;
  state.variation = null;
  render();
};
$('btn-export').onclick = () => {
  const pgn = gameToPgn(state.free);
  const url = URL.createObjectURL(new Blob([pgn + '\n'], { type: 'application/x-chess-pgn' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `ches54-${new Date().toISOString().slice(0, 10)}.pgn` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('PGN scaricato');
};
$('coach-on').addEventListener('change', (e) => {
  state.coach.on = e.target.checked;
  store.set('coach', state.coach.on ? '1' : '0');
  state.coachPick = null;
  refreshLive();
  renderCoach();
});
buildSegmented($('coach-level'), [{ label: 'Indizio', value: 'hint' }, { label: 'Soluzione', value: 'solution' }], state.coach.level, (v) => {
  state.coach.level = v;
  store.set('coachLevel', v);
  state.coachPick = null;
  renderCoach();
  renderLive();
});
$('btn-io').onclick = openIO;
$('btn-review-this').onclick = () => {
  if (!state.free.plies.length) return toast('Gioca almeno una mossa');
  $('pgn-text').value = gameToPgn(state.free);
  updateGameSelect();
  state.mode = 'review';
  state.section = 'review';
  store.set('mode', 'review');
  store.set('section', 'review');
  startReview();
};
$('io-close').onclick = () => $('dlg-io').close();
$('io-copy-fen').onclick = () => copyText($('io-fen').value);
$('io-copy-pgn').onclick = () => copyText(gameToPgn(state.free));
$('io-load').onclick = loadFromIO;

buildSegmented($('depth-control'), ENGINE_CONFIG.depthPresets.map((p) => ({ label: p.label, value: p.depth })), state.depth, (v) => {
  state.depth = v;
  store.set('depth', v);
  refreshLive();
});
buildSegmented($('lines-control'), ENGINE_CONFIG.multiPvOptions.map((n) => ({ label: `${n} ${n === 1 ? 'linea' : 'linee'}`, value: n })), state.multiPv, (v) => {
  state.multiPv = v;
  store.set('multipv', v);
  refreshLive();
});
buildSegmented($('review-depth'), UI_CONFIG.reviewDepthPresets.map((p) => ({ label: `${p.label} (${p.depth})`, value: p.depth })), state.reviewDepth, (v) => {
  state.reviewDepth = v;
  store.set('reviewDepth', v);
});

$('btn-about').onclick = () => {
  const a = UI_CONFIG.about;
  $('about-version').textContent = `versione ${a.version}`;
  $('about-copyright').textContent = a.copyright;
  const src = $('about-source');
  src.replaceChildren();
  if (a.sourceUrl) {
    const link = Object.assign(document.createElement('a'), { href: a.sourceUrl, textContent: a.sourceUrl, target: '_blank', rel: 'noopener' });
    src.append('; repository: ', link);
  }
  Object.assign($('about-sf-source'), { href: a.stockfishSourceUrl, textContent: a.stockfishSourceUrl });
  $('dlg-about').showModal();
};
$('btn-about-side').onclick = () => $('btn-about').click();
$('about-close').onclick = () => $('dlg-about').close();

$('btn-theme').onclick = () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  store.set('theme', next);
  applyTheme(next);
};

// ---------- avvio ----------
applyTheme(store.get('theme', 'dark'));
startEngine();
board.setOrientation(state.orientation);
restore();
if (state.mode === 'analysis' && state.setupDone) setOrientation(state.side);
render();
showSectionView();

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline non disponibile */ });
}
