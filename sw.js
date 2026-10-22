// Service worker: salva l'app (motore compreso) per usarla anche offline.
// Cambia VERSION quando aggiorni i file, così i telefoni scaricano la nuova versione.
const VERSION = 'ches54-v28';
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
    'analysis/advantage.js', 'analysis/tactics.js', 'analysis/puzzle.js', 'analysis/lesson.js', 'analysis/online-games.js', 'analysis/my-mistakes.js', 'analysis/play.js', 'analysis/share.js', 'analysis/opening-tree.js', 'analysis/opening-study.js',
    'ui/app.js', 'ui/board.js', 'ui/notation.js', 'ui/classification.js', 'ui/evalbar.js',
    'ui/eval-graph.js', 'ui/engine-lines.js', 'ui/move-list.js', 'ui/summary.js', 'ui/explanations.js',
    'ui/library.js', 'ui/coach.js', 'ui/puzzles.js', 'ui/lessons.js', 'ui/position.js', 'ui/online-games.js', 'ui/backup.js', 'ui/play.js', 'ui/audio.js', 'ui/openings.js', 'i18n/i18n.js', 'i18n/en.js',
  ].map((f) => `src/${f}`),
  'lib/chess.js',
  'engine/stockfish.js',
  'engine/stockfish.wasm',
  'data/openings/openings.json',
  // Libreria: solo l'indice; i PGN si scaricano quando servono (e poi restano in cache, vedi 'fetch').
  'data/examples/index.json',
  'data/examples/index.en.json',
  'data/puzzles/puzzles.json',
  // Aperture: catalogo, albero e statistiche (~qualche MB in tutto), idee delle famiglie principali
  'data/openings/tree/index.json',
  ...['root', 'e4', 'd4', 'c4', 'Nf3', 'other'].map((g) => `data/openings/tree/stats-${g}.json`),
  ...['e4', 'd4', 'c4', 'Nf3', 'other'].map((g) => `data/openings/tree/tree-${g}.json`),
  'data/openings/ideas.json',
  'data/openings/ideas.en.json',
  'data/lessons/lessons.json',
  'data/lessons/lessons.en.json',
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
