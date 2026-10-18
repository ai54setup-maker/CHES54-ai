// Stockfish in un Web Worker, con analisi MultiPV.
// Gestisce le richieste in sequenza: se arriva una nuova posizione mentre il motore
// sta ancora pensando, invia "stop" e riparte appena arriva il "bestmove" precedente.

export class Engine {
  constructor(url) {
    this.worker = new Worker(url);
    this.worker.onmessage = (e) => this.onLine(String(e.data));
    this.worker.onerror = (e) => this.onError?.(e);
    this.ready = false;
    this.searching = false;
    this.job = null;       // analisi in corso
    this.pending = null;   // prossima analisi in attesa
    this.multipv = 0;
    this.send('uci');
  }

  send(cmd) {
    this.worker.postMessage(cmd);
  }

  /**
   * Analizza una posizione.
   * @param {string} fen
   * @param {{ depth:number, multipv:number }} opts
   * @param {(lines:Array<{multipv:number, depth:number, cp:number|null, mate:number|null, pv:string[]}>, done:boolean)=>void} onUpdate
   */
  analyze(fen, opts, onUpdate) {
    this.pending = { fen, target: opts.depth, multipv: opts.multipv, onUpdate, lines: new Map() };
    if (this.searching) this.send('stop');
    else this.startPending();
  }

  stop() {
    this.pending = null;
    if (this.searching) this.send('stop');
  }

  startPending() {
    if (!this.ready || !this.pending) return;
    this.job = this.pending;
    this.pending = null;
    if (this.multipv !== this.job.multipv) {
      this.send(`setoption name MultiPV value ${this.job.multipv}`);
      this.multipv = this.job.multipv;
    }
    this.send(`position fen ${this.job.fen}`);
    this.send(`go depth ${this.job.target}`);
    this.searching = true;
  }

  onLine(line) {
    if (line === 'uciok') {
      this.send('setoption name Hash value 32');
      this.send('isready');
      return;
    }
    if (line === 'readyok') {
      this.ready = true;
      this.onReady?.();
      this.startPending();
      return;
    }
    if (line.startsWith('bestmove')) {
      this.searching = false;
      const job = this.job;
      this.job = null;
      if (this.pending) this.startPending();
      else if (job) job.onUpdate(this.sorted(job), true);
      return;
    }
    if (!line.startsWith('info') || !this.job || this.pending) return;
    if (!line.includes(' pv ') || !line.includes(' score ')) return;

    const t = line.split(' ');
    const get = (key) => {
      const i = t.indexOf(key);
      return i >= 0 ? t[i + 1] : undefined;
    };
    const depth = Number(get('depth'));
    const multipv = Number(get('multipv') ?? 1);
    const si = t.indexOf('score');
    const kind = t[si + 1];
    const val = Number(t[si + 2]);
    if (t[si + 3] === 'lowerbound' || t[si + 3] === 'upperbound') return;
    const pv = t.slice(t.indexOf('pv') + 1);

    const job = this.job;
    job.lines.set(multipv, {
      multipv,
      depth,
      cp: kind === 'cp' ? val : null,
      mate: kind === 'mate' ? val : null,
      pv,
    });
    // Aggiorna l'interfaccia quando tutte le linee hanno raggiunto la stessa profondità.
    const lines = this.sorted(job);
    if (lines.length && lines.every((l) => l.depth === depth)) job.onUpdate(lines, false);
  }

  sorted(job) {
    return [...job.lines.values()].sort((a, b) => a.multipv - b.multipv);
  }
}
