// CHES54.ai – interfaccia: revisione della partita e analisi libera.
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
import { analyzeGame } from '../analysis/game-analyzer.js';
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
};
// Analisi "dal vivo" della posizione mostrata
const live = { fen: null, pending: true, result: null, highlighted: null };
let engine = null;
let engineFailed = false;
const bookPromise = loadOpeningBook().catch(() => null);

const cur = () => state.cursors[state.mode];
const setCur = (i) => { state.cursors[state.mode] = i; };
const reviewDone = () => state.mode === 'review' && state.review.status === 'done';
const EMPTY_GAME = createGame();
const currentGame = () => (state.mode === 'review' ? state.review.game ?? EMPTY_GAME : state.free);
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
    saveFree();
    setMode('analysis');
    toast('Variante: ora sei in analisi libera');
    return true;
  }
  const g = withMoveAt(state.free, cur(), move);
  if (!g) return false;
  state.free = g;
  setCur(g.plies.length);
  saveFree();
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

function setMode(mode) {
  if (state.retry) exitRetry(false);
  state.mode = mode;
  store.set('mode', mode);
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
  if (state.mode !== 'review' || !state.review.analysis) return null;
  return state.review.analysis.positions.find((p) => p.fen === fen) ?? null;
}

/** Avvia (se serve) l'analisi della posizione mostrata e aggiorna linee, frecce e barra. */
function requestLive() {
  const d = displayed();
  if (live.fen !== d.fen) {
    Object.assign(live, { fen: d.fen, pending: true, result: null, highlighted: null });
  }
  const busy = state.review.status === 'running' || state.retry?.phase === 'thinking'
    || state.retry?.phase === 'waiting' // durante "ritenta" le linee restano nascoste
    || (state.mode === 'review' && !reviewDone()); // nessuna partita caricata: niente da analizzare
  if (!live.pending || busy || engineFailed || !engine) return renderLive();
  live.pending = false;
  if (positionState(d.fen).over) {
    engine.cancelAll();
    return renderLive();
  }
  const stored = storedEval(d.fen);
  if (stored?.lines.length) live.result = { lines: stored.lines.slice(0, state.multiPv), depth: stored.depth, done: false, stored: true };
  engine.cancelAll();
  const fen = d.fen;
  engine.analyze(fen, { depth: state.depth, multiPv: state.multiPv, onUpdate: (r) => showLive(fen, r) })
    .then((r) => showLive(fen, r))
    .catch((err) => { if (!(err instanceof AnalysisCancelled)) onEngineError(); });
  renderLive();
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
  requestLive();
}

function renderTabs() {
  for (const b of document.querySelectorAll('.tabs [data-mode]')) {
    const on = b.dataset.mode === state.mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  }
}

function renderVisibility() {
  const rs = state.review.status;
  const inReview = state.mode === 'review';
  $('review-input').hidden = !(inReview && rs === 'empty');
  $('review-progress').hidden = !(inReview && rs === 'running');
  $('review-summary').hidden = !reviewDone() || !!state.retry;
  $('move-card').hidden = !reviewDone();
  $('graph-card').hidden = !reviewDone();
  $('move-form').hidden = inReview;
  $('input-error').hidden = inReview;
  $('analysis-tools').hidden = inReview;
  $('lines-card').hidden = inReview && rs !== 'done';
  $('moves-card').hidden = inReview && rs !== 'done';
  if (inReview && rs === 'running') renderProgress();
}

function renderBoard(animate) {
  const d = displayed();
  const c = new Chess(d.fen);
  let check = null;
  if (c.inCheck()) check = c.board().flat().find((p) => p && p.type === 'k' && p.color === c.turn())?.square ?? null;
  board.setPosition(c.board().flat().filter(Boolean), d.lastMove ? { from: d.lastMove.from, to: d.lastMove.to } : null, check, animate);
  let badge = null;
  if (state.retry?.attempt) {
    badge = { square: state.retry.attempt.ply.to, html: classIcon(state.retry.attempt.classification) };
  } else if (reviewDone() && !state.retry && cur() > 0) {
    const m = state.review.analysis.moves[cur() - 1];
    badge = { square: m.ply.to, html: classIcon(m.classification) };
  }
  board.setBadge(badge);
  if (reviewDone()) graph.setCursor(state.retry ? state.retry.index : cur());
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
    return COLOR_NAME[color];
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
  $('btn-undo').disabled = state.free.plies.length === 0;
}

function renderMoves() {
  const game = currentGame();
  renderMoveList($('movelist'), {
    game,
    moves: reviewDone() ? state.review.analysis.moves : null,
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

function renderReviewCards() {
  if (!reviewDone()) return;
  const a = state.review.analysis;
  if (!state.retry) {
    renderSummary($('review-summary'), a, retryCandidates(a).length);
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
  const info = CLASS_INFO[m.classification];
  let html = `<div class="mc-head">${classIcon(m.classification)}<div>
      <div class="mc-title">${moveLabel(m.ply)} <span class="cls-text cls-${m.classification}">${info.label}</span></div>
      <div class="mc-sub">Valutazione ${evalText(m.after)} · perdita ${fmt1(m.winLoss)} punti di win% · precisione ${Math.round(m.accuracy)}</div>
    </div></div>`;
  if (!m.isBest && m.bestSan && m.before.lines[0]) {
    html += `<p class="mc-best">Migliore: <b>${toItalian(m.bestSan)}</b> (${formatScore(m.before.lines[0].score)})
      <span class="mc-line">${numberedLine(m.ply.fenBefore, m.before.lines[0].pv, UI_CONFIG.lineMoves)}</span></p>`;
  }
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
    const reply = isError && att.after.lines[0]
      ? `<p class="mc-best">Il motore risponde: <span class="mc-line">${numberedLine(att.ply.fenAfter, att.after.lines[0].pv, UI_CONFIG.lineMoves)}</span></p>` : '';
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
  graph.setData(
    analysis.positions.map((p) => p.winPct),
    analysis.moves.map((m, i) => ({ index: i + 1, cls: m.classification })).filter((m) => GRAPH_MARKS.includes(m.cls)),
  );
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
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#ffffff' : '#14161b';
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
for (const b of document.querySelectorAll('.tabs [data-mode]')) b.onclick = () => setMode(b.dataset.mode);

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
$('btn-example').onclick = async () => {
  try {
    const res = await fetch(UI_CONFIG.examplePgnUrl);
    $('pgn-text').value = await res.text();
    updateGameSelect();
  } catch {
    showReviewError('Partita di esempio non disponibile offline.');
  }
};

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

$('btn-undo').onclick = () => {
  // Toglie l'ultima mossa della partita in analisi
  const n = state.free.plies.length;
  if (!n) return;
  state.free = truncateGame(state.free, n - 1);
  setCur(Math.min(cur(), n - 1));
  saveFree();
  render();
};
$('btn-reset').onclick = () => {
  state.free = createGame();
  setCur(0);
  saveFree();
  render();
};
$('btn-io').onclick = openIO;
$('btn-review-this').onclick = () => {
  if (!state.free.plies.length) return toast('Gioca almeno una mossa');
  $('pgn-text').value = gameToPgn(state.free);
  updateGameSelect();
  state.mode = 'review';
  store.set('mode', 'review');
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
render();

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline non disponibile */ });
}
