// Sezione "Gioca": partita contro Stockfish a 8 livelli (ENGINE_CONFIG.playLevels), con un motore separato da quello
// delle analisi. La partita in corso resta in localStorage (playGame); a fine partita si può farne la revisione.

import { Chess } from '../../lib/chess.js';
import { Engine, AnalysisCancelled } from '../engine/engine.js';
import { ENGINE_CONFIG } from '../config/engine.js';
import { outcomeOf, replay, playPgn } from '../analysis/play.js';
import { playUci } from '../analysis/puzzle.js';
import { Board } from './board.js';
import { toItalian } from './notation.js';
import { piecesOf, checkSquareOf } from './position.js';

const LEVELS = ENGINE_CONFIG.playLevels;
const COLOR_NAME = { w: 'Bianco', b: 'Nero' };
const REASON_TEXT = {
  checkmate: 'scacco matto', stalemate: 'stallo', insufficient: 'materiale insufficiente',
  threefold: 'triplice ripetizione', 'fifty-moves': 'regola delle 50 mosse', resign: 'abbandono',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export class PlayGame {
  /**
   * @param {HTMLElement} root vista #view-play
   * @param {{ askPromotion: (color:string)=>Promise<string|null>, store: { get: (k:string, d:any)=>any, set: (k:string, v:any)=>void },
   *   toReview: (pgn: string) => void }} deps
   */
  constructor(root, deps) {
    this.root = root;
    this.deps = deps;
    this.$ = (sel) => root.querySelector(sel);
    this.engine = null;
    this.engineLevel = null; // livello impostato nel motore
    this.thinking = false;
    this.gen = 0;
    this.choice = { color: 'w', level: 3 };
    this.g = this.load(); // { moves, color, level, date, over }
    this.board = new Board(this.$('#pl-board'), {
      canPick: (sq) => {
        if (!this.g || this.g.over || this.thinking) return false;
        const c = this.chess();
        const p = c.get(sq);
        return c.turn() === this.g.color && !!p && p.color === c.turn();
      },
      dests: (sq) => this.chess().moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })),
      onMove: (from, to) => this.onUserMove(from, to),
    });
    this.buildSetup();
    this.$('#pl-start').onclick = () => this.start();
    this.$('#pl-undo').onclick = () => this.undo();
    this.$('#pl-resign').onclick = () => this.resign();
    this.$('#pl-new').onclick = () => this.newGame();
    this.$('#pl-review').onclick = () => this.review();
  }

  // ---------- stato salvato ----------
  load() {
    try {
      const g = JSON.parse(this.deps.store.get('playGame', 'null'));
      if (g && Array.isArray(g.moves) && LEVELS.some((l) => l.level === g.level) && replay(g.moves)) return g;
    } catch { /* partita salvata non leggibile: si riparte */ }
    return null;
  }

  save() {
    this.deps.store.set('playGame', this.g ? JSON.stringify(this.g) : '');
  }

  /** Posizione attuale con tutta la storia (serve alla triplice ripetizione). */
  chess() {
    return replay(this.g?.moves ?? []) ?? new Chess();
  }

  // ---------- impostazione ----------
  buildSetup() {
    const seg = (el, options, key) => {
      for (const o of options) {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: o.label });
        b.setAttribute('role', 'radio');
        b.dataset.value = String(o.value);
        b.onclick = () => {
          this.choice[key] = o.value;
          this.renderSetup();
        };
        el.append(b);
      }
    };
    seg(this.$('#pl-color'), [{ label: 'Bianco', value: 'w' }, { label: 'Nero', value: 'b' }, { label: 'A caso', value: 'random' }], 'color');
    seg(this.$('#pl-level'), LEVELS.map((l) => ({ label: String(l.level), value: l.level })), 'level');
  }

  renderSetup() {
    for (const [sel, key] of [['#pl-color', 'color'], ['#pl-level', 'level']]) {
      for (const b of this.$(sel).children) {
        const on = b.dataset.value === String(this.choice[key]);
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
      }
    }
    const l = LEVELS.find((x) => x.level === this.choice.level);
    this.$('#pl-level-hint').textContent = l.level === LEVELS.length
      ? `Livello ${l.level}: Stockfish a piena forza, profondità ${l.depth}.`
      : `Livello ${l.level}: Stockfish indebolito (Skill Level ${l.skill} su 20), profondità ${l.depth}.`
        + (l.level <= 2 ? ' Sbaglia spesso: adatto per iniziare.' : '');
  }

  show() {
    this.renderSetup();
    this.render();
    if (this.g && !this.g.over) this.think();
  }

  start() {
    const color = this.choice.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : this.choice.color;
    this.gen++;
    this.engine?.cancelAll();
    this.thinking = false;
    this.g = { moves: [], color, level: this.choice.level, date: todayIso(), over: null };
    this.save();
    this.render(false);
    this.think();
  }

  newGame() {
    this.gen++;
    this.engine?.cancelAll();
    this.thinking = false;
    this.g = null;
    this.save();
    this.render(false);
  }

  // ---------- partita ----------
  async ensureEngine(level) {
    this.engine ??= Engine.inWorker(ENGINE_CONFIG.workerUrl, { ...ENGINE_CONFIG, hashMb: ENGINE_CONFIG.playHashMb });
    if (this.engineLevel !== level) {
      const l = LEVELS.find((x) => x.level === level);
      await this.engine.setOptions({ 'Skill Level': l.skill });
      await this.engine.newGame();
      this.engineLevel = level;
    }
    return this.engine;
  }

  /** Mossa del motore, se tocca a lui. */
  async think() {
    const g = this.g;
    if (!g || g.over || this.thinking) return;
    const c = this.chess();
    if (c.turn() === g.color) return;
    const gen = this.gen;
    this.thinking = true;
    this.render();
    const t0 = Date.now();
    try {
      const engine = await this.ensureEngine(g.level);
      const l = LEVELS.find((x) => x.level === g.level);
      const r = await engine.analyze(c.fen(), { depth: l.depth, multiPv: 1, movetimeMs: null });
      await sleep(Math.max(0, ENGINE_CONFIG.playMinMoveMs - (Date.now() - t0)));
      if (gen !== this.gen || this.g !== g) return;
      // Con Skill Level < 20 la mossa giocata è quella di "bestmove" (scelta indebolita), non la prima linea
      const move = r.bestMove ?? r.lines[0]?.pv[0];
      if (move) this.apply(move);
    } catch (err) {
      if (!(err instanceof AnalysisCancelled) && gen === this.gen) this.$('#pl-feedback').textContent = 'Il motore non è disponibile.';
    } finally {
      if (gen === this.gen) {
        this.thinking = false;
        this.render();
      }
    }
  }

  apply(uci) {
    this.g.moves.push(uci);
    const c = this.chess();
    const o = outcomeOf(c);
    if (o) this.g.over = o;
    this.save();
    this.render(true);
  }

  async onUserMove(from, to) {
    const c = this.chess();
    const needsPromo = c.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
    const promotion = needsPromo ? await this.deps.askPromotion(c.turn()) : undefined;
    if (needsPromo && !promotion) return this.render();
    if (!playUci(c, from + to + (promotion ?? ''))) return this.render();
    this.apply(from + to + (promotion ?? ''));
    this.think();
  }

  /** Annulla la tua ultima mossa (e la risposta del motore, se c'è già). */
  undo() {
    const g = this.g;
    if (!g || !g.moves.length) return;
    this.gen++;
    this.engine?.cancelAll();
    this.thinking = false;
    g.over = null;
    g.moves.pop();
    if (this.chess().turn() !== g.color && g.moves.length) g.moves.pop();
    this.save();
    this.render(false);
    this.think(); // se il motore ha il Bianco e si è tornati all'inizio, rigioca la prima mossa
  }

  resign() {
    const g = this.g;
    if (!g || g.over) return;
    this.gen++;
    this.engine?.cancelAll();
    this.thinking = false;
    g.over = { result: g.color === 'w' ? '0-1' : '1-0', reason: 'resign' };
    this.save();
    this.render();
  }

  review() {
    const g = this.g;
    if (!g?.moves.length) return;
    const result = g.over?.result ?? '*';
    const termination = g.over?.reason === 'resign' ? `${COLOR_NAME[g.color]} abbandona` : undefined;
    this.deps.toReview(playPgn({ moves: g.moves, color: g.color, level: g.level, date: g.date, result, termination }));
  }

  // ---------- disegno ----------
  render(animate = false) {
    const g = this.g;
    this.$('#pl-setup').hidden = !!g;
    this.$('#pl-card').hidden = !g;
    this.$('#pl-moves-card').hidden = !g;
    const c = this.chess();
    const hist = c.history({ verbose: true });
    const last = hist.at(-1);
    this.board.setOrientation(g?.color ?? 'w');
    this.board.setPosition(piecesOf(c), last ? { from: last.from, to: last.to } : null, checkSquareOf(c), animate);
    if (!g) {
      this.$('#pl-tag-top').textContent = '';
      this.$('#pl-tag-bottom').textContent = '';
      return;
    }
    const engineName = `Stockfish · livello ${g.level}`;
    this.$('#pl-tag-top').textContent = engineName;
    this.$('#pl-tag-bottom').textContent = `Tu (${COLOR_NAME[g.color]})`;
    this.$('#pl-meta').textContent = `Livello ${g.level} · giochi con il ${COLOR_NAME[g.color]}`;
    const card = this.$('#pl-card');
    let status;
    if (g.over) {
      const { result, reason } = g.over;
      const won = (result === '1-0' && g.color === 'w') || (result === '0-1' && g.color === 'b');
      status = result === '1/2-1/2' ? `Patta (${REASON_TEXT[reason]})` : `${won ? 'Hai vinto' : 'Hai perso'} (${REASON_TEXT[reason]})`;
      card.dataset.state = result === '1/2-1/2' ? 'done' : won ? 'solved' : 'wrong';
    } else {
      status = this.thinking ? 'Stockfish pensa…' : c.inCheck() ? 'Tocca a te: sei sotto scacco' : 'Tocca a te';
      card.dataset.state = '';
    }
    this.$('#pl-status').textContent = status;
    if (!this.thinking) this.$('#pl-feedback').textContent = '';
    this.$('#pl-undo').hidden = !!g.over;
    this.$('#pl-undo').disabled = !g.moves.length;
    this.$('#pl-resign').hidden = !!g.over;
    this.$('#pl-review').hidden = !g.over;
    this.$('#pl-new').hidden = !g.over;
    // Mosse numerate, in notazione italiana
    const rows = [];
    for (let i = 0; i < hist.length; i += 2) {
      rows.push(`<li><span class="num">${i / 2 + 1}.</span><span>${toItalian(hist[i].san)}</span><span>${hist[i + 1] ? toItalian(hist[i + 1].san) : ''}</span></li>`);
    }
    this.$('#pl-moves').innerHTML = rows.join('');
    this.$('#pl-moves').scrollTop = this.$('#pl-moves').scrollHeight;
  }
}
