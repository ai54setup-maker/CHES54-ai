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
- Il progetto è in `~/Desktop/ches54-ai` (repo git, branch `main`); spostato lì dall'utente il 2026-10-18,
  al posto della vecchia copia "CHES55" che non esiste più.

## Stato delle fasi
| Fase | Contenuto | Stato |
|---|---|---|
| 0 | Audit, piano, git, CLAUDE.md | ✅ completata |
| 1 | Motore: UCI + MultiPV configurabile, worker, normalizzazione punteggi, cache | ✅ completata |
| 2 | Analisi partita: PGN, win%, classificazione, accuracy, aperture, momenti chiave | ✅ completata |
| 3 | UI di revisione: grafico, barra, linee, icone, riepilogo, "ritenta" | ✅ completata |
| 4 | Spiegazioni basate solo sulle linee del motore | ✅ completata |
| 5 | Test (perft, PGN), prestazioni, licenze, README | ✅ completata |

### Seconda serie di fasi (richiesta del 2026-10-18)
La scheda Revisione non va cambiata nel funzionamento: solo aggiunte.
| Fase | Contenuto | Stato |
|---|---|---|
| A | Libreria di partite celebri (modale, filtri, ricerca, fonti verificate) | ✅ completata |
| B | Scheda "Analisi partita" al posto di "Analisi" (ricostruzione mossa per mossa, grafico, varianti) | ✅ completata |
| C | Allenatore: suggerimenti tattici dimostrati da Stockfish | ✅ completata |
| D | Rifinitura per telefono, prestazioni, documentazione | ✅ completata |

### Terza serie di fasi (richiesta del 2026-10-21)
Nuove sezioni Lezioni e Problemi + aspetto più "premium". Revisione e Analisi partita non cambiano nel funzionamento.
| Fase | Contenuto | Stato |
|---|---|---|
| E | Nuovo logo (cavallo formato da "5" e "4") e nuovo layout: barra laterale / barra in basso, 4 sezioni, tema scuro blu notte + ciano | ✅ completata |
| F | Risolvi problemi: selezione dal database di puzzle Lichess (CC0), ogni soluzione riverificata da Stockfish | ✅ completata |
| G | Lezioni interattive (tattiche, matti di base, principi di apertura, finali di base), posizioni verificate da Stockfish | ✅ completata |
| H | Rifinitura, telefono, offline, documentazione | ✅ completata |

Esperienza principale: **Revisione** (PGN → analisi) + **Analisi partita** (ricostruzione mossa per mossa, con Allenatore;
l'analisi libera da FEN è l'opzione "Parti da una posizione").

## Stack
- JavaScript puro con moduli ES, tipi via **JSDoc**. **Nessuna build**, nessuna dipendenza npm a runtime.
- Motore: Stockfish 17.1 lite WASM single-thread (`engine/`, da nmrugg/stockfish.js, GPLv3), in Web Worker.
- Regole: chess.js 1.4.0 vendorizzato in `lib/chess.js` (BSD-2-Clause).
- Pezzi: set "cburnett" (`pieces/`).
- Server locale: `server.py` (solo file statici, porta 5454).
- Test: `node --test` (runner incluso in Node ≥ 18; qui Node 24).

## Architettura
### Attuale (dopo la fase 4)
```
src/config/engine.js      N linee, profondità (preset), movetime, hash, dimensione cache
src/config/ui.js          frecce, mosse per linea, profondità della revisione, URL esempio, prefisso localStorage
src/config/analysis.js    win%, accuracy, soglie di classificazione, Great/Brilliant, analisi partita, aperture
src/engine/uci-parser.js  parsing puro di "info …" e "bestmove …"
src/engine/score.js       toWhitePov / toPov / formatScore ("M3", "-M5", "+0.35")
src/engine/cache.js       AnalysisCache (LRU, chiave = primi 4 campi FEN)
src/engine/engine.js      class Engine(transport): analyze(fen, opts) → Promise, coda, cancelAll()
src/engine/node-transport.js  Stockfish in processo figlio (solo Node: test/strumenti)
src/analysis/winpct.js    win% da cp/matto (cp limitati a ±1000)
src/analysis/pgn.js       parser PGN proprio (intestazioni, commenti multipli, varianti, NAG, [%clk], più partite)
src/analysis/game-model.js  gameFromPgn(): semimosse con FEN prima/dopo, UCI, legalità via chess.js, fine partita
src/analysis/accuracy.js  moveAccuracy, gameAccuracy (Lichess), meanAccuracy
src/analysis/classify.js  classifyMove, errorLevel (regole Lichess), Great/Brilliant (nostre)
src/analysis/openings.js  OpeningBook: identify(fensAfter) → { bookPlies, opening }
src/analysis/key-moments.js  semimosse con la variazione di win% più grande
src/analysis/game-analyzer.js  analyzeGame(game, engine, …); analyzeMove() = unico calcolo di una mossa (classificazione,
                          precisione, spiegazioni); analyzeLine() = partita parziale con le valutazioni pronte (memo per mossa)
src/analysis/advantage.js advantageOf() "chi sta meglio e di quanto"; turningPoint() "dove ho iniziato a perdere vantaggio"
src/analysis/tactics.js   Allenatore: recognizeTactic() dà il nome a una linea del motore; coachHints(); nullMoveFen()
src/analysis/retry.js     retryCandidates(), evaluateAttempt(): "ritenta la mossa" con le stesse regole della revisione
src/analysis/material.js  materialBalance, materialAlongLine (materiale a fine scambio lungo una variante)
src/analysis/explain.js   explainMove(): fatti strutturati dimostrati dalle linee del motore (nessun testo)
src/ui/explanations.js    formatExplanation(): testo italiano + variante citata (usato anche da analyze-pgn)
scripts/analyze-pgn.mjs   analisi di un PGN da terminale (stesso codice dell'app)
scripts/build-openings.mjs  data/openings/source/*.tsv → data/openings/openings.json
data/openings/            dataset lichess-org/chess-openings (CC0), fonte e commit in source/SOURCE.md
src/ui/app.js             stato dell'interfaccia e collegamento tra i moduli (nessuna formula)
src/ui/board.js           scacchiera: drag, tocco, frecce (anche tratteggiate), icona sulla casa (badge)
src/ui/notation.js        notazione italiana, linee numerate, parsing dell'input utente
src/ui/classification.js  nomi italiani e icone SVG delle categorie (simboli standard !!, !, ?!, ?, ??)
src/ui/evalbar.js, eval-graph.js, engine-lines.js, move-list.js, summary.js   componenti grafici
src/ui/coach.js           testo italiano dei suggerimenti dell'Allenatore (solo formulazione)
src/ui/library.js         finestra "Libreria partite": indice, filtri per categoria, ricerca (senza accenti), scelta → startReview()
data/examples/catalog.json  catalogo scritto a mano (metadati, categorie, "perché è famosa", mosse citate, selettori delle fonti): NESSUNA mossa
data/examples/index.json    generato: dati mostrati nella finestra (apertura calcolata da OpeningBook)
data/examples/games/*.pgn   generati: un PGN per partita, testo originale di PGN Mentor
data/examples/SOURCES.md    generato: fonti, date di download, SHA-256, partite escluse e perché
scripts/build-examples.mjs  scarica (PGN Mentor + chessgames.com), confronta, verifica, genera i file sopra
scripts/lib/examples.mjs    controlli condivisi da script e test (checkGame, compareGames, categoriesOf)
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

### Interfaccia (fase 3)
- Due schede (dalla fase E: due delle quattro sezioni): **Revisione** (PGN o Libreria → analisi → riepilogo, grafico, scheda mossa, "ritenta") e **Analisi partita**
  (vedi fase B; `data-mode="analysis"` resta il nome interno). Giocare una mossa diversa in revisione apre una variante
  in Analisi partita (sostituisce la partita che c'era: comportamento della Revisione invariato).
- Tutte le valutazioni mostrate sono dal punto di vista del Bianco.
- Stato: `state` in app.js; posizione mostrata = `displayed()` (in "ritenta" è quella del tentativo).
- Analisi dal vivo della posizione mostrata (`requestLive`): sospesa durante la revisione, durante
  "ritenta" (linee e frecce nascoste finché l'utente non gioca) e quando in Revisione non c'è una partita.
- Salvataggio in localStorage (try/catch): modalità, preferenze, partita dell'analisi libera (PGN),
  ultima revisione (JSON con l'analisi).
- Tastiera: ← → Home End, F gira la scacchiera.
- Le icone delle categorie sono originali (cerchio + simbolo di annotazione standard): non copiare grafica di Chess.com/Lichess.

### Layout e sezioni (fase E)
- `index.html`: `.app` = `.sidebar` (logo, `nav.tabs` con 4 pulsanti `data-mode`, link informazioni) + `.main` (intestazione con
  `#section-title`/`#section-sub` presi dal pulsante attivo: testo + `data-sub`; viste `#view-board`, `#view-lessons`, `#view-puzzles`).
- Sotto 860 px la barra laterale diventa la barra di navigazione in basso (`--bottom-nav-h`), con icona + etichetta.
- `state.section` (salvata in localStorage, chiave `section`) ∈ review | analysis | lessons | puzzles; `state.mode` resta
  review | analysis (stato interno della scacchiera). `setMode()` aggiorna anche la sezione; `setSection()` per Lezioni/Problemi
  ferma l'analisi dal vivo (`cancelAll`, salvo revisione in corso) e `requestLive()` non parte finché `!onBoard()`.
- Tema: variabili in `:root` (scuro) e `:root[data-theme="light"]`; `--accent-ink` = testo sopra il colore principale
  (mai colori scritti a mano sopra `--accent`). Font Inter incluso in `fonts/` (offline).
- Logo: `icons/icon.svg` (icona completa, gradiente e alone), `icons/favicon.svg` (piatta, per 16–32 px), `icons/mark.svg`
  (solo il cavallo), `icons/apple-touch-icon.png` (quadrata, senza angoli), `icon-192/512.png`, `logo-CHES54.svg/png`.
  Le PNG si rigenerano facendo uno screenshot dell'SVG con Chromium headless alla dimensione esatta.
  Il cavallo: "5" ruotato di 30° = testa (punta = orecchio, barra = muso con la bocca, pancia = guancia); "4" = collo e petto.

### Problemi (fase F)
- `scripts/build-puzzles.mjs` (`npm run build:puzzles`, ~6 min): legge in streaming le prime 600.000 righe di
  `lichess_db_puzzle.csv.zst` (zstd di Node ≥ 23), filtra per qualità (popolarità ≥ 85, ≥ 300 partite, deviazione ≤ 90,
  ≤ 8 semimosse), tema principale (`UI_CONFIG.puzzles.themes`, temi di Lichess) × difficoltà (`levels`, punteggio Lichess),
  15 per gruppo; verifica ogni mossa con Stockfish; scrive `data/puzzles/puzzles.json` e `SOURCES.md`.
  `data/puzzles/source/` (esclusa da git) contiene le righe lette e la cache delle verifiche.
- Regole (`src/analysis/puzzle.js`, parametri `ANALYSIS_CONFIG.puzzles`, nostre):
  mossa da trovare = prima linea a profondità 18 MultiPV 2 e unica buona (2ª linea ≥ 10 punti di win% peggiore; se la 1ª è
  matto, la 2ª non deve essere un matto altrettanto veloce); all'ultima mossa basta dare matto. Risposta dell'avversario =
  prima linea a profondità 14 MultiPV 3 o ≤ 3 punti di win% peggiore. Nell'app, all'ultima mossa vale ogni matto (come Lichess).
- Formato: `{ id, fen, moves, rating, theme, level, themes, eval, url }`; `fen` è prima della mossa dell'avversario
  (`moves[0]`), che l'app gioca da sola. `eval` = prima linea nella posizione da risolvere (punto di vista del Bianco).
- Interfaccia (`src/ui/puzzles.js`, `PuzzleTrainer`, creato da app.js alla prima apertura): scacchiera propria `#pz-board`;
  mossa sbagliata → analisi della posizione dopo (`refuteDepth` 14) con freccia e linea; indizio = pezzo da muovere
  (conta come errore); statistiche in localStorage (`pzStats`), filtri `pzTheme`/`pzLevel`. Problemi nuovi prima di quelli risolti.
- Risultato del 2026-10-21: 588 problemi (matto in 1 "Esperto" ne ha solo 3: pochi candidati); 44 esclusi, quasi tutti per
  risposte dell'avversario non confermate dal motore.

### Lezioni (fase G)
- Contenuti scritti a mano in `data/lessons/lessons.json`: `categories` + `lessons[{ id, category, title, summary, steps }]`.
  Passo `explain`: `title, text, fen`, facoltativi `demo` (mosse UCI animate), `arrows` (dopo la dimostrazione), `marks`,
  `check` (`mate`, `stalemate`, `inCheck`, `attacks {from, targets}`, `pinned`). Passo `exercise`: `text, fen, success` e
  `solution` (UCI, alternate: chi risolve, risposta, …; facoltativi `tactic`, `mate`) **oppure** `accept` (mosse giuste).
- **Ogni modifica a lessons.json va verificata con `npm run check:lessons`**: scrive `verified.json` (SHA-256 del file) solo se
  tutto è confermato; `test/lessons.test.mjs` fallisce se lo SHA non corrisponde. `--explore FEN` valuta ogni mossa legale.
- Regole (`src/analysis/lesson.js`, `ANALYSIS_CONFIG.lessons`, nostre): controlli statici con chess.js (anche posizione
  illegale = chi non muove è sotto scacco, che chess.js accetta ma Stockfish no); `solution` come i problemi + `tactic` =
  `recognizeTactic` sulla linea del motore; `accept`: tutte le mosse legali a profondità 16, accettate ≤ 8 punti di win% dalla
  migliore, tutte le altre ≥ 10 (scelto 8 perché nel matto del barbiere Ch6 perde 6,3 ed è una difesa vera).
- Testi: solo concetti e fatti sulla scacchiera; nessuna valutazione scritta a mano (quelle che compaiono, es. "le difese buone
  sono…", "le uniche mosse che salvano…", sono il risultato della verifica).
- Interfaccia: `src/ui/lessons.js` (`LessonPlayer`), funzioni comuni con i Problemi in `src/ui/position.js`; `Board.setMarks()`
  per le case evidenziate. Lezioni completate in localStorage (`lessonsDone`). Orientamento = lato di chi risolve il primo esercizio.

### Dopo la fase H (2026-10-21)
- Lezioni: aggiunte "Il pezzo in presa" (controlli statici `defended` / `undefended`), "Matto con due torri", "Lo sfondamento"
  (13 in tutto). Il matto in 2 con due torri era ambiguo (anche Tb7 matta in 2): sostituito con un matto in 1.
- Problema del giorno: `dailyIndex(data, n)` in puzzle.js (giorni dal 1970 × 7919 mod n) tra i livelli
  `UI_CONFIG.puzzles.dailyLevels`; data locale del dispositivo; conta come fatto anche con indizio/soluzione;
  `pzStats.dailyLast` / `dailyStreak`. Link `?section=problemi&daily=1` (scorciatoia nel manifest).

### Rifinitura (fase H)
- Link diretto: `?section=revisione|analisi|lezioni|problemi` (anche i nomi interni); scorciatoie dell'icona in
  `manifest.webmanifest`. Tastiera: ← → nei passi delle lezioni; → prossimo problema (dopo averlo risolto), H indizio.
- Versione 3.0.0 (`UI_CONFIG.about.version`, package.json).
- test:ui, ultima prova: **spegne il server** e ricarica l'app (l'emulazione offline di Chrome non vale per il service
  worker: con quella il test passava anche se il service worker scaricava dalla rete). Controprova: un file non in cache
  non arriva. Problemi, lezioni e Stockfish devono funzionare dalla cache.

### Riproducibilità
- Prima di ogni revisione e di ogni tentativo di "ritenta": `engine.newGame()` (UCI `ucinewgame`, svuota la
  tabella delle trasposizioni). Senza, a parità di profondità il risultato dipendeva dalle posizioni analizzate prima.
- La revisione usa la cache solo per risultati con le stesse identiche impostazioni (`exactCache`).
- Verificato: stessa partita e impostazioni → stesso risultato da terminale (`npm run analyze`) e dal browser.

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

### Analisi della partita (src/analysis/game-analyzer.js)
- Valuta con il motore la posizione iniziale e quella dopo ogni semimossa (impostazioni in
  `gameAnalysis`, MultiPV 2 per riconoscere le Great). La posizione finale, se è matto o patta
  secondo le regole (anche ripetizione e 50 mosse), non va al motore: `terminalEval()`.
- Per ogni mossa: valutazione prima (= miglior gioco nella posizione prima) e dopo (= analisi della
  posizione dopo), mossa migliore (UCI e SAN), perdita di win% di chi muove (≥ 0), precisione, categoria.
- Per giocatore: `accuracy` (formula partita di Lichess), `meanAccuracy` (media semplice), conteggi per categoria.
- Limite noto: il motore riceve solo la FEN, quindi non "vede" le ripetizioni nelle posizioni intermedie.

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
npm run analyze -- partita.pgn [--depth 14] [--multipv 2] [--movetime 500] [--game N] [--json]
npm run build:openings # rigenera data/openings/openings.json dopo aver aggiornato i .tsv
npm run test:ui        # test dell'interfaccia in Chromium headless (scripts/ui-test/, CHROME_PATH se non trovato)
npm run bench          # tempi di analisi (default: data/examples/games/kasparov-topalov-1999.pgn)
npm run build:examples # libreria di partite: scarica le fonti (in data/examples/source/, esclusa da git), verifica, rigenera
npm run build:puzzles  # problemi: legge il database Lichess (CC0), verifica con Stockfish, rigenera data/puzzles/
npm run check:lessons  # lezioni: verifica gli esercizi con Stockfish (--explore FEN per scriverne di nuovi)
```
Richiede Node ≥ 22 (WebSocket integrato per test:ui; glob in `node --test`).
Prima di chiudere una modifica all'interfaccia: `npm test` e `npm run test:ui` devono passare.
`engine/package.json` (`"type": "commonjs"`) serve solo a far girare `engine/stockfish.js` in Node.
Non aprire `index.html` da `file://`: il worker di Stockfish richiede http.

## Formule e soglie
Stato: ✅ implementata e testata. "Lichess" = verificato sul sorgente il 2026-10-18:
lila `cd2656d` (analyse/AccuracyPercent.scala, tree/Advice.scala), scalachess `4666581` (eval.scala: WinPercent),
scalalib `dc09240` (Maths). "Nostro" = scelta di questo progetto (Chess.com non pubblica le sue regole).
Tutti i valori sono in `src/config/analysis.js`.

| Cosa | Formula / valore | Fonte |
|---|---|---|
| Win% | `50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`, con cp limitati a ±1000 | Lichess ✅ |
| Win% di un matto | come ±1000 cp → 97.54 / 2.46 (la barra di valutazione mostra comunque 100/0) | Lichess ✅ |
| Perdita | `max(0, win%_prima - win%_dopo)` dal punto di vista di chi muove; "dopo" = analisi della posizione dopo la mossa, anche se la mossa era la prima scelta del motore | Lichess ✅ |
| Accuracy mossa | `103.1668100711649 * exp(-0.04354415386753951 * perdita) - 3.166924740191411 + 1`, in [0, 100]; 100 se la win% non scende. Il `+1` è il "bonus di incertezza" di Lichess, assente nella formula data inizialmente | Lichess ✅ |
| Accuracy partita | `(media pesata + media armonica) / 2` per colore. Finestra = mosse/10 in [2, 8]; peso = dev. std. (popolazione) della win% nella finestra, in [0.5, 12]; armonica con valori ≥ 1. Calcolata anche la media semplice (`meanAccuracy`) | Lichess ✅ |
| Inaccuracy / Mistake / Blunder | perdita ≥ **5 / 10 / 15** punti di win%. Lichess usa 0.1/0.2/0.3 di "winning chances" su scala [-1, 1] = 5/10/15 punti su 0–100 (non 10/20/30). Scelta confermata (l'utente ha delegato la decisione, fase 3) | Lichess ✅ |
| Errori con matto | si applicano solo se prima o dopo c'è un matto. **Matto subito** (da cp a matto contro): Blunder; Mistake se prima < -700 cp; Inaccuracy se < -999. **Matto perso** (da matto a favore a cp o matto contro): Blunder; Mistake se dopo > +700; Inaccuracy se > +999. Matto più lento ma forzato: nessun errore | Lichess ✅ |
| Best | mossa giocata = prima linea del motore | Nostro |
| Excellent / Good | perdita < 2 → Excellent; altrimenti (sotto la soglia Inaccuracy) Good | Nostro |
| Great | mossa migliore + 2ª linea peggiore di ≥ 10 punti di win%. Esclusi: ricatture sulla casa appena catturata; posizioni in cui chi muove aveva già un matto forzato | Nostro |
| Brilliant | mossa migliore o perdita < 2 + **sacrificio** ≥ 2 pedoni + win% dopo ≥ 40 + win% prima ≤ 95 (salvo che il sacrificio porti a matto forzato). Sacrificio = materiale (p1 c3 a3 t5 d9) prima meno il materiale dopo la mossa e le prime 4 semimosse della linea del motore, misurato dopo ogni risposta dell'avversario e prendendo il caso migliore per chi muove (uno scambio in corso non conta). Se il motore indica che conviene non accettare il sacrificio, non è Brilliant | Nostro |
| Book | posizione dopo la mossa presente nel dataset (linee con nome **e** posizioni intermedie), solo per semimosse consecutive dall'inizio | Nostro, dati lichess-org/chess-openings |
| Nome apertura | posizione con nome più avanzata raggiunta nelle prime 40 semimosse (anche per trasposizione) | Nostro |
| Momenti chiave | fino a 5 semimosse con \|Δ win% Bianco\| ≥ 10, mostrate in ordine di gioco | Nostro |
| Ordine delle categorie | Book → errori → Brilliant → Great → Best → Excellent → Good | Nostro |

### Spiegazioni (fase 4)
Fatti ricavati SOLO da due varianti di Stockfish: **R** = mossa giocata + linea migliore della posizione dopo;
**B** = linea migliore della posizione prima. Ogni fatto contiene la variante citata (`line: { fen, pv }`).
Parametri in `explanations` di `src/config/analysis.js`. Solo per Inaccuracy/Mistake/Blunder, più Brilliant e Great.
| Fatto | Condizione |
|---|---|
| allowsMate | dopo la mossa l'avversario ha matto forzato in n (prima no); variante = mossa + 2n−1 semimosse |
| missesMate | prima chi muove aveva matto in n, dopo no; variante = B |
| allowsFork | perdita di materiale lungo R e la prima risposta in R porta un pezzo ad attaccare ≥ 2 pezzi (re o valore ≥ 3) |
| hangs | perdita ≥ valore del pezzo mosso e la prima cattura avversaria in R prende proprio quel pezzo |
| losesMaterial | perdita lungo R (con elenco delle catture avversarie) |
| missesMaterial | la mossa non perde materiale ma B ne guadagna di più; gain = differenza tra le due linee |
| sacrifice | Brilliant: materiale ceduto (stessa misura della classificazione) |
| onlyMove | Great: seconda linea MultiPV con il suo punteggio |
- **Misura del materiale** (`materialAlongLine`): si gioca la mossa + almeno 4 semimosse della linea, poi si continua
  finché la mossa successiva è una cattura (max 10). Perdita = materiale prima − dopo, confrontata con la stessa
  misura lungo B (si attribuisce alla mossa solo la differenza ≥ 1 pedone).
- **Se la variante finisce a metà di uno scambio** (ultima mossa una cattura, nessun seguito) la misura non è
  affidabile: nessun fatto sul materiale. Se nessun fatto è dimostrabile non si mostra nulla (in "ritenta" si
  mostra solo la risposta del motore).
- Massimo 2 fatti per mossa, in quest'ordine: matti, poi materiale.

### Libreria di partite (fase A)
- **Mai mosse scritte a memoria.** Fonte principale: archivi per giocatore di PGN Mentor; seconda fonte: PGN di
  chessgames.com (`/nodejs/game/viewGamePGN?text=1&gid=…`, serve uno User-Agent da browser; pausa di 1,5 s tra le richieste).
- Inclusa solo se le due fonti hanno stesse mosse e stesso risultato. Unica eccezione: una fonte si ferma prima e
  riporta le mosse mancanti, identiche, nel commento finale (matto annunciato, es. la Sempreverde).
  Le trasposizioni nell'ordine delle mosse contano come differenza (Lasker–Bauer e Levitsky–Marshall esclusi per questo).
- `mentions` nel catalogo: le mosse citate nella descrizione, con numero (es. `30.Ba3`); il test verifica che ci siano.
- Categoria "miniature" automatica: partita vinta entro `UI_CONFIG.examples.miniatureMaxMoves` (25) mosse.
- Il service worker mette in cache solo `index.json`; i PGN entrano in cache quando vengono aperti (strategia rete-poi-cache).
- La descrizione "perché è famosa" è un fatto storico, non una valutazione: i giudizi sulle mosse restano a Stockfish.

### Analisi partita (fase B)
- Stato in app.js: `state.free` = linea principale; `state.variation = { base, game }` = variante provata dalla posizione
  `base` (una mossa diversa a metà partita NON sovrascrive la linea principale); `state.redo` = mosse annullate (UCI);
  `state.side` = colore dell'utente; `state.setupDone`. Persistenti: free (PGN), side, setupDone, valutazioni (`evals`).
- Motore: prima la posizione mostrata (MultiPV `UI_CONFIG.gameMode.multiPv` = 3, profondità del riquadro Motore), poi
  Allenatore, poi `fillMissing()` valuta una alla volta le posizioni senza valutazione. Ogni nuova posizione mostrata
  incrementa `live.gen` e chiama `cancelAll()`: le risposte vecchie vengono ignorate.
- Valutazioni salvate in `gameEvals` con chiave `profondità|FEN`; `lineAnalysis()` memorizza l'analisi della linea
  (si svuota a ogni valutazione nuova) e `moveMemo` le singole mosse: 271 semimosse = 115 ms senza memo, 0,8 ms con.
- Classificazione = `analyzeMove()`, la stessa della Revisione. La profondità può differire (16 contro 14).
- Chi sta meglio (`ANALYSIS_CONFIG.advantage`, nostro): |win% − 50| < 5 equilibrio, < 15 leggero, < 30 chiaro, poi decisivo;
  matto in N; posizioni finali con le regole.
- Punto di svolta (`ANALYSIS_CONFIG.turningPoint`, nostro): se la win% del giocatore è scesa di ≥ 10 punti dal suo massimo,
  è il suo primo errore (Inaccuracy/Mistake/Blunder) dopo il massimo, altrimenti la sua mossa che ha perso più win%.
  Nessun punto se il calo è dovuto solo a mosse dell'avversario. Solo sulla linea principale.

### Allenatore (fase C)
- `tactics.js`: suggerimento solo se una linea di Stockfish lo dimostra (`ANALYSIS_CONFIG.coach`, nostro):
  - **occasione** per chi muove: 1ª linea MultiPV migliore della 2ª di ≥ 10 punti di win% E guadagno ≥ 2 pedoni lungo
    la linea (`materialAlongLine`, a scambi conclusi); oppure matto in ≤ 5 (anche senza distacco);
  - **minaccia** (solo quando tocca all'utente): analisi a profondità 12 della posizione a mossa nulla (`nullMoveFen`,
    non se sotto scacco); vale se la win% dell'avversario salirebbe di ≥ 10 punti (o matto) e la linea vince ≥ 2 pedoni.
  - Nome dalla prima mossa della linea, in quest'ordine: scoperta (un altro pezzo ora attacca un bersaglio) → forchetta
    (il pezzo mosso attacca ≥ 2 bersagli) → inchiodatura/infilata (alfiere/torre/donna vede due pezzi avversari in fila:
    davanti meno prezioso = inchiodatura, più prezioso = infilata) → pezzo in presa (cattura senza ripresa sulla casa) →
    "vince materiale". Bersagli = pezzi da 3 in su o il re.
  - Massimo 2 suggerimenti, i matti per primi.
- Interfaccia: pannello "Allenatore" (on/off, Indizio/Soluzione) + toast. Tocco = freccia (`UI_CONFIG.coachArrow`,
  rossa tratteggiata per le minacce) e variante. Nel livello Indizio, con una tattica da trovare, linee e frecce del motore
  restano nascoste finché non si tocca il suggerimento.
- Test con il vero Stockfish (`test/tactics.test.mjs`): una posizione per tipo + negativi (posizioni tranquille,
  forchetta che perde materiale).

### Rifinitura (fase D)
- Telefono (375 px, verificato da test:ui): libreria a tutto schermo, nessuno scorrimento orizzontale, elementi toccabili
  ≥ 40 px; sotto 860 px l'intestazione mostra solo l'icona del logo (fase E).
- `test/sw.test.mjs`: ogni modulo di `src/` deve essere in `FILES` di sw.js.

### Decisioni valutate e scartate
- **Perdita calcolata con il punteggio della linea MultiPV della mossa giocata** (stessa ricerca della
  valutazione "prima"): toglieva il "rumore" tra due ricerche separate, ma nascondeva informazioni vere.
  Esempio: Partita dell'Opera, 15...Cxd7 era la prima scelta a profondità 14 (+1.63), ma l'analisi della
  posizione dopo trova il matto in 2: con quella regola diventava "Best". Scartata (fase 3).
  Al suo posto l'interfaccia segnala il caso "prima scelta del motore ma classificata come errore"
  come valutazione instabile, suggerendo più profondità.

## Qualità, prestazioni, licenze (fase 5)
- Test: perft su 6 posizioni di riferimento (chessprogramming.org) con controllo incrociato via `go perft` di
  Stockfish; casi limite PGN (e.p., sottopromozione, arrocco con scacco, varianti non supportate → errore chiaro).
- Prestazioni (Apple M2 Pro, 88 posizioni, single-thread): profondità 14 + MultiPV 2 = 6,3 s (browser 6,6 s);
  MultiPV 2 raddoppia il tempo; profondità 18 = 31,5 s. La precisione varia sensibilmente con la profondità.
- Componenti e provenienza verificati per hash: `engine/` = npm stockfish@17.1.0 build lite-single-03e3232
  (sorgente: nmrugg/stockfish.js tag v17.1.0); `lib/chess.js` = npm chess.js@1.4.0 dist/esm (senza sourceMappingURL).
- Licenze: tutto GPLv3; obblighi e rischi in `docs/licenze.md`; avvisi legali nella finestra "Informazioni e licenze"
  (`UI_CONFIG.about`: copyright e sourceUrl DA COMPLETARE da parte dell'utente).
- Non copiare grafica, palette o suoni di Chess.com/Lichess; icone e testi originali.
