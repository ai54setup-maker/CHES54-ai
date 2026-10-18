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
| 2 | Analisi partita: PGN, win%, classificazione, accuracy, aperture, momenti chiave | ✅ completata |
| 3 | UI di revisione: grafico, barra, linee, icone, riepilogo, "ritenta" | ✅ completata |
| 4 | Spiegazioni basate solo sulle linee del motore | ✅ completata |
| 5 | Test (perft, PGN), prestazioni, licenze, README | ✅ completata |

Esperienza principale scelta: **revisione partita (PGN → analisi) + scacchiera di analisi libera**.

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
src/analysis/game-analyzer.js  analyzeGame(game, engine, { book, settings, onProgress })
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
data/examples/opera-game.pgn  partita di esempio (Morphy 1858, pubblico dominio), usata anche nei test
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
- Due schede: **Revisione** (PGN → analisi → riepilogo, grafico, scheda mossa, "ritenta") e **Analisi**
  (analisi libera, inserimento mosse, FEN/PGN). Giocare una mossa diversa in revisione apre una variante in Analisi.
- Tutte le valutazioni mostrate sono dal punto di vista del Bianco.
- Stato: `state` in app.js; posizione mostrata = `displayed()` (in "ritenta" è quella del tentativo).
- Analisi dal vivo della posizione mostrata (`requestLive`): sospesa durante la revisione, durante
  "ritenta" (linee e frecce nascoste finché l'utente non gioca) e quando in Revisione non c'è una partita.
- Salvataggio in localStorage (try/catch): modalità, preferenze, partita dell'analisi libera (PGN),
  ultima revisione (JSON con l'analisi).
- Tastiera: ← → Home End, F gira la scacchiera.
- Le icone delle categorie sono originali (cerchio + simbolo di annotazione standard): non copiare grafica di Chess.com/Lichess.

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
npm run bench          # tempi di analisi (default: data/examples/kasparov-topalov-1999.pgn)
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
