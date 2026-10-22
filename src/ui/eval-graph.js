// Grafico della valutazione lungo la partita (win% del Bianco), cliccabile per saltare a una mossa.

const W = 1000; // larghezza del sistema di coordinate dell'SVG (si adatta al contenitore)
const H = 100; //  altezza = 100 punti di win%

export class EvalGraph {
  /**
   * @param {HTMLElement} el
   * @param {{ onSelect: (positionIndex: number) => void }} opts
   */
  constructor(el, opts) {
    this.el = el;
    this.opts = opts;
    this.n = 0;
    el.classList.add('graph');
    el.tabIndex = 0;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Grafico della valutazione: tocca per andare a una mossa');
    el.addEventListener('pointerdown', (e) => this.pick(e));
    el.addEventListener('pointermove', (e) => { if (e.buttons) this.pick(e); });
  }

  /**
   * @param {number[]} whiteWin  win% del Bianco per ogni posizione (indice 0 = posizione iniziale)
   * @param {{ index: number, cls: string }[]} marks  segni colorati (indice di posizione)
   */
  setData(whiteWin, marks) {
    this.n = whiteWin.length;
    if (!this.n) {
      // Nessuna posizione ancora valutata (analisi partita appena iniziata)
      this.el.innerHTML = '';
      this.cursorEl = null;
      return;
    }
    const x = (i) => (this.n > 1 ? (i / (this.n - 1)) * W : W / 2);
    const y = (v) => H - v;
    const pts = whiteWin.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(2)}`).join(' L');
    this.el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <rect width="${W}" height="${H}" class="graph-black"/>
        <path d="M0,${H} L${pts} L${W},${H} Z" class="graph-white"/>
        <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="graph-mid" vector-effect="non-scaling-stroke"/>
        <path d="M${pts}" class="graph-line" fill="none" vector-effect="non-scaling-stroke"/>
        <line class="graph-cursor" y1="0" y2="${H}" vector-effect="non-scaling-stroke"/>
      </svg>
      ${marks.map((m) => `<span class="graph-dot dot-${m.cls}"></span>`).join('')}`;
    // Posizione dei pallini impostata da JS (la CSP del sito non permette style="…" nell'HTML)
    this.el.querySelectorAll('.graph-dot').forEach((dot, k) => {
      const m = marks[k];
      dot.style.left = `${(x(m.index) / W) * 100}%`;
      dot.style.top = `${(y(whiteWin[m.index]) / H) * 100}%`;
    });
    this.cursorEl = this.el.querySelector('.graph-cursor');
  }

  setCursor(i) {
    if (!this.cursorEl) return;
    const cx = this.n > 1 ? (i / (this.n - 1)) * W : W / 2;
    this.cursorEl.setAttribute('x1', cx);
    this.cursorEl.setAttribute('x2', cx);
  }

  pick(e) {
    if (this.n < 1) return;
    const rect = this.el.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    this.opts.onSelect(Math.round(t * (this.n - 1)));
  }
}
