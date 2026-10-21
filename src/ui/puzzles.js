// Sezione "Problemi": scacchiera propria, filtri per tema e difficoltà, indizio, soluzione, statistiche.
// Le regole (soluzione giusta, matto alternativo all'ultima mossa) sono in src/analysis/puzzle.js; i problemi
// sono già verificati da Stockfish (scripts/build-puzzles.mjs). Il motore serve qui solo per mostrare la risposta
// a una mossa sbagliata.

import { Chess } from '../../lib/chess.js';
import { formatScore } from '../engine/score.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { UI_CONFIG } from '../config/ui.js';
import { puzzleStart, playUci, isCorrectAttempt } from '../analysis/puzzle.js';
import { Board } from './board.js';
import { toItalian, numberedLine } from './notation.js';
import { piecesOf, checkSquareOf, refutation } from './position.js';

const CFG = UI_CONFIG.puzzles;
const COLOR_NAME = { w: 'Bianco', b: 'Nero' };
const THEME_LABEL = Object.fromEntries(CFG.themes.map((t) => [t.id, t.label]));
const LEVEL_LABEL = Object.fromEntries(CFG.levels.map((l) => [l.id, l.label]));
const HINT_ICON = '<svg viewBox="0 0 24 24" class="pz-hint-icon"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5v.5"/></svg>';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Valutazione a parole: i matti con il colore, i centipawn dal punto di vista del Bianco (come nel resto dell'app). */
const evalText = (score) => (score.mate != null
  ? `il ${COLOR_NAME[score.mate > 0 ? 'w' : 'b']} dà matto in ${Math.abs(score.mate)}`
  : `${formatScore(score)} (+ vantaggio Bianco, − vantaggio Nero)`);

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
    this.buildFilters();
  }

  // ---------- dati e preferenze ----------
  async show() {
    if (this.p) return this.renderPanel();
    if (!this.loading) {
      this.setStatus('Carico i problemi…');
      this.loading = fetch(CFG.dataUrl)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((d) => { this.data = d; })
        .catch(() => { this.loading = null; });
    }
    await this.loading;
    if (!this.data) return this.setStatus('Non riesco a caricare i problemi. Controlla la connessione e riprova.');
    this.renderStats();
    this.next();
  }

  loadStats() {
    const empty = { solved: [], streak: 0, best: 0, tried: 0, firstTry: 0 };
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
    for (const t of [{ id: 'all', label: 'Tutti' }, ...CFG.themes]) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: t.label });
      b.dataset.id = t.id;
      b.onclick = () => this.setFilter('theme', t.id);
      chips.append(b);
    }
    const seg = this.$('#pz-levels');
    for (const l of [{ id: 'all', label: 'Tutte' }, ...CFG.levels]) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: l.label });
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
    if (this.data) this.$('#pz-count').textContent = `${this.matching().length} problemi con questi filtri`;
  }

  // ---------- svolgimento ----------
  /** Prossimo problema: prima quelli non ancora risolti, a caso tra quelli che rispettano i filtri. */
  next() {
    if (!this.data) return;
    this.renderFilters();
    const list = this.matching();
    if (!list.length) {
      this.p = null;
      this.board.setPosition([], null, null, false);
      return this.setStatus('Nessun problema con questi filtri.');
    }
    const solved = new Set(this.stats.solved);
    const fresh = list.filter((p) => !solved.has(p.id) && p.id !== this.p?.puzzle.id);
    const pool = fresh.length ? fresh : list;
    this.load(pool[Math.floor(Math.random() * pool.length)]);
  }

  async load(puzzle) {
    const start = puzzleStart({ fen: puzzle.fen, moves: puzzle.moves.split(' ') });
    const gen = (this.p?.gen ?? 0) + 1;
    this.p = { puzzle, start, chess: new Chess(puzzle.fen), step: 0, status: 'intro', failed: false, wrong: null, gen, hinted: false };
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
    if (this.stats.streak) {
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
    const { puzzle, start } = p;
    const who = COLOR_NAME[start.color];
    this.$('#pz-meta').textContent = `${THEME_LABEL[puzzle.theme]} · ${LEVEL_LABEL[puzzle.level]} · punteggio ${puzzle.rating}`;
    const card = this.$('#pz-card');
    card.dataset.state = p.status === 'solved' ? (p.failed ? 'done' : 'solved') : p.status === 'wrong' ? 'wrong' : flash ?? '';
    const titles = {
      intro: 'Guarda la mossa dell\'avversario…',
      play: `Tocca al ${who}: trova la mossa migliore`,
      reply: 'Giusto! Continua…',
      wrong: 'Non è la mossa giusta',
      showing: 'Ecco la soluzione',
      solved: p.failed ? 'Soluzione completata' : 'Risolto!',
    };
    this.$('#pz-title').textContent = titles[p.status];
    const fb = this.$('#pz-feedback');
    fb.replaceChildren();
    const para = (text, cls) => fb.appendChild(Object.assign(document.createElement('p'), { textContent: text, className: cls ?? '' }));
    if (p.status === 'play' && p.hinted) para('Indizio: muovi il pezzo evidenziato.', 'pz-note');
    if (p.status === 'wrong') {
      para(`${p.wrong.san} non risolve il problema.`);
      if (p.wrong.reply) {
        para(`Stockfish risponde: ${p.wrong.reply.line} (valutazione ${p.wrong.reply.score}, profondità ${p.wrong.reply.depth}).`, 'pz-note');
      } else if (this.deps.engine()) {
        para('Stockfish cerca la risposta dell\'avversario…', 'pz-note');
      }
    }
    if (p.status === 'solved') {
      const sol = numberedLine(start.fen, start.solution);
      para(`Soluzione: ${sol}`);
      para(`Stockfish all'inizio: ${evalText(puzzle.eval)} (profondità ${this.data.verification.depth}).`, 'pz-note');
    }
    this.$('#pz-hint').hidden = p.status !== 'play' || p.hinted;
    this.$('#pz-solution').hidden = !['play', 'wrong'].includes(p.status);
    this.$('#pz-retry').hidden = p.status !== 'wrong';
    this.$('#pz-next').textContent = p.status === 'solved' ? 'Prossimo problema' : 'Salta';
    this.$('#pz-next').classList.toggle('primary', p.status === 'solved');
    const src = this.$('#pz-source');
    src.replaceChildren(
      'Problema ',
      Object.assign(document.createElement('a'), { href: `https://lichess.org/training/${puzzle.id}`, textContent: `#${puzzle.id}`, target: '_blank', rel: 'noopener' }),
      ' dal database di Lichess (CC0), tema indicato da Lichess. Soluzione verificata da Stockfish. ',
      Object.assign(document.createElement('a'), { href: puzzle.url, textContent: 'Partita originale', target: '_blank', rel: 'noopener' }),
    );
  }

  renderStats() {
    const s = this.stats;
    const set = (id, v) => { this.$(id).textContent = v; };
    set('#pz-streak', s.streak);
    set('#pz-best', s.best);
    set('#pz-solved', s.solved.length);
    set('#pz-rate', s.tried ? `${Math.round((s.firstTry / s.tried) * 100)}%` : '–');
  }
}
