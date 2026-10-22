// Sezione "Problemi": scacchiera propria, filtri per tema e difficoltà, indizio, soluzione, statistiche.
// Le regole (soluzione giusta, matto alternativo all'ultima mossa) sono in src/analysis/puzzle.js; i problemi
// sono già verificati da Stockfish (scripts/build-puzzles.mjs). Il motore serve qui solo per mostrare la risposta
// a una mossa sbagliata.

import { Chess } from '../../lib/chess.js';
import { formatScore } from '../engine/score.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { UI_CONFIG } from '../config/ui.js';
import { puzzleStart, playUci, isCorrectAttempt, dailyIndex, previousDay } from '../analysis/puzzle.js';
import { Board } from './board.js';
import { toItalian, numberedLine } from './notation.js';
import { piecesOf, checkSquareOf, refutation } from './position.js';
import { reviewQueue, recordResult, isGoodAttempt, LEARNED_BOX } from '../analysis/my-mistakes.js';
import { judgeMove } from '../analysis/retry.js';
import { CLASS_INFO } from './classification.js';
import { t, fmtNum } from '../i18n/i18n.js';

const CFG = UI_CONFIG.puzzles;
// Etichette tradotte al momento dell'uso: la lingua si sceglie dopo il caricamento dei moduli
const colorName = (c) => t(c === 'w' ? 'Bianco' : 'Nero');
const themeLabel = (id) => t(CFG.themes.find((x) => x.id === id)?.label ?? id);
const levelLabel = (id) => t(CFG.levels.find((x) => x.id === id)?.label ?? id);
const HINT_ICON = '<svg viewBox="0 0 24 24" class="pz-hint-icon"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5v.5"/></svg>';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Data locale di oggi, 'AAAA-MM-GG'. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Valutazione a parole: i matti con il colore, i centipawn dal punto di vista del Bianco (come nel resto dell'app). */
const evalText = (score) => (score.mate != null
  ? t('il {color} dà matto in {n}', { color: colorName(score.mate > 0 ? 'w' : 'b'), n: Math.abs(score.mate) })
  : `${formatScore(score)} ${t('(+ vantaggio Bianco, − vantaggio Nero)')}`);

/** Esercizi "I tuoi errori" salvati in localStorage (vedi src/analysis/my-mistakes.js). */
export function loadMistakes(store) {
  try {
    const v = JSON.parse(store.get('myMistakes', '[]'));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveMistakes(store, list) {
  store.set('myMistakes', JSON.stringify(list));
}

export class PuzzleTrainer {
  /**
   * @param {HTMLElement} root vista #view-puzzles
   * @param {{ engine: () => import('../engine/engine.js').Engine|null, askPromotion: (color:string)=>Promise<string|null>,
   *   store: { get: (k:string, d:any)=>any, set: (k:string, v:any)=>void }, toast: (msg:string)=>void }} deps
   */
  constructor(root, deps) {
    this.root = root;
    this.deps = deps;
    this.$ = (sel) => root.querySelector(sel);
    this.data = null;
    this.loading = null;
    this.filter = { theme: deps.store.get('pzTheme', 'all'), level: deps.store.get('pzLevel', 'all') };
    this.stats = this.loadStats();
    this.p = null; // problema in corso: { puzzle, start, chess, step, status, failed, wrong, gen }
    this.board = new Board(this.$('#pz-board'), {
      canPick: (sq) => {
        if (!this.p || this.p.status !== 'play') return false;
        const piece = this.p.chess.get(sq);
        return !!piece && piece.color === this.p.chess.turn();
      },
      dests: (sq) => (this.p ? this.p.chess.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })) : []),
      onMove: (from, to) => this.onUserMove(from, to),
    });
    this.$('#pz-next').onclick = () => this.next();
    this.$('#pz-hint').onclick = () => this.hint();
    this.$('#pz-solution').onclick = () => this.showSolution();
    this.$('#pz-retry').onclick = () => this.retry();
    this.$('#pz-daily-btn').onclick = () => this.loadDaily();
    this.$('#pz-mine-btn').onclick = () => this.loadMine();
    this.buildFilters();
  }

  // ---------- dati e preferenze ----------
  /** @param {{ daily?: boolean }} [opts] daily: apri subito il problema del giorno (link ?daily=1) */
  async show(opts = {}) {
    if (this.p && !opts.daily) {
      this.renderStats(); // gli errori da ripassare possono essere cambiati (salvati da una revisione)
      return this.renderPanel();
    }
    if (!this.loading) {
      this.setStatus(t('Carico i problemi…'));
      this.loading = fetch(CFG.dataUrl)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((d) => { this.data = d; })
        .catch(() => { this.loading = null; });
    }
    await this.loading;
    if (!this.data) return this.setStatus(t('Non riesco a caricare i problemi. Controlla la connessione e riprova.'));
    this.renderStats();
    if (opts.daily) this.loadDaily();
    else this.next();
  }

  dailyPuzzle() {
    const list = this.data.puzzles.filter((p) => CFG.dailyLevels.includes(p.level));
    return list[dailyIndex(today(), list.length)];
  }

  loadDaily() {
    if (!this.data) return;
    this.load(this.dailyPuzzle(), { daily: true });
  }

  loadStats() {
    const empty = { solved: [], streak: 0, best: 0, tried: 0, firstTry: 0, dailyLast: null, dailyStreak: 0 };
    try {
      return { ...empty, ...JSON.parse(this.deps.store.get('pzStats', '{}')) };
    } catch {
      return empty;
    }
  }

  saveStats() {
    this.deps.store.set('pzStats', JSON.stringify(this.stats));
  }

  matching() {
    const { theme, level } = this.filter;
    return this.data.puzzles.filter((p) => (theme === 'all' || p.theme === theme) && (level === 'all' || p.level === level));
  }

  // ---------- filtri ----------
  buildFilters() {
    const chips = this.$('#pz-themes');
    for (const th of [{ id: 'all', label: 'Tutti' }, ...CFG.themes]) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: t(th.label) });
      b.dataset.id = th.id;
      b.onclick = () => this.setFilter('theme', th.id);
      chips.append(b);
    }
    const seg = this.$('#pz-levels');
    for (const l of [{ id: 'all', label: 'Tutte' }, ...CFG.levels]) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: t(l.label) });
      b.setAttribute('role', 'radio');
      b.dataset.id = l.id;
      b.onclick = () => this.setFilter('level', l.id);
      seg.append(b);
    }
    this.renderFilters();
  }

  setFilter(kind, id) {
    this.filter[kind] = id;
    this.deps.store.set(kind === 'theme' ? 'pzTheme' : 'pzLevel', id);
    this.renderFilters();
    this.next();
  }

  renderFilters() {
    for (const b of this.$('#pz-themes').children) b.classList.toggle('active', b.dataset.id === this.filter.theme);
    for (const b of this.$('#pz-levels').children) {
      const on = b.dataset.id === this.filter.level;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', String(on));
    }
    if (this.data) this.$('#pz-count').textContent = t('{n} problemi con questi filtri', { n: this.matching().length });
  }

  // ---------- svolgimento ----------
  /** Prossimo problema: prima quelli non ancora risolti, a caso tra quelli che rispettano i filtri. */
  next() {
    if (this.p?.kind === 'mine' && reviewQueue(loadMistakes(this.deps.store)).some((x) => x.id !== this.p.item.id)) return this.loadMine();
    if (!this.data) return;
    this.renderFilters();
    const list = this.matching();
    if (!list.length) {
      this.p = null;
      this.board.setPosition([], null, null, false);
      return this.setStatus(t('Nessun problema con questi filtri.'));
    }
    const solved = new Set(this.stats.solved);
    const fresh = list.filter((p) => !solved.has(p.id) && p.id !== this.p?.puzzle.id);
    const pool = fresh.length ? fresh : list;
    this.load(pool[Math.floor(Math.random() * pool.length)]);
  }

  /** Ripasso: il primo esercizio della coda (diverso da quello appena fatto). */
  loadMine() {
    const queue = reviewQueue(loadMistakes(this.deps.store));
    const item = queue.find((x) => x.id !== this.p?.item?.id) ?? queue[0];
    if (!item) {
      this.deps.toast(t('Niente da ripassare: salva gli errori dal riepilogo di una revisione'));
      return;
    }
    const chess = new Chess(item.fen);
    const color = chess.turn();
    this.p = {
      kind: 'mine', item, puzzle: null, chess, step: 0, status: 'play', failed: false, wrong: null, hinted: false,
      gen: (this.p?.gen ?? 0) + 1, start: { fen: item.fen, color, solution: [item.best], lastMove: null },
    };
    this.deps.engine()?.cancelAll();
    this.board.setOrientation(color);
    this.board.setArrows([]);
    this.board.setBadge(null);
    this.drawPosition(null, false);
    this.renderPanel();
  }

  /** Ripasso: la mossa migliore è giusta subito; un'altra la giudica Stockfish con le regole della revisione. */
  async onMineMove(uci, move) {
    const p = this.p;
    const { item } = p;
    const engine = this.deps.engine();
    p.judged = null;
    if (uci === item.best) return this.mineCorrect(uci, null);
    if (uci === item.played || !engine) return this.onWrong(item.fen, uci);
    p.status = 'judging';
    this.renderPanel();
    try {
      const judged = await judgeMove({ fenBefore: item.fen, before: item.before, prevPly: item.prevPly, settings: item.settings, move, engine });
      if (this.p !== p) return;
      if (isGoodAttempt(judged)) return this.mineCorrect(uci, judged);
      p.judged = judged;
      p.status = 'play';
      this.onWrong(item.fen, uci);
    } catch {
      if (this.p !== p) return;
      p.status = 'play';
      this.renderPanel();
    }
  }

  mineCorrect(uci, judged) {
    const p = this.p;
    p.judged = judged;
    this.drawPosition(playUci(p.chess, uci), true);
    p.step = 1;
    this.onSolved();
  }

  async load(puzzle, { daily = false } = {}) {
    const start = puzzleStart({ fen: puzzle.fen, moves: puzzle.moves.split(' ') });
    const gen = (this.p?.gen ?? 0) + 1;
    this.p = { kind: 'puzzle', puzzle, start, chess: new Chess(puzzle.fen), step: 0, status: 'intro', failed: false, wrong: null, gen, hinted: false, daily };
    this.deps.engine()?.cancelAll();
    this.board.setOrientation(start.color);
    this.board.setArrows([]);
    this.board.setBadge(null);
    this.drawPosition(null, false);
    this.renderPanel();
    // La prima mossa (dell'avversario) si gioca da sola, dopo un attimo
    await sleep(CFG.replyDelayMs);
    if (this.p?.gen !== gen) return;
    const m = playUci(this.p.chess, puzzle.moves.split(' ')[0]);
    this.drawPosition(m, true);
    this.p.status = 'play';
    this.renderPanel();
  }

  drawPosition(lastMove, animate) {
    const c = this.p.chess;
    this.board.setPosition(piecesOf(c), lastMove ? { from: lastMove.from, to: lastMove.to } : null, checkSquareOf(c), animate);
  }

  async onUserMove(from, to) {
    const p = this.p;
    if (!p || p.status !== 'play') return;
    const needsPromo = p.chess.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
    const promotion = needsPromo ? await this.deps.askPromotion(p.chess.turn()) : undefined;
    if (needsPromo && !promotion) return this.drawPosition(null, false);
    const uci = from + to + (promotion ?? '');
    if (p.kind === 'mine') return this.onMineMove(uci, { from, to, promotion });
    const expected = p.start.solution[p.step];
    const isFinal = p.step === p.start.solution.length - 1;
    const fenBefore = p.chess.fen();
    this.board.setBadge(null);
    if (!isCorrectAttempt(fenBefore, expected, uci, isFinal)) return this.onWrong(fenBefore, uci);

    const m = playUci(p.chess, uci);
    this.drawPosition(m, true);
    p.step++;
    if (p.step >= p.start.solution.length) return this.onSolved();
    p.status = 'reply';
    this.renderPanel('good');
    await sleep(CFG.replyDelayMs);
    if (this.p !== p) return;
    const r = playUci(p.chess, p.start.solution[p.step]);
    p.step++;
    this.drawPosition(r, true);
    p.status = 'play';
    this.renderPanel();
  }

  onSolved() {
    const p = this.p;
    p.status = 'solved';
    if (p.kind === 'mine') {
      // Ripasso: aggiorna la scatola dell'esercizio (le statistiche dei problemi non cambiano)
      if (!p.counted) {
        p.counted = true;
        const list = loadMistakes(this.deps.store).map((x) => (x.id === p.item.id ? recordResult(x, !p.failed) : x));
        saveMistakes(this.deps.store, list);
        p.item = list.find((x) => x.id === p.item.id) ?? p.item;
      }
      this.renderPanel();
      this.renderStats();
      return;
    }
    const s = this.stats;
    if (!p.counted) {
      p.counted = true;
      s.tried++;
      if (!p.failed) {
        s.firstTry++;
        s.streak++;
        s.best = Math.max(s.best, s.streak);
        if (!s.solved.includes(p.puzzle.id)) s.solved.push(p.puzzle.id);
      } else {
        s.streak = 0;
      }
      // Problema del giorno: conta come fatto anche con indizio o soluzione (come su Lichess)
      const day = today();
      if (p.daily && s.dailyLast !== day) {
        s.dailyStreak = s.dailyLast === previousDay(day) ? s.dailyStreak + 1 : 1;
        s.dailyLast = day;
      }
      this.saveStats();
    }
    this.renderPanel();
    this.renderStats();
  }

  /** Mossa sbagliata: resta sulla scacchiera, e il motore mostra come risponde l'avversario. */
  async onWrong(fenBefore, uci) {
    const p = this.p;
    this.markFailed();
    const c = new Chess(fenBefore);
    const m = playUci(c, uci);
    p.wrong = { fenBefore, fen: c.fen(), san: toItalian(m.san), reply: null };
    p.status = 'wrong';
    this.board.setPosition(piecesOf(c), { from: m.from, to: m.to }, checkSquareOf(c), true);
    this.renderPanel();
    const engine = this.deps.engine();
    if (!engine || c.isGameOver()) return;
    try {
      const reply = await refutation(engine, c.fen(), ANALYSIS_CONFIG.puzzles.refuteDepth);
      if (this.p !== p || p.status !== 'wrong' || !reply) return;
      p.wrong.reply = reply;
      this.board.setArrows([{ from: reply.move.slice(0, 2), to: reply.move.slice(2, 4), ...UI_CONFIG.coachThreatArrow }]);
      this.renderPanel();
    } catch { /* analisi annullata (cambio di problema o di sezione) */ }
  }

  markFailed() {
    const p = this.p;
    if (p.failed) return;
    p.failed = true;
    if (p.kind === 'puzzle' && this.stats.streak) { // il ripasso degli errori non tocca la serie dei problemi
      this.stats.streak = 0;
      this.saveStats();
      this.renderStats();
    }
  }

  retry() {
    const p = this.p;
    if (!p || p.status !== 'wrong') return;
    this.deps.engine()?.cancelAll();
    p.wrong = null;
    p.status = 'play';
    this.board.setArrows([]);
    this.drawPosition(null, true);
    this.renderPanel();
  }

  hint() {
    const p = this.p;
    if (!p || p.status !== 'play') return;
    this.markFailed();
    p.hinted = true;
    const from = p.start.solution[p.step].slice(0, 2);
    this.board.setBadge({ square: from, html: HINT_ICON });
    this.board.select(from);
    this.renderPanel();
  }

  async showSolution() {
    const p = this.p;
    if (!p || !['play', 'wrong'].includes(p.status)) return;
    this.deps.engine()?.cancelAll();
    this.markFailed();
    if (p.status === 'wrong') this.retry();
    p.status = 'showing';
    this.board.setArrows([]);
    this.board.setBadge(null);
    this.renderPanel();
    while (p.step < p.start.solution.length) {
      await sleep(CFG.replyDelayMs * 1.4);
      if (this.p !== p) return;
      const m = playUci(p.chess, p.start.solution[p.step]);
      p.step++;
      this.drawPosition(m, true);
    }
    this.onSolved();
  }

  /** Tastiera: → prossimo problema (dopo averlo risolto), H indizio. */
  onKey(e) {
    if (!this.p) return;
    if (e.key === 'ArrowRight' && this.p.status === 'solved') {
      e.preventDefault();
      this.next();
    } else if (e.key === 'h') {
      this.hint();
    }
  }

  // ---------- pannello ----------
  setStatus(text) {
    this.$('#pz-title').textContent = text;
    this.$('#pz-feedback').replaceChildren();
    this.$('#pz-meta').textContent = '';
    for (const id of ['#pz-hint', '#pz-solution', '#pz-retry']) this.$(id).hidden = true;
  }

  /** @param {'good'} [flash] */
  renderPanel(flash) {
    const p = this.p;
    if (!p) return;
    if (p.kind === 'mine') return this.renderMinePanel();
    const { puzzle, start } = p;
    const who = colorName(start.color);
    this.$('#pz-meta').textContent = `${p.daily ? `${t('Problema del giorno')} · ` : ''}${themeLabel(puzzle.theme)} · ${levelLabel(puzzle.level)} · ${t('punteggio')} ${puzzle.rating}`;
    const card = this.$('#pz-card');
    card.dataset.state = p.status === 'solved' ? (p.failed ? 'done' : 'solved') : p.status === 'wrong' ? 'wrong' : flash ?? '';
    const titles = {
      intro: t('Guarda la mossa dell\'avversario…'),
      play: t('Tocca al {color}: trova la mossa migliore', { color: who }),
      reply: t('Giusto! Continua…'),
      wrong: t('Non è la mossa giusta'),
      showing: t('Ecco la soluzione'),
      solved: p.failed ? t('Soluzione completata') : t('Risolto!'),
    };
    this.$('#pz-title').textContent = titles[p.status];
    const fb = this.$('#pz-feedback');
    fb.replaceChildren();
    const para = (text, cls) => fb.appendChild(Object.assign(document.createElement('p'), { textContent: text, className: cls ?? '' }));
    if (p.status === 'play' && p.hinted) para(t('Indizio: muovi il pezzo evidenziato.'), 'pz-note');
    if (p.status === 'wrong') {
      para(t('{move} non risolve il problema.', { move: p.wrong.san }));
      if (p.wrong.reply) {
        para(t('Stockfish risponde: {line} (valutazione {score}, profondità {depth}).', p.wrong.reply), 'pz-note');
      } else if (this.deps.engine()) {
        para(t('Stockfish cerca la risposta dell\'avversario…'), 'pz-note');
      }
    }
    if (p.status === 'solved') {
      const sol = numberedLine(start.fen, start.solution);
      para(`${t('Soluzione')}: ${sol}`);
      para(t('Stockfish all\'inizio: {eval} (profondità {depth}).', { eval: evalText(puzzle.eval), depth: this.data.verification.depth }), 'pz-note');
    }
    this.$('#pz-hint').hidden = p.status !== 'play' || p.hinted;
    this.$('#pz-solution').hidden = !['play', 'wrong'].includes(p.status);
    this.$('#pz-retry').hidden = p.status !== 'wrong';
    this.$('#pz-next').textContent = p.status === 'solved' ? t('Prossimo problema') : t('Salta');
    this.$('#pz-next').classList.toggle('primary', p.status === 'solved');
    const src = this.$('#pz-source');
    src.replaceChildren(
      `${t('Problema')} `,
      Object.assign(document.createElement('a'), { href: `https://lichess.org/training/${puzzle.id}`, textContent: `#${puzzle.id}`, target: '_blank', rel: 'noopener' }),
      ` ${t('dal database di Lichess (CC0), tema indicato da Lichess. Soluzione verificata da Stockfish.')} `,
      Object.assign(document.createElement('a'), { href: puzzle.url, textContent: t('Partita originale'), target: '_blank', rel: 'noopener' }),
    );
  }

  renderMinePanel() {
    const p = this.p;
    const { item } = p;
    const who = colorName(p.start.color);
    const card = this.$('#pz-card');
    card.dataset.state = p.status === 'solved' ? (p.failed ? 'done' : 'solved') : p.status === 'wrong' ? 'wrong' : '';
    const queue = reviewQueue(loadMistakes(this.deps.store));
    this.$('#pz-meta').textContent = `${t('I tuoi errori')} · ${t('{n} da ripassare', { n: queue.length })}`;
    const titles = {
      play: t('Tocca al {color}: trova una mossa migliore', { color: who }),
      judging: t('Stockfish valuta la mossa…'),
      wrong: t('Non ancora'),
      showing: t('Ecco la mossa migliore'),
      solved: p.failed ? t('Soluzione vista') : t('Risolto!'),
    };
    this.$('#pz-title').textContent = titles[p.status] ?? '';
    const fb = this.$('#pz-feedback');
    fb.replaceChildren();
    const para = (text, cls = '') => fb.appendChild(Object.assign(document.createElement('p'), { textContent: text, className: cls }));
    const moveNo = `${item.moveNumber}${p.start.color === 'w' ? '.' : '…'}`;
    para(t('Nella partita {game} hai giocato {move}: {cls}.', { game: item.label, move: `${moveNo} ${toItalian(item.playedSan)}`, cls: CLASS_INFO[item.classification].label }), 'pz-note');
    if (p.status === 'play' && p.hinted) para(t('Indizio: muovi il pezzo evidenziato.'), 'pz-note');
    if (p.status === 'wrong') {
      if (p.wrong.fenBefore && p.wrong.san === toItalian(item.playedSan)) para(t('È la stessa mossa della partita.'));
      else if (p.judged) para(t('{move}: {cls} secondo Stockfish (perdita {loss} punti di win%).', { move: p.wrong.san, cls: CLASS_INFO[p.judged.classification].label, loss: fmtNum(p.judged.winLoss) }));
      else para(t('{move} non è la mossa migliore.', { move: p.wrong.san }));
      if (p.wrong.reply) para(t('Stockfish risponde: {line} (valutazione {score}).', p.wrong.reply), 'pz-note');
    }
    if (p.status === 'solved') {
      if (p.judged) para(t('Buona mossa: {cls} secondo Stockfish.', { cls: CLASS_INFO[p.judged.classification].label }));
      const best = item.before.lines[0];
      para(`${t('Mossa migliore')}: ${toItalian(item.bestSan)} (${formatScore(best.score)}) · ${numberedLine(item.fen, best.pv, 6)}`, 'pz-note');
      if (!p.failed) {
        para(item.box >= LEARNED_BOX ? t('Imparato! Questo esercizio esce dal ripasso.') : t('Risposte giuste di fila: {n} di {max}.', { n: item.box, max: LEARNED_BOX }), 'pz-note');
      }
    }
    this.$('#pz-hint').hidden = p.status !== 'play' || p.hinted;
    this.$('#pz-solution').hidden = !['play', 'wrong'].includes(p.status);
    this.$('#pz-retry').hidden = p.status !== 'wrong';
    const more = queue.some((x) => x.id !== item.id);
    this.$('#pz-next').textContent = more ? (p.status === 'solved' ? t('Prossimo errore') : t('Salta')) : t('Torna ai problemi');
    this.$('#pz-next').classList.toggle('primary', p.status === 'solved');
    this.$('#pz-source').textContent = t('Esercizio dalla tua partita {game}, revisione di Stockfish a profondità {depth}. Una mossa è giusta se, con le regole della revisione, non è un\'imprecisione né un errore.', { game: item.label, depth: item.settings?.depth ?? '' });
  }

  renderStats() {
    const s = this.stats;
    const all = loadMistakes(this.deps.store);
    const queue = reviewQueue(all);
    const learned = all.length - queue.length;
    this.$('#pz-mine-sub').textContent = all.length
      ? `${t('{n} da ripassare', { n: queue.length })}${learned ? ` · ${t('{n} imparati', { n: learned })}` : ''}`
      : t('Salvali dal riepilogo di una revisione');
    this.$('#pz-mine-btn').disabled = !queue.length;
    const day = today();
    const doneToday = s.dailyLast === day;
    const alive = doneToday || s.dailyLast === previousDay(day); // serie ancora valida
    this.$('#pz-daily').classList.toggle('done', doneToday);
    this.$('#pz-daily-title').textContent = doneToday ? t('Problema del giorno: fatto!') : t('Problema del giorno');
    this.$('#pz-daily-sub').textContent = alive && s.dailyStreak
      ? t(s.dailyStreak === 1 ? '{n} giorno di fila' : '{n} giorni di fila', { n: s.dailyStreak })
      : t('Uno nuovo ogni giorno, uguale per tutti');
    this.$('#pz-daily-btn').textContent = doneToday ? t('Rivedi') : t('Risolvi');
    const set = (id, v) => { this.$(id).textContent = v; };
    set('#pz-streak', s.streak);
    set('#pz-best', s.best);
    set('#pz-solved', s.solved.length);
    set('#pz-rate', s.tried ? `${Math.round((s.firstTry / s.tried) * 100)}%` : '–');
  }
}
