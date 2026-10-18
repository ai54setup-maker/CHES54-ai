// Scacchiera interattiva: rendering, drag & drop, click-click, frecce e animazioni.

const FILES = 'abcdefgh';

export class Board {
  /**
   * @param {HTMLElement} el
   * @param {{ canPick: (sq:string)=>boolean, dests: (sq:string)=>Array<{to:string,capture:boolean}>, onMove: (from:string,to:string)=>void }} opts
   */
  constructor(el, opts) {
    this.el = el;
    this.opts = opts;
    this.orientation = 'w';
    this.position = [];      // [{ square, type, color }]
    this.lastMove = null;    // { from, to }
    this.checkSquare = null;
    this.arrows = [];        // [{ from, to, color, width, opacity, dashed }]
    this.badge = null;       // { square, html }: icona sulla casa (es. classificazione della mossa)
    this.selected = null;
    this.drag = null;

    el.innerHTML = '';
    this.squaresEl = document.createElement('div');
    this.squaresEl.className = 'squares';
    this.piecesEl = document.createElement('div');
    this.piecesEl.className = 'pieces';
    this.arrowsEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.arrowsEl.setAttribute('class', 'arrows');
    this.arrowsEl.setAttribute('viewBox', '0 0 8 8');
    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'badge';
    el.append(this.squaresEl, this.piecesEl, this.arrowsEl, this.badgeEl);

    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onDragMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', () => this.cancelDrag());
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.renderSquares();
  }

  // ---------- coordinate ----------
  toXY(square) {
    const f = FILES.indexOf(square[0]);
    const r = Number(square[1]) - 1;
    return this.orientation === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  }
  fromXY(x, y) {
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return this.orientation === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
  }
  squareAtEvent(e) {
    const rect = this.el.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 8);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 8);
    return this.fromXY(x, y);
  }

  // ---------- API pubblica ----------
  setOrientation(color) {
    this.orientation = color;
    this.renderSquares();
    this.renderPieces(false);
    this.renderArrows();
    this.renderBadge();
  }

  setPosition(position, lastMove, checkSquare, animate = true) {
    const prev = this.position;
    this.position = position;
    this.lastMove = lastMove;
    this.checkSquare = checkSquare;
    this.selected = null;
    this.renderSquares();
    this.renderPieces(animate && !this.skipAnim, prev);
    this.skipAnim = false;
  }

  setArrows(arrows) {
    this.arrows = arrows;
    this.renderArrows();
  }

  /** @param {{ square: string, html: string } | null} badge */
  setBadge(badge) {
    this.badge = badge;
    this.renderBadge();
  }

  renderBadge() {
    if (!this.badge) {
      this.badgeEl.hidden = true;
      return;
    }
    const { x, y } = this.toXY(this.badge.square);
    this.badgeEl.hidden = false;
    this.badgeEl.innerHTML = this.badge.html;
    // In alto a destra della casa
    this.badgeEl.style.left = `${(x + 1) * 12.5}%`;
    this.badgeEl.style.top = `${y * 12.5}%`;
  }

  // ---------- rendering ----------
  renderSquares() {
    const dests = this.selected ? this.opts.dests(this.selected) : [];
    const frag = document.createDocumentFragment();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const sq = this.fromXY(x, y);
        const d = document.createElement('div');
        const fileIdx = FILES.indexOf(sq[0]);
        const rank = Number(sq[1]);
        d.className = 'sq ' + ((fileIdx + rank) % 2 === 1 ? 'light' : 'dark');
        if (this.lastMove && (sq === this.lastMove.from || sq === this.lastMove.to)) d.classList.add('last');
        if (sq === this.selected) d.classList.add('sel');
        if (sq === this.checkSquare) d.classList.add('check');
        const dest = dests.find((m) => m.to === sq);
        if (dest) d.classList.add('dest', ...(dest.capture ? ['capture'] : []));
        if (y === 7) d.insertAdjacentHTML('beforeend', `<span class="coord file">${sq[0]}</span>`);
        if (x === 0) d.insertAdjacentHTML('beforeend', `<span class="coord rank">${sq[1]}</span>`);
        frag.append(d);
      }
    }
    this.squaresEl.replaceChildren(frag);
  }

  placeEl(el, square) {
    const { x, y } = this.toXY(square);
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
  }

  renderPieces(animate, prev = []) {
    const frag = document.createDocumentFragment();
    const animations = [];
    for (const p of this.position) {
      const el = document.createElement('div');
      el.className = 'piece';
      el.dataset.square = p.square;
      el.style.backgroundImage = `url(pieces/${p.color}${p.type.toUpperCase()}.svg)`;
      // Per il pezzo appena mosso parte dalla casa di origine e scivola fino a destinazione.
      let from = null;
      if (animate && this.lastMove) {
        if (p.square === this.lastMove.to) from = this.lastMove.from;
        else if (!prev.some((q) => q.square === p.square && q.type === p.type && q.color === p.color)) {
          // Torre dell'arrocco: cerca un pezzo uguale sparito dalla posizione precedente.
          const gone = prev.find((q) => q.type === p.type && q.color === p.color &&
            !this.position.some((n) => n.square === q.square && n.type === q.type && n.color === q.color));
          if (gone) from = gone.square;
        }
      }
      this.placeEl(el, from || p.square);
      if (from) animations.push([el, p.square]);
      frag.append(el);
    }
    this.piecesEl.replaceChildren(frag);
    if (animations.length) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        for (const [el, sq] of animations) {
          el.classList.add('anim');
          this.placeEl(el, sq);
        }
      }));
    }
  }

  renderArrows() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = this.arrowsEl;
    svg.replaceChildren();
    // Disegna prima le frecce secondarie, così la migliore resta sopra.
    for (const a of [...this.arrows].reverse()) {
      const s = this.toXY(a.from);
      const t = this.toXY(a.to);
      const x1 = s.x + 0.5, y1 = s.y + 0.5, x2 = t.x + 0.5, y2 = t.y + 0.5;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (!len) continue;
      const ux = dx / len, uy = dy / len;
      const w = a.width ?? 0.16;
      const head = w * 2.6;
      const sx = x1 + ux * 0.25, sy = y1 + uy * 0.25;      // parte un po' fuori dal centro
      const ex = x2 - ux * head, ey = y2 - uy * head;       // fine del corpo
      const nx = -uy, ny = ux;
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('opacity', a.opacity ?? 0.85);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', sx); line.setAttribute('y1', sy);
      line.setAttribute('x2', ex); line.setAttribute('y2', ey);
      line.setAttribute('stroke', a.color);
      line.setAttribute('stroke-width', w);
      line.setAttribute('stroke-linecap', 'round');
      if (a.dashed) line.setAttribute('stroke-dasharray', `${w * 1.2} ${w * 0.9}`);
      const poly = document.createElementNS(ns, 'polygon');
      const hw = head * 0.6;
      poly.setAttribute('points', [
        `${x2 - ux * 0.08},${y2 - uy * 0.08}`,
        `${ex + nx * hw},${ey + ny * hw}`,
        `${ex - nx * hw},${ey - ny * hw}`,
      ].join(' '));
      poly.setAttribute('fill', a.color);
      g.append(line, poly);
      svg.append(g);
    }
  }

  // ---------- interazione ----------
  select(sq) {
    this.selected = sq;
    this.renderSquares();
  }

  tryMove(from, to, viaDrag = false) {
    const ok = this.opts.dests(from).some((m) => m.to === to);
    this.select(null);
    // Dopo un trascinamento il pezzo è già sulla casa: niente animazione di scivolamento.
    this.skipAnim = ok && viaDrag;
    if (ok) this.opts.onMove(from, to);
    return ok;
  }

  onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const sq = this.squareAtEvent(e);
    if (!sq) return;

    // Secondo tocco del click-click
    if (this.selected && sq !== this.selected && this.opts.dests(this.selected).some((m) => m.to === sq)) {
      this.tryMove(this.selected, sq);
      return;
    }
    if (!this.opts.canPick(sq)) {
      this.select(null);
      return;
    }
    const pieceEl = this.piecesEl.querySelector(`.piece[data-square="${sq}"]`);
    if (!pieceEl) return;
    const wasSelected = this.selected === sq;
    this.select(sq);
    this.el.setPointerCapture(e.pointerId);
    this.drag = { from: sq, el: pieceEl, wasSelected, moved: false, startX: e.clientX, startY: e.clientY };
  }

  onDragMove(e) {
    if (!this.drag) return;
    const d = this.drag;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    const rect = this.el.getBoundingClientRect();
    const size = rect.width / 8;
    const px = e.clientX - rect.left - size / 2;
    const py = e.clientY - rect.top - size / 2;
    d.el.classList.remove('anim');
    d.el.classList.add('dragging');
    d.el.style.transform = `translate(${px}px, ${py}px)`;
  }

  onUp(e) {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    d.el.classList.remove('dragging');
    const sq = this.squareAtEvent(e);
    if (d.moved) {
      if (sq && sq !== d.from && this.tryMove(d.from, sq, true)) return;
      this.placeEl(d.el, d.from);
      if (sq !== d.from) this.select(null);
    } else if (d.wasSelected) {
      this.select(null); // secondo tocco sullo stesso pezzo: deseleziona
    }
  }

  cancelDrag() {
    if (!this.drag) return;
    this.drag.el.classList.remove('dragging');
    this.placeEl(this.drag.el, this.drag.from);
    this.drag = null;
  }
}
