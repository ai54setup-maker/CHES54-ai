// Service worker: salva l'app (motore compreso) per usarla anche offline.
// Cambia VERSION quando aggiorni i file, così i telefoni scaricano la nuova versione.
const VERSION = 'ches54-v6';
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
    'ui/app.js', 'ui/board.js', 'ui/notation.js', 'ui/classification.js', 'ui/evalbar.js',
    'ui/eval-graph.js', 'ui/engine-lines.js', 'ui/move-list.js', 'ui/summary.js', 'ui/explanations.js',
  ].map((f) => `src/${f}`),
  'lib/chess.js',
  'engine/stockfish.js',
  'engine/stockfish.wasm',
  'data/openings/openings.json',
  'data/examples/opera-game.pgn',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
  'icons/icon.svg',
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
