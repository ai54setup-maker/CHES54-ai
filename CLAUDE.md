# CLAUDE.md — CHES54.ai

Web app (PWA) di analisi scacchistica con Stockfish nel browser. Obiettivo: arrivare al livello di
Game Review di Chess.com / analisi di Lichess e pubblicarla. Licenza del progetto: **GPLv3**.

L'utente è uno studente: spiega le scelte importanti in modo chiaro, in italiano.

## Principio guida (non negoziabile)
Ogni valutazione, numero, classificazione e spiegazione mostrata all'utente deve derivare
dall'output di Stockfish. Mai stime fatte "a occhio" o da un modello linguistico.
Se una formula o un'informazione non è verificabile, dichiaralo invece di inventarla.

## Modo di lavorare
- Lavoro a fasi (0–5, vedi sotto). A fine fase: fermarsi, riassumere (fatto / file / come testare /
  problemi aperti / proposta fase successiva) e attendere conferma.
- Prima di modifiche grandi o distruttive: mostrare il piano e chiedere conferma.
- Aggiornare questo file a ogni fase (architettura, comandi, formule, soglie).
- Il progetto è in `~/ches54-ai` (repo git, branch `main`). `~/Desktop/ches54-ai` è una copia
  vecchia ("CHES55"): ignorarla.

## Stato delle fasi
| Fase | Contenuto | Stato |
|---|---|---|
| 0 | Audit, piano, git, CLAUDE.md | ✅ completata |
| 1 | Motore: UCI + MultiPV configurabile, worker, normalizzazione punteggi, cache | ✅ completata |
| 2 | Analisi partita: PGN, win%, classificazione, accuracy, aperture, momenti chiave | da fare |
| 3 | UI di revisione: grafico, barra, linee, icone, riepilogo, "ritenta" | da fare |
| 4 | Spiegazioni basate solo sulle linee del motore | da fare |
| 5 | Test (perft, PGN), prestazioni, licenze, README | da fare |

Esperienza principale scelta: **revisione partita (PGN → analisi) + scacchiera di analisi libera**.

## Stack
- JavaScript puro con moduli ES, tipi via **JSDoc**. **Nessuna build**, nessuna dipendenza npm a runtime.
- Motore: Stockfish 17.1 lite WASM single-thread (`engine/`, da nmrugg/stockfish.js, GPLv3), in Web Worker.
- Regole: chess.js 1.4.0 vendorizzato in `lib/chess.js` (BSD-2-Clause).
- Pezzi: set "cburnett" (`pieces/`).
- Server locale: `server.py` (solo file statici, porta 5454).
- Test: `node --test` (runner incluso in Node ≥ 18; qui Node 24).

## Architettura
### Attuale (dopo la fase 1)
```
src/config/engine.js      N linee, profondità (preset), movetime, hash, dimensione cache
src/config/analysis.js    coefficiente win%
src/engine/uci-parser.js  parsing puro di "info …" e "bestmove …"
src/engine/score.js       toWhitePov / toPov / formatScore ("M3", "-M5", "+0.35")
src/engine/cache.js       AnalysisCache (LRU, chiave = primi 4 campi FEN)
src/engine/engine.js      class Engine(transport): analyze(fen, opts) → Promise, coda, cancelAll()
src/engine/node-transport.js  Stockfish in processo figlio (solo Node: test/strumenti)
src/analysis/winpct.js    win% da cp/matto
js/app.js       UI (da spostare in src/ui/ in fase 3)
js/board.js     scacchiera (drag, tocco, frecce, animazioni) — riutilizzabile
js/notation.js  notazione italiana, parsing input utente
```
`js/explain.js` (spiegazioni euristiche non basate sul motore) è stato rimosso in fase 1;
le spiegazioni torneranno in fase 4, derivate solo dalle linee del motore.

### API del motore (src/engine/engine.js)
- `Engine.inWorker()` nel browser; `new Engine(nodeTransport(path))` in Node.
- `engine.analyze(fen, { depth, multiPv, movetimeMs, onUpdate })` → `Promise<AnalysisResult>`.
  Default dalla config; `go depth D [movetime T]` (si ferma al primo limite raggiunto).
- Risultato: `{ fen, sideToMove, depth, multiPv, request, lines[{multipv, depth, score, pv}], bestMove, done, fromCache }`.
  `score` è già dal punto di vista del Bianco. Posizione senza mosse legali → `lines: []`, `bestMove: null`.
- Righe con `lowerbound`/`upperbound` vengono scartate. `onUpdate` scatta quando tutte le linee hanno la stessa profondità.
- `cancelAll()` rifiuta coda e ricerca in corso con `AnalysisCancelled`; i risultati annullati non entrano in cache.
- Cache: riuso se linee ≥ richieste e (profondità raggiunta ≥ richiesta, oppure richiesta originale
  almeno altrettanto esigente per profondità e tempo). Un risultato peggiore non sostituisce uno migliore.

### Target (approvata)
```
src/config/    analysis.js (soglie, coefficienti), engine.js (N, profondità, movetime, hash)
src/engine/    uci-parser.js (puro), engine.js (worker, Promise, coda), score.js, cache.js
src/analysis/  pgn.js, game-model.js, winpct.js, accuracy.js, classify.js, openings.js,
               key-moments.js, game-analyzer.js, explain.js
src/ui/        board.js, evalbar.js, eval-graph.js, engine-lines.js, move-list.js, summary.js, retry.js, app.js
lib/ engine/ data/openings/   librerie, Stockfish, dataset aperture
test/          *.test.mjs eseguiti con node --test
```
Regole di dipendenza: `engine/` non conosce la UI; `analysis/` lavora solo su dati (testabile in Node);
`ui/` non contiene logica scacchistica né formule.

## Convenzioni di codice
- Nessun numero "magico": soglie, coefficienti, profondità, MultiPV, hash → `src/config/`.
- Punteggi: rappresentazione unica `{ cp: number|null, mate: number|null }` **dal punto di vista del Bianco**.
  La conversione dal punto di vista di chi muove (output UCI) avviene solo in `src/engine/score.js`.
  Matto e centipawn non si mescolano: `mate` positivo = il Bianco dà matto.
- Funzioni pure dove possibile; I/O (worker, DOM, localStorage) ai bordi.
- Identificatori in inglese, commenti e testi UI in italiano. Stile come il codice esistente
  (2 spazi, apici singoli, punto e virgola).
- Accesso a localStorage sempre in try/catch (l'app deve funzionare anche senza).
- Quando si aggiunge/rinomina un file servito, aggiornare la lista `FILES` e `VERSION` in `sw.js`.

## Comandi
```bash
npm start              # = python3 server.py → http://localhost:5454
npm test               # node --test "test/*.test.mjs" (include integrazione con Stockfish vero, ~1 s)
node --test test/engine.integration.test.mjs   # solo test con il motore reale
```
`engine/package.json` (`"type": "commonjs"`) serve solo a far girare `engine/stockfish.js` in Node.
Non aprire `index.html` da `file://`: il worker di Stockfish richiede http.

## Formule e soglie
Stato: ✅ implementata e testata · 📝 pianificata · ❓ da verificare sul sorgente di Lichess (lila).

| Cosa | Formula / valore | Stato |
|---|---|---|
| Win% | `50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`; matto = 100 / 0 | ✅ `src/analysis/winpct.js` (barra di valutazione) |
| Clamp cp prima della win% | ±1000 (?) | ❓ |
| Accuracy per mossa | `103.1668 * exp(-0.04354 * perdita_win%) - 3.1669`, limitata a [0, 100] | 📝 |
| Accuracy partita | media semplice (richiesta); Lichess usa media pesata per volatilità + armonica | 📝 / ❓ |
| Soglie Inaccuracy / Mistake / Blunder | 10 / 20 / 30 punti di win% (indicazione utente). Lichess usa 0.1/0.2/0.3 su scala winning chances [-1, 1], cioè forse 5/10/15 punti | ❓ |
| Brilliant / Great | euristica propria, da definire e documentare qui in fase 2 | 📝 |
| Book | posizione presente nel dataset lichess-org/chess-openings | 📝 |
