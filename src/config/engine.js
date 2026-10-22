// Parametri del motore: unico posto dove cambiarli.

export const ENGINE_CONFIG = Object.freeze({
  // Percorso dello script di Stockfish (relativo a index.html).
  workerUrl: 'engine/stockfish.js',

  // Memoria della tabella delle trasposizioni, in MB. La build "lite" WASM regge bene 16–64 MB.
  hashMb: 32,

  // N: quante linee (mosse migliori) chiedere al motore con MultiPV.
  multiPv: 3,
  multiPvOptions: Object.freeze([1, 3, 5]),
  maxMultiPv: 5,

  // Profondità di ricerca (in semimosse) e tempo massimo per posizione.
  // Se sono impostati entrambi, il motore si ferma al primo dei due limiti raggiunto.
  defaultDepth: 16,
  movetimeMs: null, // null = nessun limite di tempo
  depthPresets: Object.freeze([
    Object.freeze({ id: 'fast', label: 'Veloce', depth: 12 }),
    Object.freeze({ id: 'normal', label: 'Normale', depth: 16 }),
    Object.freeze({ id: 'deep', label: 'Profonda', depth: 20 }),
  ]),

  // Sezione Gioca: livelli del motore avversario (Skill Level di Stockfish 0–20 + profondità). Nessuna stima di Elo:
  // non sarebbe verificabile. Il motore della partita è un'istanza separata, così le analisi restano a piena forza.
  playLevels: Object.freeze([
    Object.freeze({ level: 1, skill: 0, depth: 1 }),
    Object.freeze({ level: 2, skill: 3, depth: 2 }),
    Object.freeze({ level: 3, skill: 6, depth: 4 }),
    Object.freeze({ level: 4, skill: 9, depth: 6 }),
    Object.freeze({ level: 5, skill: 12, depth: 8 }),
    Object.freeze({ level: 6, skill: 15, depth: 10 }),
    Object.freeze({ level: 7, skill: 18, depth: 12 }),
    Object.freeze({ level: 8, skill: 20, depth: 16 }),
  ]),
  playMinMoveMs: 500, // il motore non risponde prima di così, per non sembrare istantaneo
  playHashMb: 16,

  // Numero massimo di posizioni tenute nella cache delle analisi.
  cacheSize: 5000,
});
