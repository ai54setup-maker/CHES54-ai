// Stockfish tramite protocollo UCI, con MultiPV, coda di richieste e cache.
//
// Il motore gira fuori dal thread dell'interfaccia: in un Web Worker nel browser, in un
// processo figlio nei test Node. Questa classe non sa quale dei due: parla con un
// "transport" che ha solo send(), onLine(), onError() e terminate().
//
// Una ricerca alla volta: le richieste vanno in coda e ognuna restituisce una Promise.
// cancelAll() svuota la coda e ferma la ricerca in corso (utile quando l'utente cambia posizione).

import { ENGINE_CONFIG } from '../config/engine.js';
import { parseInfoLine, parseBestMoveLine, isCompleteLine } from './uci-parser.js';
import { toWhitePov } from './score.js';
import { AnalysisCache } from './cache.js';

/**
 * @typedef {Object} EngineLine
 * @property {number} multipv   1 = linea migliore
 * @property {number} depth
 * @property {import('./score.js').Score} score  punto di vista del Bianco
 * @property {string[]} pv      variante in formato UCI
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string} fen
 * @property {'w'|'b'} sideToMove
 * @property {number} depth          profondità raggiunta da tutte le linee (la minima)
 * @property {number} multiPv        linee richieste
 * @property {import('./cache.js').AnalysisRequest} request
 * @property {EngineLine[]} lines    ordinate per multipv; vuote se non ci sono mosse legali
 * @property {string|null} bestMove
 * @property {boolean} done          false negli aggiornamenti parziali
 * @property {boolean} fromCache
 */

/**
 * @typedef {Object} Transport
 * @property {(cmd: string) => void} send
 * @property {(cb: (line: string) => void) => void} onLine
 * @property {(cb: (err: unknown) => void) => void} onError
 * @property {() => void} terminate
 */

export class AnalysisCancelled extends Error {
  constructor() {
    super('Analisi annullata');
    this.name = 'AnalysisCancelled';
  }
}

/**
 * Transport per il browser: Stockfish in un Web Worker.
 * @param {string} url
 * @returns {Transport}
 */
export function workerTransport(url) {
  const worker = new Worker(url);
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (cb) => { worker.onmessage = (e) => cb(String(e.data)); },
    onError: (cb) => { worker.onerror = cb; },
    terminate: () => worker.terminate(),
  };
}

/**
 * @param {import('./cache.js').AnalysisRequest} req
 */
export function goCommand(req) {
  let cmd = 'go';
  if (req.depth != null) cmd += ` depth ${req.depth}`;
  if (req.movetimeMs != null) cmd += ` movetime ${req.movetimeMs}`;
  if (cmd === 'go') throw new RangeError('Serve almeno uno tra profondità e tempo per mossa');
  return cmd;
}

export class Engine {
  /**
   * @param {Transport} transport
   * @param {typeof ENGINE_CONFIG} [config]
   */
  constructor(transport, config = ENGINE_CONFIG) {
    this.transport = transport;
    this.config = config;
    this.cache = new AnalysisCache(config.cacheSize);
    this.queue = [];
    this.job = null;
    this.multiPv = null; // valore di MultiPV attualmente impostato nel motore
    this.isReady = false;
    this.error = null;
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.ready.catch(() => { /* gestito da chi attende ready o analyze() */ });

    transport.onLine((line) => this.onLine(line));
    transport.onError((err) => this.fail(err));
    transport.send('uci');
  }

  /** Stockfish in un Web Worker (browser). */
  static inWorker(url = ENGINE_CONFIG.workerUrl, config = ENGINE_CONFIG) {
    return new Engine(workerTransport(url), config);
  }

  /**
   * Analizza una posizione. Le richieste vengono eseguite in ordine.
   * @param {string} fen
   * @param {{ depth?: number|null, multiPv?: number, movetimeMs?: number|null, exactCache?: boolean,
   *           onUpdate?: (partial: AnalysisResult) => void }} [opts]
   *        exactCache: dalla cache solo risultati con le stesse identiche impostazioni
   * @returns {Promise<AnalysisResult>}
   */
  analyze(fen, opts = {}) {
    if (this.error) return Promise.reject(this.error);
    const req = {
      depth: opts.depth !== undefined ? opts.depth : this.config.defaultDepth,
      multiPv: opts.multiPv ?? this.config.multiPv,
      movetimeMs: opts.movetimeMs !== undefined ? opts.movetimeMs : this.config.movetimeMs,
    };
    if (!Number.isInteger(req.multiPv) || req.multiPv < 1 || req.multiPv > this.config.maxMultiPv) {
      return Promise.reject(new RangeError(`MultiPV deve essere tra 1 e ${this.config.maxMultiPv}`));
    }
    try {
      goCommand(req);
    } catch (err) {
      return Promise.reject(err);
    }
    const cacheOpts = { exact: !!opts.exactCache };
    const cached = this.cache.get(fen, req, cacheOpts);
    if (cached) return Promise.resolve({ ...cached, fromCache: true });

    return new Promise((resolve, reject) => {
      this.queue.push({ fen, req, cacheOpts, onUpdate: opts.onUpdate, resolve, reject, lines: new Map(), cancelled: false });
      this.pump();
    });
  }

  /**
   * Svuota la memoria del motore (tabella delle trasposizioni) con "ucinewgame".
   * Da chiamare prima di analizzare una partita: così lo stesso input dà lo stesso risultato,
   * indipendentemente dalle posizioni analizzate prima. Viene eseguito in coda, dopo le richieste già inviate.
   * @returns {Promise<void>}
   */
  newGame() {
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => {
      this.queue.push({ kind: 'command', cmds: ['ucinewgame'], resolve, reject });
      this.pump();
    });
  }

  /**
   * Imposta opzioni UCI (es. "Skill Level" per giocare contro il motore), in coda come newGame().
   * Svuota la cache: i risultati ottenuti con le opzioni precedenti non valgono più.
   * @param {Record<string, string|number|boolean>} options
   * @returns {Promise<void>}
   */
  setOptions(options) {
    if (this.error) return Promise.reject(this.error);
    this.cache = new AnalysisCache(this.config.cacheSize);
    const cmds = Object.entries(options).map(([name, value]) => `setoption name ${name} value ${value}`);
    return new Promise((resolve, reject) => {
      this.queue.push({ kind: 'command', cmds, resolve, reject });
      this.pump();
    });
  }

  /** Annulla tutte le richieste in coda e ferma la ricerca in corso. */
  cancelAll() {
    for (const job of this.queue.splice(0)) job.reject(new AnalysisCancelled());
    if (this.job && !this.job.cancelled && this.job.kind !== 'command') {
      this.job.cancelled = true;
      this.transport.send('stop');
    }
  }

  terminate() {
    this.cancelAll();
    this.transport.send('quit');
    this.transport.terminate();
  }

  // ---------- interno ----------

  pump() {
    if (!this.isReady || this.job) return;
    while (this.queue.length) {
      const job = this.queue.shift();
      if (job.kind === 'command') {
        this.job = job;
        for (const cmd of job.cmds) this.transport.send(cmd);
        this.transport.send('isready'); // il motore risponde "readyok" quando ha finito
        return;
      }
      // Una richiesta precedente in coda potrebbe aver già analizzato la stessa posizione.
      const cached = this.cache.get(job.fen, job.req, job.cacheOpts);
      if (cached) {
        job.resolve({ ...cached, fromCache: true });
        continue;
      }
      this.job = job;
      if (this.multiPv !== job.req.multiPv) {
        this.transport.send(`setoption name MultiPV value ${job.req.multiPv}`);
        this.multiPv = job.req.multiPv;
      }
      this.transport.send(`position fen ${job.fen}`);
      this.transport.send(goCommand(job.req));
      return;
    }
  }

  /** @param {string} line */
  onLine(line) {
    if (line === 'uciok') {
      this.transport.send(`setoption name Hash value ${this.config.hashMb}`);
      this.transport.send('isready');
      return;
    }
    if (line === 'readyok') {
      if (!this.isReady) {
        this.isReady = true;
        this.resolveReady();
        this.pump();
      } else if (this.job?.kind === 'command') {
        const job = this.job;
        this.job = null;
        job.resolve();
        this.pump();
      }
      return;
    }

    const best = parseBestMoveLine(line);
    if (best) {
      const job = this.job;
      this.job = null;
      if (job) {
        if (job.cancelled) {
          job.reject(new AnalysisCancelled());
        } else {
          const result = this.buildResult(job, best.bestMove, true);
          this.cache.set(job.fen, result);
          job.resolve(result);
        }
      }
      this.pump();
      return;
    }

    const job = this.job;
    if (!job || job.cancelled || job.kind === 'command') return;
    const info = parseInfoLine(line);
    if (!isCompleteLine(info)) return;
    job.lines.set(info.multipv, {
      multipv: info.multipv,
      depth: info.depth,
      score: toWhitePov(info.score, sideOf(job.fen)),
      pv: info.pv,
    });
    // Aggiornamento parziale quando tutte le linee hanno raggiunto la stessa profondità.
    if (job.onUpdate && [...job.lines.values()].every((l) => l.depth === info.depth)) {
      job.onUpdate(this.buildResult(job, null, false));
    }
  }

  /** @returns {AnalysisResult} */
  buildResult(job, bestMove, done) {
    const lines = [...job.lines.values()].sort((a, b) => a.multipv - b.multipv);
    return {
      fen: job.fen,
      sideToMove: sideOf(job.fen),
      depth: lines.length ? Math.min(...lines.map((l) => l.depth)) : 0,
      multiPv: job.req.multiPv,
      request: job.req,
      lines,
      bestMove: bestMove ?? lines[0]?.pv[0] ?? null,
      done,
      fromCache: false,
    };
  }

  fail(err) {
    this.error = err instanceof Error ? err : new Error('Il motore non si è avviato');
    this.rejectReady(this.error);
    const jobs = this.job ? [this.job, ...this.queue] : this.queue;
    for (const job of jobs) job.reject(this.error);
    this.job = null;
    this.queue = [];
  }
}

/** @param {string} fen */
function sideOf(fen) {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}
