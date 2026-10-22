// Sezione "Aperture": catalogo (gruppo → famiglia → variante), albero delle varianti navigabile, valutazioni e mossa
// consigliata di Stockfish (calcolate in anticipo da scripts/build-opening-tree.mjs), statistiche reali per fascia di
// punteggio Lichess (scripts/build-opening-stats.mjs) e ripasso delle varianti a scatole (come "I tuoi errori").

import { Chess } from '../../lib/chess.js';
import { formatScore } from '../engine/score.js';
import { UI_CONFIG } from '../config/ui.js';
import { GROUPS, normSan, scoreFor, trainingStep, repKey } from '../analysis/opening-tree.js';
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
  e.append(...children.filter((c) => c != null && c !== false));
  return e;
};
const ARROW_BEST = Object.freeze({ color: '#22c55e', width: 0.18, opacity: 0.9 });
const ARROW_POPULAR = Object.freeze({ color: '#60a5fa', width: 0.13, opacity: 0.75 });

export class OpeningsExplorer {
  /**
   * @param {HTMLElement} root vista #view-openings
   * @param {{ store: { get: (k:string, d:any)=>any, set: (k:string, v:any)=>void }, toast: (m:string)=>void,
   *   askPromotion: (color:string)=>Promise<string|null> }} deps
   */
  constructor(root, deps) {
    this.root = root;
    this.deps = deps;
    this.$ = (sel) => root.querySelector(sel);
    this.index = null;
    this.trees = new Map(); //  gruppo → Map(id → nodo)
    this.stats = new Map(); //  gruppo → Map(id → statistiche per fascia)
    this.ideas = null;
    this.loading = null;
    this.path = []; //          [{ id, uci, san }] dalla posizione iniziale
    this.group = deps.store.get('opGroup', 'e4');
    this.band = CFG.ratingBands.some((b) => b.id === deps.store.get('opBand', '')) ? deps.store.get('opBand', '') : 'b1400';
    this.color = deps.store.get('opColor', 'w') === 'b' ? 'b' : 'w';
    this.open = new Set(); //   famiglie aperte nel catalogo
    this.train = null; //      { name, path, color, i, failed, status }
    this.gen = 0;
    this.board = new Board(this.$('#op-board'), {
      canPick: (sq) => {
        if (this.train && this.train.status !== 'play') return false;
        const c = this.chess();
        const p = c.get(sq);
        return !!p && p.color === c.turn();
      },
      dests: (sq) => this.chess().moves({ square: sq, verbose: true }).map((m) => ({ to: m.to, capture: !!m.captured })),
      onMove: (from, to) => this.onUserMove(from, to),
    });
    this.$('#op-start').onclick = () => { if (!this.train) this.goPath([]); };
    this.$('#op-back').onclick = () => { if (!this.train) this.goPath(this.path.slice(0, -1)); };
    this.$('#op-flip').onclick = () => this.board.setOrientation(this.board.orientation === 'w' ? 'b' : 'w');
    this.$('#op-search').addEventListener('input', () => this.renderCatalog());
    this.$('#op-train-btn').onclick = () => this.startTraining(this.currentLine());
    this.$('#op-train-exit').onclick = () => this.stopTraining();
    this.$('#op-train-retry').onclick = () => this.retryTraining();
    this.$('#op-train-solution').onclick = () => this.showTrainingSolution();
    this.buildControls();
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
      })().catch(() => { this.loading = null; });
    }
    await this.loading;
    if (!this.index) {
      this.$('#op-families').replaceChildren(el('li', { className: 'hint', textContent: t('Non riesco a caricare le aperture. Controlla la connessione e riprova.') }));
      return;
    }
    this.renderCatalog();
    this.renderReps();
    await this.goPath(this.path);
  }

  /** Carica albero e statistiche di un gruppo (1.e4, 1.d4, 1.c4, altre) la prima volta che serve. */
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

  statsOf(id) {
    const row = this.stats.get(groupOfId(id))?.get(id);
    const i = CFG.ratingBands.findIndex((b) => b.id === this.band);
    return row?.[i] || null; // [totale, [[san, n, w, d, b]…]] oppure null (troppo poche partite)
  }

  // ---------- posizione ----------
  currentId() {
    return this.path.at(-1)?.id ?? 'root';
  }

  chess() {
    const c = new Chess();
    for (const p of this.path) playUci(c, p.uci);
    return c;
  }

  /** Va a una posizione dell'albero (percorso dalla posizione iniziale). */
  async goPath(path, animate = false) {
    const gen = ++this.gen;
    for (const p of path) await this.node(p.id);
    if (gen !== this.gen) return;
    this.path = path;
    const c = this.chess();
    const last = c.history({ verbose: true }).at(-1);
    this.board.setPosition(piecesOf(c), last ? { from: last.from, to: last.to } : null, checkSquareOf(c), animate);
    await this.renderPosition();
  }

  /** Percorso dei nodi dato un elenco di mosse UCI (dalla posizione iniziale). */
  async pathOf(ucis) {
    const out = [];
    let node = this.index.root;
    for (const uci of ucis) {
      const edge = node.c.find((e) => e[1] === uci);
      if (!edge) return null;
      out.push({ id: edge[2], uci, san: edge[0] });
      node = await this.node(edge[2]);
    }
    return out;
  }

  /** Apre la posizione con questa chiave (primi 4 campi della FEN), es. dal link in Analisi partita. */
  async openKey(key) {
    await this.show();
    for (const g of GROUPS) await this.loadGroup(g.id);
    // Visita in ampiezza: il primo percorso trovato (il più corto) verso la posizione
    const seen = new Set(['root']);
    const queue = [{ node: this.index.root, path: [] }];
    while (queue.length) {
      const { node, path } = queue.shift();
      if (node.k === key) return this.goPath(path);
      for (const [san, uci, to] of node.c) {
        if (seen.has(to)) continue;
        seen.add(to);
        queue.push({ node: await this.node(to), path: [...path, { id: to, uci, san }] });
      }
    }
    this.deps.toast(t('Posizione non presente nell\'albero delle aperture'));
  }

  async onUserMove(from, to) {
    const c = this.chess();
    const needsPromo = c.moves({ square: from, verbose: true }).some((m) => m.to === to && m.promotion);
    const promotion = needsPromo ? await this.deps.askPromotion(c.turn()) : undefined;
    if (needsPromo && !promotion) return this.goPath(this.path);
    const uci = from + to + (promotion ?? '');
    if (this.train) return this.onTrainingMove(uci);
    const node = await this.node(this.currentId());
    const edge = node.c.find((e) => e[1] === uci);
    if (!edge) {
      this.deps.toast(t('Mossa fuori dalla teoria del dataset'));
      return this.goPath(this.path);
    }
    return this.goPath([...this.path, { id: edge[2], uci, san: edge[0] }], true);
  }

  /** Variante con nome più vicina: quella della posizione, altrimenti la più avanzata lungo il percorso. */
  async namedAlong() {
    for (let i = this.path.length - 1; i >= 0; i--) {
      const n = await this.node(this.path[i].id);
      if (n.n) return { eco: n.n[0], name: n.n[1], depth: i + 1 };
    }
    return null;
  }

  /** Linea per il ripasso: il percorso attuale, con il nome della variante più vicina. */
  currentLine() {
    return { name: this.$('#op-name').textContent, path: this.path.map((p) => p.uci) };
  }

  // ---------- disegno ----------
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
      this.renderPosition();
    });
    const markColor = seg(this.$('#op-color'), [{ label: t('Bianco'), value: 'w' }, { label: t('Nero'), value: 'b' }], this.color, (v) => {
      this.color = v;
      this.deps.store.set('opColor', v);
      markColor(v);
    });
  }

  async renderPosition() {
    const id = this.currentId();
    const node = await this.node(id);
    const c = this.chess();
    const fen = c.fen();
    const mover = c.turn();
    const named = await this.namedAlong();
    this.$('#op-eco').textContent = named ? named.eco : '';
    this.$('#op-name').textContent = named ? named.name : t('Posizione iniziale');
    this.$('#op-path').textContent = this.pathText();

    // Idee dell'apertura (famiglia della variante più vicina)
    const family = named?.name.split(':')[0].trim();
    const idea = family && this.ideas?.families?.[family];
    const ideasBox = this.$('#op-ideas');
    ideasBox.hidden = !idea || !!this.train;
    if (idea) ideasBox.replaceChildren(...idea.text.map((p) => el('p', { textContent: p })));

    // Stockfish nella posizione
    const [cp, mate, best, depth] = node.s ?? [];
    const bestSan = best ? toItalian(new Chess(fen).move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] })?.san ?? best) : null;
    this.$('#op-sf').textContent = best
      ? t('Stockfish (profondità {depth}): {score} · mossa migliore {move}', { depth, score: formatScore({ cp, mate }), move: bestSan })
      : c.isCheckmate() ? t('Scacco matto') : t('Posizione finale: nessuna mossa');

    // Mosse dell'albero, con valutazione del ramo e statistiche della fascia
    const st = this.statsOf(id);
    const rows = st ? st[1] : [];
    const popular = rows[0] ?? null;
    const band = CFG.ratingBands.find((b) => b.id === this.band);
    this.$('#op-moves-note').textContent = st
      ? t('{n} partite nella fascia {band}', { n: st[0].toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-GB'), band: band.label })
      : t('Poche partite nella fascia {band}', { band: band.label });
    const list = this.$('#op-moves');
    const items = [];
    for (const [san, uci, to] of node.c) {
      const child = await this.node(to);
      const row = rows.find((r) => normSan(r[0]) === normSan(san));
      const pct = row ? scoreFor(row, mover) : null;
      const isBest = uci === best;
      const isPopular = popular && normSan(popular[0]) === normSan(san);
      const li = el('li', {},
        el('button', { type: 'button', className: 'op-move' },
          el('span', { className: 'op-move-san', textContent: toItalian(san) }),
          el('span', { className: 'op-move-name', textContent: child.n ? child.n[1] : '' }),
          el('span', { className: 'op-move-badges' },
            isBest && el('span', { className: 'op-badge best', textContent: t('Stockfish') }),
            isPopular && el('span', { className: 'op-badge popular', textContent: t('Più giocata') })),
          el('span', { className: 'op-move-eval', textContent: child.s && (child.s[0] != null || child.s[1] != null) ? formatScore({ cp: child.s[0], mate: child.s[1] }) : /#/.test(san) ? '#' : '–' }),
          el('span', { className: 'op-move-games', textContent: row ? t('{n} partite', { n: row[1].toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-GB') }) : '' }),
          pct && this.resultBar(pct)));
      li.firstChild.onclick = () => this.goPath([...this.path, { id: to, uci, san }], true);
      items.push(li);
    }
    list.replaceChildren(...items);
    this.$('#op-moves').hidden = !!this.train && this.train.status !== 'done';

    // Mossa migliore o più giocata fuori dall'albero del dataset
    const extra = [];
    if (best && !node.c.some((e) => e[1] === best)) extra.push(t('Stockfish preferisce {move}, che non è nella teoria del dataset.', { move: bestSan }));
    if (popular && !node.c.some((e) => normSan(e[0]) === normSan(popular[0]))) {
      extra.push(t('Nella fascia {band} la mossa più giocata è {move} ({n} partite), che non è nella teoria del dataset.', { band: band.label, move: toItalian(popular[0]), n: popular[1] }));
    }
    this.$('#op-extra').textContent = extra.join(' ');

    // Frecce: Stockfish (verde) e più giocata (azzurro)
    const arrows = [];
    if (best && !this.train) arrows.push({ from: best.slice(0, 2), to: best.slice(2, 4), ...ARROW_BEST });
    if (popular && !this.train) {
      const m = new Chess(fen).moves({ verbose: true }).find((x) => normSan(x.san) === normSan(popular[0]));
      if (m && m.from + m.to !== best?.slice(0, 4)) arrows.push({ from: m.from, to: m.to, ...ARROW_POPULAR });
    }
    this.board.setArrows(arrows);
    this.$('#op-train-start').hidden = !!this.train || !this.path.length;
    this.$('#op-catalog').hidden = !!this.train;
    this.$('#op-reps').hidden = !!this.train || !this.reps().length;
  }

  /** Barra dei risultati dal punto di vista di chi muove: vinte, patte, perse. */
  resultBar({ win, draw, loss }) {
    const bar = el('span', { className: 'op-bar', title: t('Vinte {w}% · patte {d}% · perse {l}% (per chi muove)', { w: Math.round(win), d: Math.round(draw), l: Math.round(loss) }) });
    for (const [cls, v] of [['win', win], ['draw', draw], ['loss', loss]]) {
      const s = el('i', { className: cls });
      s.style.width = `${v}%`; // da JS: la CSP non permette style="…" nell'HTML
      bar.append(s);
    }
    return bar;
  }

  pathText() {
    if (!this.path.length) return '';
    return this.path.map((p, i) => `${i % 2 === 0 ? `${i / 2 + 1}.` : ''}${toItalian(p.san)}`).join(' ');
  }

  renderCatalog() {
    if (!this.index) return;
    const q = fold(this.$('#op-search').value.trim());
    const chips = this.$('#op-groups');
    chips.replaceChildren(...GROUPS.map((g) => {
      const b = el('button', { type: 'button', className: `chip${g.id === this.group && !q ? ' active' : ''}`, textContent: g.label || t('Altre') });
      b.onclick = () => {
        this.group = g.id;
        this.deps.store.set('opGroup', g.id);
        this.$('#op-search').value = '';
        this.renderCatalog();
      };
      return b;
    }));
    // Con la ricerca si cerca in tutti i gruppi (nome della famiglia o della variante, senza accenti)
    // Termini cercati: il testo scritto e, se corrisponde a un nome italiano comune, il nome inglese del dataset
    const terms = q ? [q, ...Object.entries(CFG.searchAliases).filter(([it]) => it.includes(q) || q.includes(it)).map(([, en]) => en)] : [];
    const hit = (s) => terms.some((x) => fold(s).includes(x));
    const families = this.index.families.filter((f) => (q ? hit(f.name) || f.variations.some((v) => hit(v.full)) : f.group === this.group));
    this.$('#op-count').textContent = t('{n} famiglie', { n: families.length });
    this.$('#op-families').replaceChildren(...families.map((f) => {
      const open = this.open.has(f.name) || (q && !hit(f.name));
      const vars = q && !hit(f.name) ? f.variations.filter((v) => hit(v.full)) : f.variations;
      const head = el('button', { type: 'button', className: 'op-family-head', ariaExpanded: String(!!open) },
        el('span', { className: 'op-family-name', textContent: f.name }),
        el('span', { className: 'op-family-count', textContent: `${f.eco} · ${vars.length}` }));
      head.onclick = () => {
        if (this.open.has(f.name)) this.open.delete(f.name);
        else this.open.add(f.name);
        this.renderCatalog();
      };
      const li = el('li', { className: 'op-family' }, head);
      if (open) {
        li.append(el('ul', { className: 'op-vars' }, ...vars.map((v) => {
          const go = el('button', { type: 'button', className: 'op-var', textContent: v.name || t('Linea principale') });
          go.onclick = async () => {
            const p = await this.pathOf(v.path.split(' '));
            if (p) {
              await this.goPath(p); // salto a una posizione lontana: niente animazione (si muoverebbero tutti i pezzi insieme)
              this.root.querySelector('#op-pos').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
          };
          return el('li', {}, go, el('span', { className: 'op-var-eco', textContent: v.eco }));
        })));
      }
      return li;
    }));
  }

  // ---------- ripasso delle varianti ----------
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

  renderReps() {
    const list = this.reps();
    const queue = reviewQueue(list);
    this.$('#op-reps-count').textContent = t('{n} da ripassare', { n: queue.length });
    this.$('#op-rep-list').replaceChildren(...list
      .sort((a, b) => (a.box >= LEARNED_BOX) - (b.box >= LEARNED_BOX) || a.box - b.box || a.addedAt - b.addedAt)
      .map((r) => {
        const b = el('button', { type: 'button', className: 'op-rep' },
          el('span', { className: 'op-rep-name', textContent: r.name }),
          el('span', { className: 'op-rep-meta', textContent: `${t(r.color === 'w' ? 'Bianco' : 'Nero')} · ${r.box >= LEARNED_BOX ? t('imparata') : t('{n} di {max}', { n: r.box, max: LEARNED_BOX })}` }));
        b.onclick = () => this.startTraining({ name: r.name, path: r.path.split(' ') }, r.color);
        return el('li', {}, b);
      }));
    this.$('#op-reps').hidden = !!this.train || !list.length;
  }

  /** Inizia il ripasso di una variante: l'app gioca le mosse dell'avversario, tu trovi le tue. */
  async startTraining(line, color = this.color) {
    if (!line.path.length) return;
    const list = this.reps();
    const id = repKey(line.path, color);
    if (!list.some((r) => r.id === id)) {
      list.push({ id, name: line.name, color, path: line.path.join(' '), box: 0, tries: 0, addedAt: Date.now() });
      this.saveReps(list);
    }
    this.train = { id, name: line.name, path: line.path, color, i: 0, failed: false, status: 'app', wrong: null };
    this.board.setOrientation(color);
    await this.goPath([]);
    this.renderTraining();
    this.advanceTraining();
  }

  /** Gioca le mosse dell'avversario finché non tocca a chi si allena (o la variante finisce). */
  async advanceTraining() {
    const tr = this.train;
    while (tr === this.train) {
      const step = trainingStep(tr.path, tr.color, tr.i);
      if (step.who === 'done') return this.finishTraining();
      if (step.who === 'user') {
        tr.status = 'play';
        return this.renderTraining();
      }
      tr.status = 'app';
      this.renderTraining();
      await sleep(UI_CONFIG.puzzles.replyDelayMs);
      if (tr !== this.train) return;
      await this.playTrainingMove(step.uci);
    }
  }

  async playTrainingMove(uci) {
    const tr = this.train;
    const node = await this.node(this.currentId());
    const edge = node.c.find((e) => e[1] === uci);
    tr.i++;
    await this.goPath([...this.path, { id: edge[2], uci, san: edge[0] }], true);
  }

  async onTrainingMove(uci) {
    const tr = this.train;
    if (tr.status !== 'play') return;
    const expected = tr.path[tr.i];
    if (uci === expected) {
      await this.playTrainingMove(uci);
      return this.advanceTraining();
    }
    // Mossa diversa: resta la posizione di prima; si dice se la mossa è almeno nell'albero e come la valuta Stockfish
    tr.failed = true;
    const node = await this.node(this.currentId());
    const edge = node.c.find((e) => e[1] === uci);
    const child = edge ? await this.node(edge[2]) : null;
    const san = new Chess(this.chess().fen()).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })?.san ?? uci;
    tr.wrong = { san: toItalian(san), inTree: !!edge, score: child?.s ? formatScore({ cp: child.s[0], mate: child.s[1] }) : null };
    tr.status = 'wrong';
    await this.goPath(this.path);
    this.renderTraining();
  }

  retryTraining() {
    if (this.train?.status !== 'wrong') return;
    this.train.status = 'play';
    this.train.wrong = null;
    this.renderTraining();
  }

  async showTrainingSolution() {
    const tr = this.train;
    if (!tr || !['play', 'wrong'].includes(tr.status)) return;
    tr.failed = true;
    tr.wrong = null;
    await this.playTrainingMove(tr.path[tr.i]);
    this.advanceTraining();
  }

  finishTraining() {
    const tr = this.train;
    tr.status = 'done';
    const list = this.reps().map((r) => (r.id === tr.id ? recordResult(r, !tr.failed) : r));
    this.saveReps(list);
    tr.box = list.find((r) => r.id === tr.id)?.box ?? 0;
    this.renderTraining();
    this.renderReps();
  }

  stopTraining() {
    this.train = null;
    this.$('#op-train').hidden = true;
    this.renderReps();
    this.renderPosition();
  }

  renderTraining() {
    const tr = this.train;
    const box = this.$('#op-train');
    box.hidden = !tr;
    if (!tr) return;
    this.$('#op-train-meta').textContent = `${t('Ripasso')} · ${t(tr.color === 'w' ? 'Bianco' : 'Nero')} · ${tr.name}`;
    const card = box;
    card.dataset.state = tr.status === 'wrong' ? 'wrong' : tr.status === 'done' ? (tr.failed ? 'done' : 'solved') : '';
    const titles = {
      app: t('Mossa dell\'avversario…'),
      play: t('Tocca a te: gioca la mossa della variante'),
      wrong: t('Non è la mossa della variante'),
      done: tr.failed ? t('Variante completata') : t('Variante completata senza errori!'),
    };
    this.$('#op-train-title').textContent = titles[tr.status];
    const fb = this.$('#op-train-feedback');
    fb.replaceChildren();
    const para = (text, cls = '') => fb.append(el('p', { textContent: text, className: cls }));
    para(t('Mossa {n} di {total} della variante', { n: Math.min(tr.i + 1, tr.path.length), total: tr.path.length }), 'pz-note');
    if (tr.status === 'wrong') {
      para(tr.wrong.inTree
        ? t('{move} è un\'altra continuazione del dataset (Stockfish: {score}), ma non quella di questa variante.', { move: tr.wrong.san, score: tr.wrong.score ?? '–' })
        : t('{move} non è nella teoria del dataset.', { move: tr.wrong.san }));
    }
    if (tr.status === 'done') {
      para(tr.failed ? t('Ripassala ancora per fissarla.') : tr.box >= LEARNED_BOX ? t('Imparata! Esce dal ripasso.') : t('Risposte giuste di fila: {n} di {max}.', { n: tr.box, max: LEARNED_BOX }), 'pz-note');
    }
    this.$('#op-train-retry').hidden = tr.status !== 'wrong';
    this.$('#op-train-solution').hidden = !['play', 'wrong'].includes(tr.status);
    this.$('#op-train-exit').textContent = tr.status === 'done' ? t('Chiudi il ripasso') : t('Esci dal ripasso');
    this.renderPosition();
  }

  /** Tastiera: ← indietro (fuori dal ripasso). */
  onKey(e) {
    if (this.train || e.key !== 'ArrowLeft') return;
    e.preventDefault();
    this.goPath(this.path.slice(0, -1));
  }
}

