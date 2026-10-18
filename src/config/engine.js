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

  // Numero massimo di posizioni tenute nella cache delle analisi.
  cacheSize: 5000,
});
