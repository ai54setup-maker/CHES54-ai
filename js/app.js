// CHES54.ai – logica principale dell'app.

import { Chess, validateFen } from '../lib/chess.js';
import { Board } from './board.js';
import { Engine, AnalysisCancelled } from '../src/engine/engine.js';
import { ENGINE_CONFIG } from '../src/config/engine.js';
import { toPov } from '../src/engine/score.js';
import { winPercent } from '../src/analysis/winpct.js';
import { toItalian, uciLineToSan, parseUserMove } from './notation.js';

const ARROW_STYLE = [
  { color: '#22c55e', width: 0.2, opacity: 0.92 },
  { color: '#60a5fa', width: 0.13, opacity: 0.7 },
  { color: '#60a5fa', width: 0.11, opacity: 0.55 },
  { color: '#60a5fa', width: 0.1, opacity: 0.42 },
  { color: '#60a5fa', width: 0.09, opacity: 0.35 },
];
const COLOR_NAME = { w: 'Bianco', b: 'Nero' };

const $ = (id) => document.getElementById(id);

// ---------- preferenze (facoltative: l'app funziona anche senza localStorage) ----------
const store = {
  get(k, d) { try { return localStorage.getItem('ches54:' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ches54:' + k, v); } catch { /* ignora */ } },
};

// ---------- stato ----------
const chess = new Chess();
let myColor = 'w';
const DEPTHS = ENGINE_CONFIG.depthPresets.map((p) => p.depth);
let depth = Number(store.get('depth', ENGINE_CONFIG.defaultDepth));
if (!DEPTHS.includes(depth)) depth = ENGINE_CONFIG.defaultDepth;
let multiPv = Number(store.get('multipv', ENGINE_CONFIG.multiPv));
if (!ENGINE_CONFIG.multiPvOptions.includes(multiPv)) multiPv = ENGINE_CONFIG.multiPv;
let lines = [];          // linee del motore per la posizione attuale
let highlighted = null;  // indice della mossa suggerita evidenziata
let engine = null;
let engineFailed = false;
let lastResult = null;   // ultimo risultato del motore (per profondità e cache)

// ---------- scacchiera ----------
const board = new Board($('board'), {
  canPick: (sq) => {
    if (chess.isGameOver()) return false;
    const p = chess.get(sq);
    return !!p && p.color === chess.turn();
  },
  dests: (sq) => chess.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })),
  onMove: async (from, to) => {
    const needsPromo = chess.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
    const promotion = needsPromo ? await askPromotion(chess.turn()) : undefined;
    if (needsPromo && !promotion) return refresh(false);
    play({ from, to, promotion });
  },
});

// ---------- motore ----------
function startEngine() {
  try {
    engine = Engine.inWorker();
    engine.ready.catch(onEngineError);
  } catch {
    engineFailed = true;
  }
}

function onEngineError() {
  engineFailed = true;
  renderSuggestions();
}

function analyze() {
  lines = [];
  lastResult = null;
  highlighted = null;
  board.setArrows([]);
  engine?.cancelAll();
  if (!engine || chess.isGameOver()) {
    renderSuggestions();
    updateEvalBar();
    return;
  }
  renderSuggestions(true);
  const fen = chess.fen();
  engine.analyze(fen, { depth, multiPv, onUpdate: (r) => showAnalysis(fen, r) })
    .then((r) => showAnalysis(fen, r))
    .catch((err) => { if (!(err instanceof AnalysisCancelled)) onEngineError(); });
}

function showAnalysis(fen, result) {
  if (fen !== chess.fen()) return; // risultato di una posizione vecchia
  lines = result.lines;
  lastResult = result;
  renderSuggestions(false, result.done);
  updateArrows();
  updateEvalBar();
}

// ---------- mosse ----------
function play(move) {
  try {
    chess.move(move);
  } catch {
    showInputError('Mossa non valida in questa posizione.');
    return false;
  }
  showInputError('');
  refresh(true);
  return true;
}

function refresh(animate) {
  const history = chess.history({ verbose: true });
  const last = history.at(-1);
  let check = null;
  if (chess.inCheck()) {
    check = chess.board().flat().find((p) => p && p.type === 'k' && p.color === chess.turn())?.square ?? null;
  }
  const position = chess.board().flat().filter(Boolean);
  board.setPosition(position, last ? { from: last.from, to: last.to } : null, check, animate);
  renderStatus();
  renderHistory();
  analyze();
  saveGame();
}

// ---------- rendering ----------
function scoreForMe(l) {
  // Il motore dà punteggi dal punto di vista del Bianco: li giro verso l'utente.
  return toPov(l.score, myColor);
}

function formatScore({ cp, mate }) {
  if (mate != null) return mate > 0 ? `Matto in ${mate}` : `Subisci matto in ${-mate}`;
  const v = cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

function renderStatus() {
  const el = $('status');
  el.className = 'status';
  const turn = chess.turn();
  const mine = turn === myColor;
  let text;
  if (chess.isCheckmate()) {
    text = `Scacco matto! Vince il ${COLOR_NAME[turn === 'w' ? 'b' : 'w']}.`;
    el.classList.add('over');
  } else if (chess.isStalemate()) {
    text = 'Stallo: la partita è patta.';
    el.classList.add('over');
  } else if (chess.isThreefoldRepetition()) {
    text = 'Patta per triplice ripetizione.';
    el.classList.add('over');
  } else if (chess.isInsufficientMaterial()) {
    text = 'Patta: materiale insufficiente.';
    el.classList.add('over');
  } else if (chess.isDraw()) {
    text = 'Patta (regola delle 50 mosse).';
    el.classList.add('over');
  } else {
    text = mine
      ? `Tocca a te (${COLOR_NAME[turn]})${chess.inCheck() ? ' – sei sotto scacco!' : ''}`
      : `Tocca all'avversario (${COLOR_NAME[turn]}): inserisci la sua mossa`;
    if (mine) el.classList.add('mine');
  }
  el.textContent = text;

  $('suggest-title').textContent = mine ? 'Le tue mosse migliori' : `Mosse migliori dell'avversario`;

  const top = myColor === 'w' ? 'b' : 'w';
  $('tag-top').textContent = `${COLOR_NAME[top]} · Avversario`;
  $('tag-bottom').textContent = `${COLOR_NAME[myColor]} · Tu`;
  $('tag-top').classList.toggle('to-move', turn === top && !chess.isGameOver());
  $('tag-bottom').classList.toggle('to-move', turn === myColor && !chess.isGameOver());
  // se l'utente ha girato la scacchiera, scambia le etichette
  if (board.orientation !== myColor) {
    const a = $('tag-top'), b = $('tag-bottom');
    [a.textContent, b.textContent] = [b.textContent, a.textContent];
    const t = a.classList.contains('to-move');
    a.classList.toggle('to-move', b.classList.contains('to-move'));
    b.classList.toggle('to-move', t);
  }
  $('btn-undo').disabled = chess.history().length === 0;
}

function renderSuggestions(loading = false, done = false) {
  const ol = $('suggestions');
  const info = $('depth-info');
  ol.replaceChildren();

  if (engineFailed) {
    ol.innerHTML = '<li class="sugg placeholder">Il motore non si è avviato. Apri l\'app tramite il server locale (vedi README) e non facendo doppio clic su index.html.</li>';
    info.textContent = '';
    return;
  }
  if (chess.isGameOver()) {
    ol.innerHTML = '<li class="sugg placeholder">Partita terminata. Premi «Nuova partita» o «Annulla».</li>';
    info.textContent = '';
    return;
  }
  if (loading || !lines.length) {
    ol.innerHTML = '<li class="sugg placeholder">Analisi in corso…</li>';
    info.textContent = engine?.isReady ? '' : 'avvio motore…';
    return;
  }

  info.textContent = `profondità ${lastResult.depth}/${depth}${done ? ' ✓' : '…'}${lastResult.fromCache ? ' · cache' : ''}`;
  const fen = chess.fen();
  lines.forEach((l, i) => {
    const score = scoreForMe(l);
    const san = uciLineToSan(fen, l.pv, 5);
    if (!san.length) return;
    const li = document.createElement('li');
    li.className = 'sugg' + (i === 0 ? ' best' : '') + (i === highlighted ? ' hl' : '');
    const pos = score.mate != null ? score.mate > 0 : score.cp > 0;
    const neg = score.mate != null ? score.mate < 0 : score.cp < 0;
    li.innerHTML = `
      <span class="sugg-rank">${i === 0 ? '⭐' : i + 1}</span>
      <span class="sugg-move"></span>
      <span class="sugg-score ${pos ? 'pos' : neg ? 'neg' : ''}"></span>
      <span class="sugg-line"></span>`;
    li.querySelector('.sugg-move').textContent = san[0];
    li.querySelector('.sugg-score').textContent = formatScore(score);
    li.querySelector('.sugg-line').textContent = 'Linea: ' + san.join(' ');
    li.addEventListener('click', () => {
      const u = l.pv[0];
      play({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    });
    li.addEventListener('pointerenter', () => { highlighted = i; updateArrows(); markHighlighted(); });
    li.addEventListener('pointerleave', () => { highlighted = null; updateArrows(); markHighlighted(); });
    ol.append(li);
  });
}

function markHighlighted() {
  [...$('suggestions').children].forEach((li, i) => li.classList.toggle('hl', i === highlighted));
}

function updateArrows() {
  const arrows = lines.map((l, i) => {
    const u = l.pv[0];
    const style = ARROW_STYLE[Math.min(i, ARROW_STYLE.length - 1)];
    const hl = highlighted === i;
    return {
      from: u.slice(0, 2),
      to: u.slice(2, 4),
      color: hl && i > 0 ? '#f59e0b' : style.color,
      width: hl ? Math.max(style.width, 0.17) : style.width,
      opacity: hl ? 0.95 : highlighted != null && i !== 0 ? 0.2 : style.opacity,
    };
  });
  board.setArrows(arrows);
}

function updateEvalBar() {
  const bar = $('evalbar');
  const fill = $('evalbar-fill');
  const label = $('evalbar-label');
  // La parte chiara/scura in basso corrisponde al colore in basso sulla scacchiera.
  bar.classList.toggle('flipped', board.orientation === 'b');
  let whitePct = 50;
  let text = '0.0';
  if (chess.isCheckmate()) {
    whitePct = chess.turn() === 'w' ? 0 : 100;
    text = '#';
  } else if (lines.length) {
    const score = lines[0].score; // punto di vista del Bianco
    whitePct = winPercent(score);
    const mine = toPov(score, myColor);
    text = mine.mate != null
      ? 'M' + Math.abs(mine.mate)
      : (Math.round(mine.cp / 10) / 10 || 0).toFixed(1); // evita "-0.0"
  }
  const bottomIsWhite = board.orientation === 'w';
  fill.style.height = (bottomIsWhite ? whitePct : 100 - whitePct) + '%';
  label.textContent = text;
}

function renderHistory() {
  const ol = $('history');
  ol.replaceChildren();
  const moves = chess.history();
  // Se la partita parte da un FEN, numerazione e colore iniziale vengono da lì.
  const startFen = chess.getHeaders().FEN || new Chess().fen();
  const [, startTurn, , , , startMove] = startFen.split(' ');
  const startNo = Number(startMove) || 1;
  const list = startTurn === 'b' ? ['…', ...moves] : moves;
  for (let i = 0; i < list.length; i += 2) {
    const li = document.createElement('li');
    const isLast = (j) => j === list.length - 1;
    li.innerHTML = `<span class="num">${startNo + i / 2}.</span><span></span><span></span>`;
    li.children[1].textContent = list[i] === '…' ? '…' : toItalian(list[i]);
    li.children[1].classList.toggle('last', isLast(i));
    if (list[i + 1]) {
      li.children[2].textContent = toItalian(list[i + 1]);
      li.children[2].classList.toggle('last', isLast(i + 1));
    }
    ol.append(li);
  }
  ol.scrollTop = ol.scrollHeight;
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

function chooseColor() {
  const dlg = $('dlg-color');
  dlg.querySelectorAll('[data-color]').forEach((btn) => {
    btn.onclick = () => {
      dlg.close();
      newGame(btn.dataset.color);
    };
  });
  dlg.addEventListener('cancel', (e) => e.preventDefault(), { once: true });
  dlg.showModal();
}

function newGame(color) {
  myColor = color;
  store.set('color', color);
  chess.reset();
  board.setOrientation(color);
  refresh(false);
}

function openIO() {
  const dlg = $('dlg-io');
  $('io-fen').value = chess.fen();
  $('io-pgn').value = pgnWithHeader();
  $('io-error').textContent = '';
  dlg.showModal();
}

function pgnWithHeader() {
  const c = new Chess();
  try { c.loadPgn(chess.pgn()); } catch { /* ignora */ }
  c.setHeader('Event', 'Analisi CHES54.ai');
  c.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
  c.setHeader(myColor === 'w' ? 'White' : 'Black', 'Io');
  return c.pgn();
}

function loadFromIO() {
  const fenTxt = $('io-fen').value.trim();
  const pgnTxt = $('io-pgn').value.trim();
  const err = $('io-error');
  // Prova prima il PGN se è stato modificato, altrimenti il FEN
  const pgnChanged = pgnTxt && pgnTxt !== pgnWithHeader().trim();
  if (pgnChanged) {
    try {
      chess.loadPgn(pgnTxt);
      $('dlg-io').close();
      refresh(false);
      toast('Partita caricata');
      return;
    } catch {
      err.textContent = 'PGN non valido.';
      return;
    }
  }
  const v = validateFen(fenTxt);
  if (!v.ok) {
    err.textContent = 'FEN non valido: ' + v.error;
    return;
  }
  chess.load(fenTxt);
  $('dlg-io').close();
  refresh(false);
  toast('Posizione caricata');
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
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function showInputError(msg) {
  $('input-error').textContent = msg;
}

// ---------- salvataggio partita ----------
function saveGame() {
  store.set('pgn', chess.pgn());
  store.set('fen0', chess.history().length ? '' : chess.fen());
}

function restoreGame() {
  const pgn = store.get('pgn', '');
  const fen0 = store.get('fen0', '');
  try {
    if (pgn && pgn.includes('.')) chess.loadPgn(pgn);
    else if (fen0) chess.load(fen0);
  } catch {
    chess.reset();
  }
}

// ---------- tema ----------
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#ffffff' : '#14161b';
}

// ---------- eventi ----------
$('move-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('move-text');
  if (chess.isGameOver()) return showInputError('La partita è terminata.');
  const mv = parseUserMove(chess, input.value);
  if (!mv) {
    showInputError(`"${input.value}" non è una mossa legale per il ${COLOR_NAME[chess.turn()]}. Esempi: d3, e5, Cf3, O-O, d2d3.`);
    return;
  }
  if (play(mv)) input.value = '';
});
$('move-text').addEventListener('input', () => showInputError(''));

$('btn-undo').onclick = () => {
  chess.undo();
  refresh(false);
};
$('btn-flip').onclick = () => {
  board.setOrientation(board.orientation === 'w' ? 'b' : 'w');
  renderStatus();
  updateArrows();
  updateEvalBar();
};
$('btn-new').onclick = () => chooseColor();
$('btn-io').onclick = openIO;
$('io-close').onclick = () => $('dlg-io').close();
$('io-copy-fen').onclick = () => copyText(chess.fen());
$('io-copy-pgn').onclick = () => copyText(pgnWithHeader());
$('io-load').onclick = loadFromIO;

// Pulsanti di profondità e numero di linee, generati dalla configurazione del motore.
function buildSegmented(el, options, current, onPick) {
  el.replaceChildren();
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt.label;
    b.classList.toggle('active', opt.value === current);
    b.onclick = () => {
      [...el.children].forEach((x) => x.classList.toggle('active', x === b));
      onPick(opt.value);
      analyze();
    };
    el.append(b);
  }
}
buildSegmented($('depth-control'), ENGINE_CONFIG.depthPresets.map((p) => ({ label: p.label, value: p.depth })), depth, (v) => {
  depth = v;
  store.set('depth', v);
});
buildSegmented($('lines-control'), ENGINE_CONFIG.multiPvOptions.map((n) => ({ label: `${n} ${n === 1 ? 'linea' : 'linee'}`, value: n })), multiPv, (v) => {
  multiPv = v;
  store.set('multipv', v);
});

$('btn-theme').onclick = () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  store.set('theme', next);
  applyTheme(next);
};

// ---------- avvio ----------
applyTheme(store.get('theme', 'dark'));
startEngine();

const savedColor = store.get('color', null);
if (savedColor) {
  myColor = savedColor;
  restoreGame();
  board.setOrientation(myColor);
  refresh(false);
} else {
  board.setOrientation('w');
  refresh(false);
  chooseColor();
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline non disponibile */ });
}
