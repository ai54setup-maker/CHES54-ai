<p align="center"><img src="logo-CHES54.png" alt="CHES54.ai" width="600"></p>

# ♟ CHES54.ai

Revisione e analisi delle partite di scacchi, direttamente nel browser, con **Stockfish 17.1**.

- **Revisione partita:** incolli il PGN di una partita (da Chess.com, Lichess o qualsiasi altro programma) e ottieni:
  - la valutazione di ogni mossa e la sua categoria, da Brillante a Errore grave;
  - la precisione di ciascun giocatore e il nome dell'apertura;
  - il grafico della partita e i momenti chiave;
  - brevi spiegazioni degli errori, ognuna con la variante del motore che la dimostra.
- **Ritenta la mossa:** sugli errori puoi provare a trovare una mossa migliore, e il motore la giudica.
- **Analisi libera:** muovi i pezzi e vedi le migliori mosse del motore, con le linee complete.

Ogni numero, categoria e spiegazione viene dall'analisi di Stockfish. Le formule sono pubbliche e documentate
(vedi [Come funziona l'analisi](#come-funziona-lanalisi)). Il motore gira sul tuo dispositivo: non servono server,
account né abbonamenti, e dopo il primo caricamento l'app funziona anche offline.

---

## Installazione e avvio

Serve **Python 3**, solo per il piccolo server locale. Su Mac è già installato; su Windows scaricalo da
<https://www.python.org/downloads/> e spunta "Add Python to PATH".

- **Mac:** doppio clic su **`Avvia CHES54.command`**. La prima volta, se macOS lo blocca: clic destro → **Apri** → **Apri**.
- **Windows:** doppio clic su **`Avvia CHES54.bat`**.
- **Da terminale:**
  ```bash
  cd ches54-ai
  python3 server.py        # oppure: npm start
  ```

Il browser si apre su `http://localhost:5454`. Nel terminale c'è anche l'indirizzo da aprire sul telefono
(stessa rete Wi-Fi).

> ⚠️ Non aprire `index.html` con un doppio clic: il motore funziona solo tramite un server (`http://…`), non da `file://`.
>
> 💡 Tieni la cartella fuori da iCloud o OneDrive: se i file vengono spostati nel cloud, l'app smette di funzionare
> finché non vengono riscaricati.

## Uso

### Revisione di una partita
1. Scheda **Revisione** → incolla il PGN, oppure **Apri file .pgn**, oppure **Libreria partite**: 21 partite celebri
   (classiche, campioni del mondo, Magnus Carlsen, miniature) con filtri e ricerca; toccandone una parte subito la revisione.
   - *Chess.com:* apri la partita → Condividi → PGN → Copia.
   - *Lichess:* apri la partita → Condividi ed esporta → Scarica PGN.
2. Scegli la profondità e premi **Analizza la partita**. La profondità **Normale (14)** è un buon compromesso:
   su un computer recente una partita di 40 mosse richiede pochi secondi.
3. Esplora la partita:
   - frecce ◀ ▶ (o ← → sulla tastiera), oppure un tocco sul grafico o su una mossa;
   - la scheda della mossa mostra la categoria, la perdita, la mossa migliore e le spiegazioni;
   - **Ritenta questa mossa** (sugli errori) oppure **Ritenta gli errori** dal riepilogo.
4. Se muovi un pezzo durante la revisione si apre una **variante** in Analisi libera.

### Analisi partita
Per ricostruire una partita mossa per mossa e vedere, a ogni passo, come cambia la situazione.
1. Scegli il **colore con cui hai giocato** (la scacchiera si gira dal tuo lato) e, se vuoi, i nomi dei giocatori.
   Con **Parti da una posizione** puoi incollare un FEN: è anche l'analisi libera da qualsiasi posizione.
2. Inserisci le mosse trascinando i pezzi, toccando pezzo e casa, oppure scrivendole (`e4`, `Cf3`, `O-O`, `e2e4`,
   anche `Nf3`). **↶ Annulla** e **↷ Ripeti** tolgono e rimettono l'ultima mossa.
3. Dopo ogni mossa Stockfish analizza la posizione (l'analisi precedente si interrompe subito):
   - le **3 mosse migliori** per chi deve muovere, con il punteggio;
   - il **giudizio sulla mossa** appena inserita, con le stesse regole e soglie della Revisione;
   - **chi sta meglio e di quanto** (equilibrio, leggero, chiaro o decisivo vantaggio, matto);
   - il **grafico** che cresce mossa dopo mossa; il cerchio arancione indica **dove hai iniziato a perdere vantaggio**
     (il tuo primo errore dopo il momento migliore, se la tua win% è scesa di almeno 10 punti).
4. **Varianti:** torna a una mossa qualsiasi e gioca un'alternativa. La linea principale resta salvata:
   **Torna alla linea principale** oppure **Usa come linea principale**.
5. **Esporta PGN** scarica la partita; **FEN / PGN** copia o carica posizione e partita;
   **Fai la revisione completa** la passa alla scheda Revisione. **Nuova partita** non cancella nulla finché non premi Inizia.

### Allenatore
Nella scheda Analisi partita, dopo ogni mossa, l'Allenatore mostra al massimo 2 suggerimenti brevi, per esempio
*"Hai una forchetta: Cd5 attacca la donna e la torre"*, *"Attenzione: il tuo alfiere in c4 è in presa"*,
*"Con Dh5+ c'è un matto in 2!"*, *"L'avversario minaccia Cxf7"*.
- Ogni suggerimento è **dimostrato da una linea di Stockfish**: il motore trova la mossa, poi un riconoscitore dà il nome
  alla tattica (forchetta, inchiodatura, infilata, attacco di scoperta, pezzo in presa, matto in N, minaccia).
  Compare solo se la mossa è nettamente la migliore (almeno 10 punti di win% sulla seconda) e lungo la linea si vince
  davvero materiale (almeno 2 pedoni), oppure se c'è un matto. Una "forchetta" che perde materiale non viene segnalata.
- Le **minacce** si trovano chiedendo al motore che cosa farebbe l'avversario se toccasse a lui.
- Tocca un suggerimento per vedere la **freccia** sulla scacchiera e la **variante del motore**.
- **Indizio** dice solo che c'è una tattica (e nasconde le linee del motore finché non tocchi il suggerimento);
  **Soluzione** dice quale. L'Allenatore si può spegnere.

Le valutazioni sono sempre **dal punto di vista del Bianco**: `+1.20` vuol dire Bianco avanti di circa un pedone e
un quinto, `M3` vuol dire che il Bianco dà matto in 3, `-M3` che lo dà il Nero.

## Pubblicarla online

L'app è un sito statico: basta caricare la cartella.

- **Netlify Drop:** <https://app.netlify.com/drop> → trascina la cartella `ches54-ai`.
- **GitHub Pages:** crea un repository, fai il push, poi Settings → Pages → *Deploy from a branch* → `main` / root.

Dal link online l'app si può **installare sul telefono**: su iPhone tasto Condividi → Aggiungi alla schermata Home;
su Android menu ⋮ → Installa app.

**Prima di pubblicare** leggi [`docs/licenze.md`](docs/licenze.md). Contiene gli obblighi della licenza GPLv3 di
Stockfish e una lista di controllo. In breve: pubblica il codice sorgente, completa nome e link in `src/config/ui.js`,
non usare loghi o grafica di Chess.com e Lichess.

## Come funziona l'analisi

1. **Valutazione:** Stockfish analizza la posizione iniziale e quella dopo ogni mossa (profondità scelta, 2 linee).
   Prima di ogni revisione la memoria del motore viene azzerata: **la stessa partita con le stesse impostazioni dà
   sempre lo stesso risultato**, sia nel browser sia da terminale.
2. **Percentuale di vittoria** (formula di Lichess):
   `win% = 50 + 50 · (2 / (1 + e^(−0,00368208 · cp)) − 1)`, con i centipawn limitati a ±1000.
3. **Perdita** di una mossa = calo della win% di chi ha mosso. **Imprecisione / Errore / Errore grave** da 5 / 10 / 15 punti
   (soglie di Lichess). Per le mosse che riguardano un matto valgono regole a parte, anch'esse riprese da Lichess.
4. **Precisione** di una mossa (formula di Lichess):
   `103,1668 · e^(−0,04354 · perdita) − 3,1669 + 1`, limitata tra 0 e 100.
   Precisione della partita = media tra una media pesata sulla variabilità della partita e una media armonica, come Lichess.
5. **Brillante / Ottima / Migliore / Eccellente / Buona:** regole di questo progetto, perché Chess.com non pubblica le sue:
   - *Ottima* = l'unica mossa buona;
   - *Brillante* = un sacrificio di materiale che la linea del motore giustifica.
6. **Teoria e apertura:** dal dataset aperto [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings).
7. **Spiegazioni:** fatti ricavati confrontando la linea del motore dopo la mossa con quella migliore (matto concesso o
   mancato, forchetta, pezzo in presa, materiale perso). Se un fatto non è dimostrabile, non viene mostrato.

Tutte le soglie e i parametri sono in `src/config/`. Fonti e dettagli delle formule (con i commit di Lichess
consultati) sono in [`CLAUDE.md`](CLAUDE.md).

**Limiti da conoscere:**
- I risultati dipendono dalla profondità: a profondità basse la precisione può variare di qualche punto.
- Capita che la prima scelta del motore risulti un errore dopo la mossa ("valutazione instabile"): l'app lo segnala.
- Nella scheda Analisi partita la profondità è quella scelta nel riquadro Motore (Normale = 16), mentre la Revisione usa
  la sua (Normale = 14): per questo il giudizio di una mossa può cambiare leggermente tra le due schede.

## Per chi sviluppa

Nessuna fase di build e nessuna dipendenza npm: i file vengono serviti così come sono. Serve **Node.js 22 o successivo**.

### Problemi
588 problemi presi dal database pubblico di Lichess (CC0), divisi per **tema** (matto in 1/2/3, forchetta, inchiodatura,
infilata, attacco di scoperta, pezzo in presa, deviazione, finale) e **difficoltà** (Facile, Medio, Difficile, Esperto).
Ogni mossa di ogni soluzione è stata **riverificata dal nostro Stockfish** (profondità 18): i problemi non confermati
sono esclusi. Fonte, criteri ed esclusi in [`data/puzzles/SOURCES.md`](data/puzzles/SOURCES.md).
1. La prima mossa è dell'avversario e si gioca da sola; poi tocca a te.
2. Mossa sbagliata → resta sulla scacchiera e Stockfish mostra come risponderebbe l'avversario; **Riprova**.
3. **Indizio** evidenzia il pezzo da muovere; **Soluzione** gioca la soluzione. All'ultima mossa vale qualsiasi matto.
4. Serie, record, problemi risolti e percentuale al primo colpo restano salvati nel browser.

```bash
npm test                         # test della logica, compresi Stockfish reale e perft (~3 s)
npm run test:ui                  # test dell'interfaccia in un browser headless (Chrome, Brave, Edge o Chromium)
npm run analyze -- partita.pgn   # revisione da terminale (--depth, --multipv, --movetime, --game, --json)
npm run bench                    # tempi di analisi a diverse profondità
npm run build:openings           # rigenera il dataset delle aperture
npm run build:examples           # riscarica e verifica la libreria di partite (data/examples/)
npm run build:puzzles            # riscarica, seleziona e verifica con Stockfish i problemi (data/puzzles/, ~6 min)
```

Tempi misurati su Apple M2 Pro, partita di 44 mosse (88 posizioni), motore single-thread:

| Profondità | 1 linea | 2 linee (impostazione dell'app) |
|---|---|---|
| 10 | 0,5 s | 1,1 s |
| 14 | 2,7 s | 6,3 s (browser: 6,6 s) |
| 18 | 16,8 s | 31,5 s |

Su un telefono i tempi sono più lunghi: non li ho misurati.

### Struttura

```
ches54-ai/
├── index.html, style.css      interfaccia
├── src/
│   ├── config/                parametri: motore, formule e soglie, interfaccia
│   ├── engine/                Stockfish via UCI: worker, coda, cache, punteggi normalizzati
│   ├── analysis/              PGN, partita, win%, precisione, classificazione, aperture, spiegazioni, tattiche
│   └── ui/                    scacchiera, barra, grafico, linee, lista mosse, riepilogo, app
├── engine/                    Stockfish 17.1 (WebAssembly), provenienza in engine/README.md
├── lib/chess.js               regole degli scacchi (chess.js 1.4.0)
├── data/                      dataset delle aperture, libreria di partite (fonti in data/examples/SOURCES.md)
├── test/                      test (node --test)
├── scripts/                   analisi da terminale, benchmark, test dell'interfaccia, dataset
├── docs/licenze.md            licenze, marchi, API: cosa sapere prima di pubblicare
├── sw.js, manifest.webmanifest  app installabile e offline
└── server.py                  server locale
```

Se modifichi dei file e l'app è già installata sul telefono, cambia `VERSION` in `sw.js`: così il telefono scarica
la nuova versione.

### Aggiungere una partita alla libreria
Le mosse non si scrivono mai a mano. Aggiungi una voce in `data/examples/catalog.json` (giocatori, anno, categorie,
descrizione, mosse citate con il numero, selettore per l'archivio di [PGN Mentor](https://www.pgnmentor.com/files.html)
e ID della stessa partita su chessgames.com), poi lancia `npm run build:examples`: lo script scarica le due fonti,
le confronta mossa per mossa, controlla legalità e risultato, calcola l'apertura e aggiorna `index.json`, `games/` e
`SOURCES.md`. Se le fonti non concordano la partita viene esclusa, con il motivo. Infine `npm test`.

## Crediti e licenze

CHES54.ai è software libero, distribuito con licenza **GNU GPL versione 3** ([`LICENSE`](LICENSE)).

- [Stockfish](https://stockfishchess.org/), gli sviluppatori di Stockfish (GPLv3); build WebAssembly di
  [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPLv3)
- [chess.js](https://github.com/jhlywa/chess.js), Jeff Hlywa (BSD-2-Clause)
- Pezzi "cburnett", Colin M.L. Burnett (GPLv2+), dal progetto [Lichess](https://github.com/lichess-org/lila)
- Dataset delle aperture [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0)
- Formule di win%, precisione e soglie degli errori: dal codice sorgente aperto di [Lichess](https://github.com/lichess-org/lila)

Dettagli e versioni in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

CHES54.ai non è affiliato a Chess.com né a Lichess e non è approvato da loro.

---

*CHES54.ai è uno strumento di analisi e allenamento. Usarlo durante partite online o tornei in corso è contro il
regolamento delle piattaforme e delle federazioni.*
