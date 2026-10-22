// Sezione "Lezioni": indice per categoria e lezione passo per passo (spiegazioni con dimostrazione, esercizi).
// Contenuti in data/lessons/lessons.json, verificati da scripts/check-lessons.mjs (regole in src/analysis/lesson.js).
// Il motore serve solo a mostrare la risposta a una mossa sbagliata, come nei Problemi.

import { Chess } from '../../lib/chess.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { UI_CONFIG } from '../config/ui.js';
import { playUci } from '../analysis/puzzle.js';
import { isCorrectLessonMove } from '../analysis/lesson.js';
import { Board } from './board.js';
import { toItalian } from './notation.js';
import { piecesOf, checkSquareOf, refutation } from './position.js';
import { t, getLang } from '../i18n/i18n.js';

const CFG = UI_CONFIG.lessons;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};

/** Sostituisce i testi delle lezioni con quelli tradotti (dove presenti). */
export function applyTranslation(data, tr) {
  if (!tr) return;
  for (const c of data.categories) c.label = tr.categories?.[c.id] ?? c.label;
  for (const l of data.lessons) {
    const x = tr.lessons?.[l.id];
    if (!x) continue;
    l.title = x.title ?? l.title;
    l.summary = x.summary ?? l.summary;
    l.steps.forEach((s, i) => Object.assign(s, x.steps?.[i] ?? {}));
  }
}

export class LessonPlayer {
  /**
   * @param {HTMLElement} root vista #view-lessons
   * @param {{ engine: () => import('../engine/engine.js').Engine|null, askPromotion: (color:string)=>Promise<string|null>,
   *   store: { get: (k:string, d:any)=>any, set: (k:string, v:any)=>void } }} deps
   */
  constructor(root, deps) {
    this.root = root;
    this.deps = deps;
    this.$ = (sel) => root.querySelector(sel);
    this.data = null;
    this.loading = null;
    this.done = this.loadDone();
    this.s = null; // { lesson, index, step, chess, status, sol, wrong, gen, orientation }
    this.board = new Board(this.$('#ls-board'), {
      canPick: (sq) => {
        if (!this.s || this.s.status !== 'play') return false;
        const p = this.s.chess.get(sq);
        return !!p && p.color === this.s.chess.turn();
      },
      dests: (sq) => (this.s ? this.s.chess.moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })) : []),
      onMove: (from, to) => this.onUserMove(from, to),
    });
    this.$('#ls-back').onclick = () => this.showIndex();
    this.$('#ls-prev').onclick = () => this.go(this.s.index - 1);
    this.$('#ls-next').onclick = () => this.next();
    this.$('#ls-demo').onclick = () => this.playDemo();
    this.$('#ls-retry').onclick = () => this.retry();
    this.$('#ls-solution').onclick = () => this.showSolution();
  }

  async show() {
    if (!this.loading) {
      this.loading = fetch(CFG.dataUrl)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(async (d) => {
          // In inglese: testi da lessons.en.json (stesse lezioni e passi; posizioni e verifica restano in lessons.json)
          if (getLang() === 'en') applyTranslation(d, await fetch(CFG.dataEnUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null));
          this.data = d;
        })
        .catch(() => { this.loading = null; });
    }
    await this.loading;
    if (!this.data) {
      this.$('#ls-groups').replaceChildren(el('p', { className: 'hint', textContent: t('Non riesco a caricare le lezioni. Controlla la connessione e riprova.') }));
      return;
    }
    if (!this.s) this.showIndex();
  }

  loadDone() {
    try {
      const v = JSON.parse(this.deps.store.get('lessonsDone', '[]'));
      return new Set(Array.isArray(v) ? v : []);
    } catch {
      return new Set();
    }
  }

  // ---------- indice ----------
  showIndex() {
    this.deps.engine()?.cancelAll();
    this.s = null;
    this.$('#ls-index').hidden = false;
    this.$('#ls-player').hidden = true;
    const total = this.data.lessons.length;
    const done = this.data.lessons.filter((l) => this.done.has(l.id)).length;
    this.$('#ls-progress-text').textContent = t('{done} di {total} lezioni completate', { done, total });
    this.$('#ls-progress-fill').style.width = `${(done / total) * 100}%`;
    const groups = this.data.categories.map((cat) => {
      const lessons = this.data.lessons.filter((l) => l.category === cat.id);
      return el('section', { className: 'ls-group' },
        el('h2', { textContent: cat.label }),
        el('div', { className: 'ls-grid' }, ...lessons.map((l) => {
          const exercises = l.steps.filter((s) => s.kind === 'exercise').length;
          const b = el('button', { type: 'button', className: 'card ls-item' + (this.done.has(l.id) ? ' done' : '') },
            el('span', { className: 'ls-item-title', textContent: l.title }),
            el('span', { className: 'ls-item-sum', textContent: l.summary }),
            el('span', { className: 'ls-item-meta', textContent: [t('{n} passi', { n: l.steps.length }), exercises && t(exercises === 1 ? '{n} esercizio' : '{n} esercizi', { n: exercises }),
              this.done.has(l.id) && t('completata')].filter(Boolean).join(' · ') }));
          b.dataset.id = l.id;
          b.onclick = () => this.open(l);
          return b;
        })));
    });
    this.$('#ls-groups').replaceChildren(...groups);
  }

  // ---------- lezione ----------
  open(lesson) {
    this.$('#ls-index').hidden = true;
    this.$('#ls-player').hidden = false;
    // Orientamento: dal lato di chi risolve il primo esercizio (per tutta la lezione, così la scacchiera non gira)
    const ex = lesson.steps.find((s) => s.kind === 'exercise');
    const orientation = ex ? new Chess(ex.fen).turn() : 'w';
    this.s = { lesson, orientation, gen: 0 };
    this.board.setOrientation(orientation);
    this.go(0);
  }

  go(index) {
    const s = this.s;
    if (!s || index < 0 || index >= s.lesson.steps.length) return;
    this.deps.engine()?.cancelAll();
    const step = s.lesson.steps[index];
    Object.assign(s, { index, step, chess: new Chess(step.fen), sol: 0, wrong: null, gen: s.gen + 1, demoDone: !step.demo });
    s.status = step.kind === 'exercise' ? 'play' : 'explain';
    this.board.setBadge(null);
    this.board.setMarks(step.marks ?? []);
    this.drawPosition(null, false);
    this.drawArrows();
    this.render();
    // La dimostrazione parte da sola la prima volta
    if (step.demo) this.playDemo();
  }

  drawPosition(lastMove, animate) {
    const c = this.s.chess;
    this.board.setPosition(piecesOf(c), lastMove ? { from: lastMove.from, to: lastMove.to } : null, checkSquareOf(c), animate);
  }

  /** Frecce del passo: compaiono quando la dimostrazione è finita (indicano la posizione dopo). */
  drawArrows() {
    const { step, demoDone } = this.s;
    const show = step.kind === 'explain' && demoDone && step.arrows;
    this.board.setArrows(show ? step.arrows.map(([from, to]) => ({ from, to, ...CFG.arrow })) : []);
  }

  async playDemo() {
    const s = this.s;
    const gen = ++s.gen;
    s.chess = new Chess(s.step.fen);
    s.demoDone = false;
    this.drawPosition(null, false);
    this.drawArrows();
    this.render();
    for (const uci of s.step.demo) {
      await sleep(CFG.demoDelayMs);
      if (this.s !== s || s.gen !== gen) return;
      this.drawPosition(playUci(s.chess, uci), true);
    }
    s.demoDone = true;
    this.drawArrows();
    this.render();
  }

  async onUserMove(from, to) {
    const s = this.s;
    if (!s || s.status !== 'play') return;
    const needsPromo = s.chess.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
    const promotion = needsPromo ? await this.deps.askPromotion(s.chess.turn()) : undefined;
    if (needsPromo && !promotion) return this.drawPosition(null, false);
    const uci = from + to + (promotion ?? '');
    const fen = s.chess.fen();
    if (!isCorrectLessonMove(s.step, fen, uci, s.sol)) return this.onWrong(fen, uci);
    this.drawPosition(playUci(s.chess, uci), true);
    s.sol++;
    const solution = s.step.solution;
    if (!solution || s.sol >= solution.length) return this.onSolved();
    s.status = 'reply';
    this.render();
    await sleep(CFG.demoDelayMs);
    if (this.s !== s) return;
    this.drawPosition(playUci(s.chess, solution[s.sol]), true);
    s.sol++;
    s.status = 'play';
    this.render();
  }

  onSolved() {
    this.s.status = 'solved';
    this.render();
  }

  async onWrong(fenBefore, uci) {
    const s = this.s;
    const c = new Chess(fenBefore);
    const m = playUci(c, uci);
    s.wrong = { fenBefore, san: toItalian(m.san), reply: null };
    s.status = 'wrong';
    this.board.setPosition(piecesOf(c), { from: m.from, to: m.to }, checkSquareOf(c), true);
    this.render();
    const engine = this.deps.engine();
    if (!engine || c.isGameOver()) return;
    try {
      const reply = await refutation(engine, c.fen(), ANALYSIS_CONFIG.puzzles.refuteDepth);
      if (this.s !== s || s.status !== 'wrong' || !reply) return;
      s.wrong.reply = reply;
      this.board.setArrows([{ from: reply.move.slice(0, 2), to: reply.move.slice(2, 4), ...UI_CONFIG.coachThreatArrow }]);
      this.render();
    } catch { /* analisi annullata */ }
  }

  retry() {
    const s = this.s;
    if (!s || s.status !== 'wrong') return;
    this.deps.engine()?.cancelAll();
    s.wrong = null;
    s.status = 'play';
    this.board.setArrows([]);
    this.drawPosition(null, true);
    this.render();
  }

  async showSolution() {
    const s = this.s;
    if (!s || !['play', 'wrong'].includes(s.status)) return;
    if (s.status === 'wrong') this.retry();
    s.status = 'showing';
    this.render();
    const moves = s.step.solution ?? [s.step.accept[0]];
    while (s.sol < moves.length) {
      await sleep(CFG.demoDelayMs);
      if (this.s !== s) return;
      this.drawPosition(playUci(s.chess, moves[s.sol]), true);
      s.sol++;
    }
    this.onSolved();
  }

  next() {
    const s = this.s;
    if (s.index < s.lesson.steps.length - 1) return this.go(s.index + 1);
    // Fine della lezione
    this.done.add(s.lesson.id);
    this.deps.store.set('lessonsDone', JSON.stringify([...this.done]));
    const list = this.data.lessons;
    const following = list[list.indexOf(s.lesson) + 1];
    if (following) this.open(following);
    else this.showIndex();
  }

  /** Tastiera: ← → per i passi della lezione. */
  onKey(e) {
    if (!this.s || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'ArrowLeft') this.go(this.s.index - 1);
    else this.next();
  }

  // ---------- pannello ----------
  render() {
    const s = this.s;
    if (!s) return;
    const { lesson, step, index } = s;
    const cat = this.data.categories.find((c) => c.id === lesson.category)?.label ?? '';
    const last = index === lesson.steps.length - 1;
    this.$('#ls-meta').textContent = `${cat} · ${lesson.title}`;
    this.$('#ls-title').textContent = step.kind === 'exercise' ? t('Esercizio') : step.title;
    this.$('#ls-steps').replaceChildren(...lesson.steps.map((st, i) => el('span', {
      className: `ls-dot${i === index ? ' current' : ''}${i < index ? ' past' : ''}${st.kind === 'exercise' ? ' ex' : ''}`,
      title: st.kind === 'exercise' ? t('Esercizio') : st.title,
    })));
    this.$('#ls-step-count').textContent = t('Passo {n} di {total}', { n: index + 1, total: lesson.steps.length });
    this.$('#ls-text').textContent = step.text;
    const card = this.$('#ls-card');
    card.dataset.state = s.status === 'solved' ? 'solved' : s.status === 'wrong' ? 'wrong' : '';

    const fb = this.$('#ls-feedback');
    fb.replaceChildren();
    const para = (text, cls = '') => fb.append(el('p', { textContent: text, className: cls }));
    if (s.status === 'play' && s.sol > 0) para(t('Giusto! Continua…'));
    if (s.status === 'reply') para(t('Giusto! Ora risponde l\'avversario…'));
    if (s.status === 'wrong') {
      para(t('{move} non è la mossa giusta.', { move: s.wrong.san }), 'ls-bad');
      if (s.wrong.reply) para(t('Stockfish risponde: {line} (valutazione {score}, profondità {depth}).', s.wrong.reply), 'pz-note');
      else if (this.deps.engine()) para(t('Stockfish cerca la risposta dell\'avversario…'), 'pz-note');
    }
    if (s.status === 'solved') para(step.success, 'ls-good');

    this.$('#ls-demo').hidden = !(step.kind === 'explain' && step.demo);
    this.$('#ls-demo').textContent = s.demoDone ? t('Rivedi la mossa') : t('Mostra la mossa');
    this.$('#ls-retry').hidden = s.status !== 'wrong';
    this.$('#ls-solution').hidden = !['play', 'wrong'].includes(s.status);
    this.$('#ls-prev').disabled = index === 0;
    const next = this.$('#ls-next');
    next.textContent = last ? t('Completa la lezione') : step.kind === 'exercise' && s.status !== 'solved' ? t('Salta') : t('Avanti');
    next.classList.toggle('primary', !(step.kind === 'exercise' && s.status !== 'solved'));
  }
}
