// Sezione "Aperture" in tre schermate: ① catalogo (prima mossa → aperture), ② pagina dell'apertura (colore, albero delle
// varianti "se gioca X → variante"), ③ studio sulla scacchiera (Impara / Ripasso). Le mosse vengono solo dal dataset
// (albero data/openings/tree/), valutazioni e mosse consigliate da Stockfish (calcolate in anticipo, o dal vivo per una
// mossa fuori teoria), statistiche reali per fascia nel pannello "Dettagli". Logica pura in src/analysis/opening-study.js.

import { Chess } from '../../lib/chess.js';
import { formatScore } from '../engine/score.js';
import { UI_CONFIG } from '../config/ui.js';
import { ANALYSIS_CONFIG } from '../config/analysis.js';
import { GROUPS, normSan, scoreFor } from '../analysis/opening-tree.js';
import {
  uniqueLabels, familyTrie, familyRows, walk, nextStep, judgeStudyMove, pickReview, migrateReps, mainPathOf, mergeFamilies,
  firstVariationBelow, sansOf, numbered,
} from '../analysis/opening-study.js';
import { reviewQueue, recordResult, LEARNED_BOX } from '../analysis/my-mistakes.js';
import { playUci } from '../analysis/puzzle.js';
import { Board } from './board.js';
import { toItalian } from './notation.js';
import { piecesOf, checkSquareOf } from './position.js';
import { t, getLang } from '../i18n/i18n.js';

const CFG = UI_CONFIG.openings;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const groupOfId = (id) => (id === 'root' ? 'root' : id.split(':')[0]);
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter((c) => c != null && c !== false && c !== ''));
  return e;
};
/** Mossa numerata nella notazione della lingua: "3.Nc3" → "3.Cc3" (solo la mossa, non il numero). */
const localMove = (s) => s.replace(/^(\d+\.(?:\.\.)?)(.*)$/, (m, num, san) => num + toItalian(san));
const ARROW_THEORY = Object.freeze({ color: '#22c55e', width: 0.18, opacity: 0.9 });
const ARROW_POPULAR = Object.freeze({ color: '#60a5fa', width: 0.13, opacity: 0.75 });
const OFF_THEORY_PAUSE_MS = 1600; // tempo per leggere il messaggio prima che l'app rimetta la mossa della teoria
const STUDY_DEPTH = ANALYSIS_CONFIG.puzzles.refuteDepth; // valutazione dal vivo della mossa fuori teoria

export class OpeningsExplorer {
  /**
   * @param {HTMLElement} root vista #view-openings
   * @param {{ store: { get: (k:string, d:any)=>any, set: (k:string, v:any)=>void }, toast: (m:string)=>void,
   *   askPromotion: (color:string)=>Promise<string|null>, engine: () => import('../engine/engine.js').Engine|null,
   *   openInAnalysis: (ucis: string[], color: 'w'|'b') => void }} deps
   */
  constructor(root, deps) {
    this.root = root;
    this.deps = deps;
    this.$ = (sel) => root.querySelector(sel);
    this.index = null;
    this.openings = []; //     aperture del catalogo (famiglie unite)
    this.trees = new Map(); //  gruppo → Map(id → nodo dell'albero)
    this.stats = new Map(); //  gruppo → Map(id → statistiche per fascia)
    this.ideas = null;
    this.loading = null;
    const saved = this.loadState();
    this.screen = saved.screen ?? 'catalog';
    this.group = saved.group ?? 'e4';
    this.key = saved.key ?? null; //      apertura aperta: "gruppo|nome"
    this.color = saved.color === 'b' ? 'b' : 'w';
    this.mode = saved.mode === 'review' ? 'review' : 'learn';
    this.savedPlan = saved.plan ?? null;
    this.band = CFG.ratingBands.some((b) => b.id === deps.store.get('opBand', '')) ? deps.store.get('opBand', '') : 'b1400';
    this.study = null; //       { path, plan, startPlan, explore, errors, status, wrong, label, gen }
    this.gen = 0;
    this.board = new Board(this.$('#op-board'), {
      canPick: (sq) => {
        if (this.study?.status !== 'play') return false;
        const p = this.chess().get(sq);
        return !!p && p.color === this.chess().turn();
      },
      dests: (sq) => this.chess().moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })),
      onMove: (from, to) => this.onUserMove(from, to),
    });
    this.$('#op-back-btn').onclick = () => this.back();
    this.$('#op-search').addEventListener('input', () => this.renderCatalog());
    this.$('#op-learn-btn').onclick = () => this.startStudy('learn', this.opening().mainPath, true);
    this.$('#op-review-btn').onclick = () => this.startStudy('review');
    this.$('#op-st-restart').onclick = () => this.startStudy(this.mode, this.study?.startPlan ?? null, this.study?.explore ?? false);
    this.$('#op-st-analysis').onclick = () => this.study?.wrong && this.deps.openInAnalysis(this.study.wrong.path, this.color);
    this.$('#op-review-all').onclick = () => this.reviewAnyDue();
    this.$('#op-details').addEventListener('toggle', () => this.renderDetails());
    this.buildControls();
  }

  // ---------- stato salvato ----------
  loadState() {
    try {
      const v = JSON.parse(this.deps.store.get('openingState', '{}'));
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }

  saveState() {
    this.deps.store.set('openingState', JSON.stringify({
      screen: this.screen, group: this.group, key: this.key, color: this.color, mode: this.mode,
      plan: this.screen === 'study' ? (this.study?.startPlan ?? null) : null,
    }));
  }

  reps() {
    try {
      const v = JSON.parse(this.deps.store.get('openingReps', '[]'));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  saveReps(list) {
    this.deps.store.set('openingReps', JSON.stringify(list));
  }

  // ---------- dati ----------
  async show() {
    if (!this.loading) {
      this.loading = (async () => {
        const get = (u) => fetch(u).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        });
        this.index = await get(CFG.indexUrl);
        this.trees.set('root', new Map([['root', this.index.root]]));
        await this.loadGroup('root');
        const ideas = await get(CFG.ideasUrl).catch(() => null);
        if (ideas && getLang() === 'en') {
          const en = await get(CFG.ideasEnUrl).catch(() => null);
          for (const [k, v] of Object.entries(en?.families ?? {})) Object.assign(ideas.families[k] ?? {}, v);
        }
        this.ideas = ideas;
        this.prepareOpenings();
        // Ripassi salvati con la versione precedente della sezione: si tengono tutti, con la loro apertura
        this.saveReps(migrateReps(this.reps(), (p) => this.openingOfPath(p.split(' '))?.key ?? null));
      })().catch(() => { this.loading = null; });
    }
    await this.loading;
    if (!this.index) {
      this.$('#op-cards').replaceChildren(el('p', { className: 'hint', textContent: t('Non riesco a caricare le aperture. Controlla la connessione e riprova.') }));
      return;
    }
    // Rientro: dall'ultima apertura che stavo studiando
    if (this.screen !== 'catalog' && !this.opening()) this.screen = 'catalog';
    if (this.screen === 'study' && !this.study) return this.startStudy(this.mode, this.savedPlan, !this.savedPlan);
    this.render();
  }

  /** Aperture del catalogo: famiglie unite, albero, linea principale. */
  prepareOpenings() {
    this.openings = mergeFamilies(this.index.families).map((o) => {
      const variations = o.variations.map((v) => ({ ...v, path: v.path.split(' ') }));
      const mainPath = mainPathOf(variations) ?? variations.slice().sort((a, b) => a.path.length - b.path.length)[0].path;
      return { ...o, key: `${o.group}|${o.name}`, variations, mainPath, trie: familyTrie(variations) };
    });
    this.labelCache = new Map();
  }

  opening(key = this.key) {
    return this.openings.find((o) => o.key === key) ?? null;
  }

  /** Apertura che contiene la variante con questo percorso (o, se non c'è, quella con la variante più simile). */
  openingOfPath(path) {
    const key = path.join(' ');
    let best = null;
    let bestLen = -1;
    for (const o of this.openings) {
      for (const v of o.variations) {
        if (v.path.join(' ') === key) return o;
        let i = 0;
        while (i < v.path.length && i < path.length && v.path[i] === path[i]) i++;
        if (i > bestLen) { bestLen = i; best = o; }
      }
    }
    return best;
  }

  /** Nomi univoci delle varianti (notazione della lingua attiva per le mosse aggiunte). */
  labels(o) {
    if (!this.labelCache.has(o.key)) this.labelCache.set(o.key, uniqueLabels(o.variations, t('Linea principale'), toItalian));
    return this.labelCache.get(o.key);
  }

  async loadGroup(group) {
    if (group !== 'root' && !this.trees.has(group)) {
      const r = await fetch(CFG.treeUrl(group));
      this.trees.set(group, new Map(Object.entries((await r.json()).nodes)));
    }
    if (!this.stats.has(group)) {
      const s = await fetch(CFG.statsUrl(group)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      this.stats.set(group, new Map(Object.entries(s?.nodes ?? {})));
    }
  }

  async node(id) {
    const g = groupOfId(id);
    await this.loadGroup(g);
    return this.trees.get(g).get(id);
  }

  /** Nodo dell'albero (con Stockfish e id) dopo un percorso UCI, o null se il percorso esce dall'albero. */
  async treeNodeAt(path) {
    let id = 'root';
    let n = this.index.root;
    for (const uci of path) {
      const e = n.c.find((x) => x[1] === uci);
      if (!e) return null;
      id = e[2];
      n = await this.node(id);
    }
    return { id, node: n };
  }

  statsOf(id) {
    const row = this.stats.get(groupOfId(id))?.get(id);
    const i = CFG.ratingBands.findIndex((b) => b.id === this.band);
    return row?.[i] || null;
  }

  // ---------- navigazione tra le schermate ----------
  go(screen) {
    this.screen = screen;
    this.saveState();
    this.render();
  }

  openOpening(key) {
    this.key = key;
    this.study = null;
    this.go('family');
  }

  back() {
    if (this.screen === 'study') {
      this.study = null;
      this.go('family');
    } else if (this.screen === 'family') {
      this.go('catalog');
    }
  }

  /** Apre l'apertura che contiene questa posizione (dal link in Analisi partita). */
  async openKey(key) {
    await this.show();
    for (const g of GROUPS) await this.loadGroup(g.id);
    const seen = new Set(['root']);
    const queue = [{ node: this.index.root, path: [] }];
    while (queue.length) {
      const { node, path } = queue.shift();
      if (node.k === key) {
        const o = this.openingOfPath(path);
        if (o) return this.openOpening(o.key);
        break;
      }
      for (const [, uci, to] of node.c) {
        if (seen.has(to)) continue;
        seen.add(to);
        queue.push({ node: await this.node(to), path: [...path, uci] });
      }
    }
    this.deps.toast(t('Posizione non presente nell\'albero delle aperture'));
  }

  // ---------- disegno ----------
  render() {
    for (const s of ['catalog', 'family', 'study']) this.$(`#op-s-${s}`).hidden = this.screen !== s;
    this.$('#op-back-btn').hidden = this.screen === 'catalog';
    this.$('#op-back-btn').textContent = this.screen === 'study' ? `‹ ${t('Apertura')}` : `‹ ${t('Catalogo')}`;
    this.renderCrumbs();
    if (this.screen === 'catalog') this.renderCatalog();
    if (this.screen === 'family') this.renderFamily();
    if (this.screen === 'study') this.renderStudy();
  }

  groupLabel(id) {
    const label = GROUPS.find((g) => g.id === id)?.label;
    return label ? localMove(label) : t('Altre');
  }

  renderCrumbs() {
    const o = this.opening();
    const parts = [t('Aperture')];
    if (this.screen !== 'catalog' && o) parts.push(this.groupLabel(o.group), o.name);
    if (this.screen === 'study' && this.study?.label) parts.push(this.study.label);
    this.$('#op-crumbs').textContent = parts.join(' › ');
  }

  italianName(o) {
    return getLang() === 'it' ? CFG.italianNames[o.name] ?? '' : '';
  }

  /** Riga di descrizione: la prima frase delle idee (solo per le aperture che le hanno). */
  description(o) {
    const first = this.ideas?.families?.[o.name]?.text?.[0];
    return first ? first.split(/(?<=\.)\s/)[0] : '';
  }

  movesText(path) {
    return sansOf(path).map((s, i) => localMove(numbered(i, s))).join(' ');
  }

  buildControls() {
    const seg = (box, options, current, onPick) => {
      box.replaceChildren(...options.map((o) => {
        const b = el('button', { type: 'button', textContent: o.label });
        b.setAttribute('role', 'radio');
        b.dataset.value = o.value;
        b.onclick = () => onPick(o.value);
        return b;
      }));
      const mark = (v) => { for (const b of box.children) { b.classList.toggle('active', b.dataset.value === v); b.setAttribute('aria-checked', String(b.dataset.value === v)); } };
      mark(current);
      return mark;
    };
    const markBand = seg(this.$('#op-band'), CFG.ratingBands.map((b) => ({ label: b.label, value: b.id })), this.band, (v) => {
      this.band = v;
      this.deps.store.set('opBand', v);
      markBand(v);
      if (this.study) this.renderDetails();
    });
    this.markColor = seg(this.$('#op-color'), [{ label: t('Bianco'), value: 'w' }, { label: t('Nero'), value: 'b' }], this.color, (v) => {
      this.color = v;
      this.markColor(v);
      this.saveState();
      this.renderFamily();
    });
    this.markMode = seg(this.$('#op-mode'), [{ label: t('Impara'), value: 'learn' }, { label: t('Ripasso'), value: 'review' }], this.mode, (v) => {
      if (v === this.mode) return;
      if (v === 'learn') this.startStudy('learn', this.study?.startPlan ?? this.opening().mainPath, !this.study?.startPlan);
      else this.startStudy('review', this.study?.chosen ?? (this.study?.label ? this.study.startPlan : null));
    });
  }

  renderCatalog() {
    if (!this.index) return;
    const q = fold(this.$('#op-search').value.trim());
    this.$('#op-groups').replaceChildren(...GROUPS.map((g) => {
      const b = el('button', { type: 'button', className: `chip${g.id === this.group && !q ? ' active' : ''}`, textContent: this.groupLabel(g.id) });
      b.dataset.group = g.id;
      b.onclick = () => {
        this.group = g.id;
        this.$('#op-search').value = '';
        this.saveState();
        this.renderCatalog();
      };
      return b;
    }));
    // Ricerca: nome dell'apertura (anche italiano) e nomi delle varianti, senza accenti
    const hit = (o) => fold(o.name).includes(q) || fold(CFG.italianNames[o.name] ?? '').includes(q) || o.variations.some((v) => fold(v.full).includes(q));
    const list = this.openings.filter((o) => (q ? hit(o) : o.group === this.group));
    const due = reviewQueue(this.reps());
    const btn = this.$('#op-review-all');
    btn.hidden = !due.length;
    btn.textContent = t('Ripassa le varianti studiate ({n})', { n: due.length });
    const cards = list.map((o) => {
      const card = el('button', { type: 'button', className: 'card op-card' },
        el('span', { className: 'op-card-name', textContent: o.name }),
        this.italianName(o) && el('span', { className: 'op-card-it', textContent: this.italianName(o) }),
        el('span', { className: 'op-card-moves', textContent: this.movesText(o.mainPath) }),
        this.description(o) && el('span', { className: 'op-card-desc', textContent: this.description(o) }),
        el('span', { className: 'op-card-meta', textContent: `${o.eco} · ${t('{n} varianti', { n: o.variations.length })}` }));
      card.dataset.key = o.key;
      card.onclick = () => this.openOpening(o.key);
      return card;
    });
    this.$('#op-cards').replaceChildren(...(cards.length ? cards : [el('p', { className: 'hint', textContent: t('Nessuna apertura trovata.') })]));
  }

  renderFamily() {
    const o = this.opening();
    if (!o || this.screen !== 'family') return;
    this.$('#op-fam-eco').textContent = o.eco;
    this.$('#op-fam-name').textContent = o.name;
    this.$('#op-fam-sub').textContent = this.italianName(o);
    this.$('#op-fam-moves').textContent = this.movesText(o.mainPath);
    const idea = this.ideas?.families?.[o.name];
    this.$('#op-fam-ideas').hidden = !idea;
    if (idea) this.$('#op-fam-ideas').replaceChildren(...idea.text.map((p) => el('p', { textContent: p })));
    this.markColor(this.color);
    this.$('#op-fam-count').textContent = t('{n} varianti', { n: o.variations.length });
    const labels = this.labels(o);
    const { trunk, rows, others } = familyRows(o.trie, labels, o.variations, o.mainPath);
    const reps = new Map(this.reps().filter((r) => r.color === this.color).map((r) => [r.path, r]));
    const rowEl = (r) => {
      const ply = r.path.length - r.moves.length; // semimossa della prima mossa della riga: pari = Bianco
      const theirs = (ply % 2 === 0 ? 'w' : 'b') !== this.color;
      const variation = r.variation ?? firstVariationBelow(walk(o.trie, r.path));
      const rep = reps.get(o.variations[variation].path.join(' '));
      const moves = r.moves.map(localMove).join(' ');
      const b = el('button', { type: 'button', className: `op-row${theirs ? ' theirs' : ''}` },
        el('span', { className: 'op-row-moves', textContent: theirs ? t('Se {move}', { move: moves }) : moves }),
        r.label && el('span', { className: 'op-row-name', textContent: `→ ${r.label}` }),
        rep && el('span', { className: `op-row-badge${rep.box >= LEARNED_BOX ? ' done' : ''}`, textContent: rep.box >= LEARNED_BOX ? '✓' : `${rep.box}/${LEARNED_BOX}` }));
      b.dataset.variation = String(variation);
      b.onclick = () => this.startStudy('learn', o.variations[variation].path);
      return el('li', {}, b, r.children.length ? el('ul', { className: 'op-rows' }, ...r.children.map(rowEl)) : null);
    };
    const tree = [
      el('div', { className: 'op-trunk' },
        el('span', { className: 'op-row-moves', textContent: trunk.moves.map(localMove).join(' ') }),
        trunk.label && el('span', { className: 'op-row-name', textContent: `→ ${trunk.label}` })),
      el('ul', { className: 'op-rows' }, ...rows.map(rowEl)),
    ];
    if (others.length) {
      tree.push(el('details', { className: 'op-others' },
        el('summary', { textContent: t('Altri ordini di mosse ({n})', { n: others.length }) }),
        el('ul', { className: 'op-rows' }, ...others.map(rowEl))));
    }
    this.$('#op-tree').replaceChildren(...tree);
  }

  // ---------- studio ----------
  chess() {
    const c = new Chess();
    for (const u of this.study?.path ?? []) playUci(c, u);
    return c;
  }

  /**
   * Inizia lo studio. Impara: plan = variante scelta (o la linea principale, con explore = poi si continua alle
   * diramazioni). Ripasso: variante scelta da pickReview (prima quelle studiate e non ancora imparate).
   */
  startStudy(mode, plan = null, explore = false) {
    const o = this.opening();
    if (!o) return;
    this.mode = mode;
    if (mode === 'review' && !plan) plan = pickReview(o.variations, this.reps(), this.color);
    if (mode === 'review') explore = false;
    this.study = { path: [], plan, startPlan: plan, chosen: null, explore, errors: 0, status: 'app', wrong: null, label: this.labelOf(plan), gen: ++this.gen };
    if (explore) this.study.label = null; // "Impara dall'inizio": la variante si sceglie alle diramazioni
    this.screen = 'study';
    this.saveState();
    this.board.setOrientation(this.color);
    this.board.setArrows([]);
    this.board.setMarks([]);
    this.drawBoard(false);
    this.render();
    this.markMode(mode);
    this.advance();
  }

  labelOf(plan) {
    const o = this.opening();
    if (!plan || !o) return null;
    const i = o.variations.findIndex((v) => v.path.join(' ') === plan.join(' '));
    return i >= 0 ? this.labels(o)[i] : null;
  }

  drawBoard(animate) {
    const c = this.chess();
    const last = c.history({ verbose: true }).at(-1) ?? null;
    this.board.setPosition(piecesOf(c), last ? { from: last.from, to: last.to } : null, checkSquareOf(c), animate);
  }

  /** Va avanti da solo finché non tocca all'utente, a una diramazione (Impara) o alla fine. */
  async advance() {
    const s = this.study;
    const o = this.opening();
    for (;;) {
      if (s !== this.study) return;
      let step = nextStep({ trie: o.trie, path: s.path, color: this.color, plan: s.plan });
      // Impara dall'inizio: finita la linea principale si continua, con le diramazioni
      if (step.who === 'end' && s.explore && s.plan) {
        s.plan = null;
        step = nextStep({ trie: o.trie, path: s.path, color: this.color, plan: null });
      }
      if (step.who === 'end') return this.finish();
      if (step.who === 'fork') {
        s.status = 'fork';
        s.options = step.options;
        return this.renderStudy();
      }
      if (step.who === 'user') {
        s.status = 'play';
        s.theory = step.planned ? [step.planned] : step.theory.map((n) => n.uci);
        return this.renderStudy();
      }
      s.status = 'app';
      this.renderStudy();
      await sleep(UI_CONFIG.puzzles.replyDelayMs);
      if (s !== this.study) return;
      s.path = [...s.path, step.uci];
      this.drawBoard(true);
    }
  }

  /** Diramazione dell'avversario in Impara: si sceglie quale variante studiare. */
  chooseBranch(option) {
    const s = this.study;
    const o = this.opening();
    const v = firstVariationBelow(option);
    s.plan = o.variations[v].path;
    s.chosen = s.plan; // variante scelta: è quella che si ripassa passando a Ripasso
    s.label = this.labels(o)[v];
    this.renderCrumbs();
    this.advance();
  }

  async onUserMove(from, to) {
    const s = this.study;
    if (s?.status !== 'play') return;
    const c = this.chess();
    const needsPromo = c.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
    const promotion = needsPromo ? await this.deps.askPromotion(c.turn()) : undefined;
    if (needsPromo && !promotion) return this.drawBoard(false);
    const uci = from + to + (promotion ?? '');
    const o = this.opening();
    const planned = s.plan && s.plan.length > s.path.length ? s.plan[s.path.length] : null;
    // In Impara con più mosse della teoria (senza piano) valgono tutte; altrimenti la mossa attesa è quella del piano
    const verdict = judgeStudyMove(o.trie, s.path, uci, planned);
    if (verdict.theory) {
      // Un'altra mossa della teoria (diramazione nostra): si cambia variante
      if (planned && uci !== planned) {
        const v = firstVariationBelow(verdict.node);
        s.plan = o.variations[v].path;
        s.chosen = s.plan;
        s.label = this.labels(o)[v];
      }
      s.path = [...s.path, uci];
      s.wrong = null;
      this.board.setMarks([]);
      this.drawBoard(true);
      return this.advance();
    }
    return this.offTheory(uci, verdict.expected);
  }

  /**
   * Mossa diversa dalla teoria: si gioca, si evidenzia in rosso, si dice qual è la mossa della teoria con le valutazioni
   * di Stockfish (teoria: già calcolata; la tua: dal vivo), poi l'app rimette la mossa della teoria. In Ripasso è un errore.
   */
  async offTheory(uci, expected) {
    const s = this.study;
    const before = this.chess();
    const fenBefore = before.fen();
    const m = playUci(before, uci);
    const theoryUci = expected[0];
    const theorySan = toItalian(new Chess(fenBefore).move({ from: theoryUci.slice(0, 2), to: theoryUci.slice(2, 4), promotion: theoryUci[4] }).san);
    const theoryNode = await this.treeNodeAt([...s.path, theoryUci]);
    const ts = theoryNode?.node.s;
    if (this.mode === 'review') s.errors++;
    s.status = 'wrong';
    s.wrong = {
      san: toItalian(m.san), theorySan, path: [...s.path, uci],
      theoryScore: ts && (ts[0] != null || ts[1] != null) ? formatScore({ cp: ts[0], mate: ts[1] }) : null, yourScore: null,
    };
    this.board.setPosition(piecesOf(before), { from: m.from, to: m.to }, checkSquareOf(before), true);
    this.board.setMarks([m.from, m.to], 'bad');
    this.board.setArrows([{ from: theoryUci.slice(0, 2), to: theoryUci.slice(2, 4), ...ARROW_THEORY }]);
    this.renderStudy();
    const gen = s.gen;
    const engine = this.deps.engine();
    const evalYours = (async () => {
      if (!engine || before.isGameOver()) return;
      try {
        engine.cancelAll();
        const r = await engine.analyze(before.fen(), { depth: STUDY_DEPTH, multiPv: 1, movetimeMs: null });
        if (this.study === s && s.gen === gen && s.wrong && r.lines[0]) {
          s.wrong.yourScore = formatScore(r.lines[0].score);
          this.renderStudy();
        }
      } catch { /* analisi annullata */ }
    })();
    await sleep(OFF_THEORY_PAUSE_MS);
    if (this.study !== s || s.gen !== gen) return;
    // Si rimette la mossa della teoria (con animazione) e si continua; il messaggio resta fino alla mossa successiva
    this.board.setMarks([]);
    this.drawBoard(false);
    s.path = [...s.path, theoryUci];
    s.status = 'app';
    this.drawBoard(true);
    await evalYours;
    if (this.study === s) this.advance();
  }

  finish() {
    const s = this.study;
    s.status = 'done';
    const plan = s.plan ?? s.path;
    const key = plan.join(' ');
    const list = this.reps();
    let rep = list.find((r) => r.color === this.color && r.path === key);
    if (!rep) {
      rep = { id: `${this.color}|${key}`, name: s.label ?? this.opening().name, color: this.color, path: key, family: this.key, box: 0, tries: 0, addedAt: Date.now() };
      list.push(rep);
    }
    // Il ripasso conta per le scatole; Impara aggiunge solo la variante a quelle da ripassare
    if (this.mode === 'review') Object.assign(rep, recordResult(rep, s.errors === 0));
    this.saveReps(list);
    s.box = rep.box;
    this.renderStudy();
  }

  sanAt(uci) {
    return toItalian(this.chess().moves({ verbose: true }).find((m) => m.from + m.to + (m.promotion ?? '') === uci)?.san ?? uci);
  }

  renderStudy() {
    const s = this.study;
    if (!s || this.screen !== 'study') return;
    const o = this.opening();
    this.renderCrumbs();
    this.$('#op-study-color').textContent = t(this.color === 'w' ? 'Studi con il Bianco' : 'Studi con il Nero');
    this.$('#op-st-meta').textContent = s.label ?? o.name;
    this.$('#op-path').textContent = this.movesText(s.path);
    const card = this.$('#op-study-card');
    card.dataset.state = s.status === 'wrong' ? 'wrong' : s.status === 'done' ? (s.errors ? 'done' : 'solved') : '';
    const text = this.$('#op-st-text');
    const branches = this.$('#op-st-branches');
    text.replaceChildren();
    branches.replaceChildren();
    const para = (str, cls = '') => text.append(el('p', { textContent: str, className: cls }));
    let title = '';
    const arrows = [];
    if (s.status === 'app') title = t('Mossa dell\'avversario…');
    if (s.status === 'play') {
      title = this.mode === 'learn' ? t('Tocca a te: gioca la mossa della teoria') : t('Tocca a te: quale mossa prevede la teoria?');
      if (this.mode === 'learn') {
        const names = s.theory.map((u) => {
          const v = firstVariationBelow(walk(o.trie, [...s.path, u]));
          arrows.push({ from: u.slice(0, 2), to: u.slice(2, 4), ...ARROW_THEORY });
          return { san: this.sanAt(u), label: v == null ? '' : this.labels(o)[v] };
        });
        para(names.length === 1
          ? t('La teoria gioca {move}.', { move: names[0].san })
          : t('La teoria prevede più mosse: {moves}.', { moves: names.map((n) => `${n.san} (${n.label})`).join(', ') }));
      }
    }
    if (s.status === 'fork') {
      title = t('L\'avversario può rispondere in più modi');
      para(t('Scegli quale variante studiare:'), 'pz-note');
      for (const opt of s.options) {
        const v = firstVariationBelow(opt);
        const b = el('button', { type: 'button', className: 'op-branch' },
          el('span', { className: 'op-row-moves', textContent: t('Se gioca {move}', { move: localMove(numbered(opt.ply - 1, opt.san)) }) }),
          el('span', { className: 'op-row-name', textContent: `→ ${this.labels(o)[v]}` }));
        b.onclick = () => this.chooseBranch(opt);
        branches.append(b);
      }
    }
    if (s.wrong && (s.status === 'wrong' || s.status === 'app' || s.status === 'play')) {
      if (s.status === 'wrong') title = t('Mossa diversa dalla teoria');
      const w = s.wrong;
      text.prepend(...[
        el('p', { className: 'op-wrong', textContent: t('Nella teoria qui si gioca {move}.', { move: w.theorySan }) }),
        el('p', { className: 'pz-note', textContent: t('Stockfish: {theory} con {theoryMove}; {yours} con la tua mossa {move}.', {
          theory: w.theoryScore ?? '–', theoryMove: w.theorySan, yours: w.yourScore ?? '…', move: w.san,
        }) }),
        this.mode === 'review' ? el('p', { className: 'pz-note', textContent: t('Conta come errore nel ripasso.') }) : null,
      ].filter(Boolean));
    }
    if (s.status === 'done') {
      title = this.mode === 'learn' ? t('Variante completata') : s.errors ? t('Ripasso completato con {n} errori', { n: s.errors }) : t('Ripasso completato senza errori!');
      para(this.mode === 'review'
        ? (s.box >= LEARNED_BOX ? t('Imparata! Esce dal ripasso.') : t('Risposte giuste di fila: {n} di {max}.', { n: s.box, max: LEARNED_BOX }))
        : t('Aggiunta alle varianti da ripassare.'), 'pz-note');
    }
    this.$('#op-st-title').textContent = title;
    this.$('#op-st-analysis').hidden = !s.wrong;
    const next = this.$('#op-st-next');
    next.hidden = s.status !== 'done';
    next.textContent = this.mode === 'learn' ? t('Ripassala ora') : t('Prossimo ripasso');
    next.onclick = () => (this.mode === 'learn' ? this.startStudy('review', s.plan ?? s.path) : this.startStudy('review'));
    if (s.status !== 'wrong') this.board.setArrows(arrows);
    this.renderDetails();
  }

  /** Pannello "Dettagli" (chiuso di base): Stockfish e statistiche della posizione; una sola riga fuori. */
  async renderDetails() {
    const s = this.study;
    if (!s) return;
    const at = await this.treeNodeAt(s.path);
    if (s !== this.study) return;
    const summary = this.$('#op-st-summary');
    const list = this.$('#op-moves');
    if (!at) {
      this.$('#op-sf').textContent = t('Posizione fuori dall\'albero delle aperture.');
      list.replaceChildren();
      summary.textContent = '';
      return;
    }
    const { id, node } = at;
    const c = this.chess();
    const fen = c.fen();
    const mover = c.turn();
    const [cp, mate, best, depth] = node.s ?? [];
    const sanOf = (u) => toItalian(new Chess(fen).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })?.san ?? u);
    this.$('#op-sf').textContent = best
      ? t('Stockfish (profondità {depth}): {score} · mossa migliore {move}', { depth, score: formatScore({ cp, mate }), move: sanOf(best) })
      : c.isCheckmate() ? t('Scacco matto') : t('Posizione finale: nessuna mossa');
    const st = this.statsOf(id);
    const rows = st ? st[1] : [];
    const popular = rows[0] ?? null;
    const band = CFG.ratingBands.find((b) => b.id === this.band);
    summary.textContent = popular ? t('Più giocata nella fascia {band}: {move}', { band: band.label, move: toItalian(popular[0]) }) : '';
    if (!this.$('#op-details').open) return; // il resto si prepara solo se i dettagli sono aperti
    this.$('#op-moves-note').textContent = st
      ? t('{n} partite nella fascia {band}', { n: st[0].toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-GB'), band: band.label })
      : t('Poche partite nella fascia {band}', { band: band.label });
    const items = [];
    for (const [san, uci, to] of node.c) {
      const child = await this.node(to);
      const row = rows.find((r) => normSan(r[0]) === normSan(san));
      const pct = row ? scoreFor(row, mover) : null;
      items.push(el('li', { className: 'op-move' },
        el('span', { className: 'op-move-san', textContent: toItalian(san) }),
        el('span', { className: 'op-move-name', textContent: child.n ? child.n[1] : '' }),
        el('span', { className: 'op-move-badges' },
          uci === best && el('span', { className: 'op-badge best', textContent: 'Stockfish' }),
          popular && normSan(popular[0]) === normSan(san) && el('span', { className: 'op-badge popular', textContent: t('Più giocata') })),
        el('span', { className: 'op-move-eval', textContent: child.s && (child.s[0] != null || child.s[1] != null) ? formatScore({ cp: child.s[0], mate: child.s[1] }) : /#/.test(san) ? '#' : '–' }),
        el('span', { className: 'op-move-games', textContent: row ? t('{n} partite', { n: row[1].toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-GB') }) : '' }),
        pct && this.resultBar(pct)));
    }
    if (s !== this.study) return;
    list.replaceChildren(...items);
    const extra = [];
    if (best && !node.c.some((e) => e[1] === best)) extra.push(t('Stockfish preferisce {move}, che non è nella teoria del dataset.', { move: sanOf(best) }));
    if (popular && !node.c.some((e) => normSan(e[0]) === normSan(popular[0]))) {
      extra.push(t('Nella fascia {band} la mossa più giocata è {move} ({n} partite), che non è nella teoria del dataset.', { band: band.label, move: toItalian(popular[0]), n: popular[1] }));
    }
    this.$('#op-extra').textContent = extra.join(' ');
    // Con i dettagli aperti, in Impara: freccia azzurra sulla mossa più giocata nella fascia
    if (popular && s.status === 'play' && this.mode === 'learn') {
      const mv = new Chess(fen).moves({ verbose: true }).find((x) => normSan(x.san) === normSan(popular[0]));
      if (mv) this.board.setArrows([...this.board.arrows.filter((a) => a.color !== ARROW_POPULAR.color), { from: mv.from, to: mv.to, ...ARROW_POPULAR }]);
    }
  }

  resultBar({ win, draw, loss }) {
    const bar = el('span', { className: 'op-bar', title: t('Vinte {w}% · patte {d}% · perse {l}% (per chi muove)', { w: Math.round(win), d: Math.round(draw), l: Math.round(loss) }) });
    for (const [cls, v] of [['win', win], ['draw', draw], ['loss', loss]]) {
      const s = el('i', { className: cls });
      s.style.width = `${v}%`; // da JS: la CSP non permette style="…" nell'HTML
      bar.append(s);
    }
    return bar;
  }

  /** Dal catalogo: ripasso di una variante studiata a caso (tra quelle non ancora imparate). */
  reviewAnyDue() {
    const due = reviewQueue(this.reps());
    if (!due.length) return;
    const r = due[Math.floor(Math.random() * due.length)];
    const o = this.opening(r.family) ?? this.openingOfPath(r.path.split(' '));
    if (!o) return;
    this.key = o.key;
    this.color = r.color;
    this.startStudy('review', r.path.split(' '));
  }

  /** Tastiera: Esc torna indietro di una schermata. */
  onKey(e) {
    if (e.key !== 'Escape' || this.screen === 'catalog') return;
    e.preventDefault();
    this.back();
  }
}
