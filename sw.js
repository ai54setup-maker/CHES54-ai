// Service worker: salva l'app (motore compreso) per usarla anche offline.
// Cambia VERSION quando aggiorni i file, così i telefoni scaricano la nuova versione.
const VERSION = 'ches54-v19';
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  ...[
    'config/engine.js', 'config/analysis.js', 'config/ui.js',
    'engine/engine.js', 'engine/uci-parser.js', 'engine/score.js', 'engine/cache.js',
    'analysis/winpct.js', 'analysis/pgn.js', 'analysis/game-model.js', 'analysis/accuracy.js',
    'analysis/classify.js', 'analysis/openings.js', 'analysis/key-moments.js',
    'analysis/game-analyzer.js', 'analysis/retry.js', 'analysis/material.js', 'analysis/explain.js',
    'analysis/advantage.js', 'analysis/tactics.js', 'analysis/puzzle.js', 'analysis/lesson.js', 'analysis/online-games.js',
    'ui/app.js', 'ui/board.js', 'ui/notation.js', 'ui/classification.js', 'ui/evalbar.js',
    'ui/eval-graph.js', 'ui/engine-lines.js', 'ui/move-list.js', 'ui/summary.js', 'ui/explanations.js',
    'ui/library.js', 'ui/coach.js', 'ui/puzzles.js', 'ui/lessons.js', 'ui/position.js', 'ui/online-games.js',
  ].map((f) => `src/${f}`),
  'lib/chess.js',
  'engine/stockfish.js',
  'engine/stockfish.wasm',
  'data/openings/openings.json',
  // Libreria: solo l'indice; i PGN si scaricano quando servono (e poi restano in cache, vedi 'fetch').
  'data/examples/index.json',
  'data/puzzles/puzzles.json',
  'data/lessons/lessons.json',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  'fonts/inter-latin.woff2',
  'icons/icon.svg',
  'icons/favicon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  ...['w', 'b'].flatMap((c) => ['K', 'Q', 'R', 'B', 'N', 'P'].map((p) => `pieces/${c}${p}.svg`)),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rete prima (per avere sempre l'ultima versione), cache se offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Solo i file dell'app: le richieste ad altri siti (Lichess, Chess.com) vanno direttamente in rete
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
