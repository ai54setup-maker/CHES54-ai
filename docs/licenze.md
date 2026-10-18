# Licenze, marchi e API: cosa sapere prima di pubblicare CHES54.ai

> Queste note riassumono le licenze e i termini d'uso consultati il **2026-10-18** (fonti in fondo).
> Non sono una consulenza legale: per un uso commerciale o in caso di dubbi, chiedi a un legale.
> Dove un'informazione non è verificabile dalle fonti, è scritto esplicitamente.

## 1. Cosa contiene l'app e con quali licenze

| Componente | Licenza | Compatibile con la distribuzione GPLv3? |
|---|---|---|
| Il tuo codice (`src/`, `index.html`, `style.css`, script) | **GPLv3** (scelta in fase 0) | — |
| Stockfish 17.1 (`engine/`) | GPLv3 | Sì, stessa licenza |
| chess.js 1.4.0 (`lib/`) | BSD-2-Clause | Sì: è una licenza permissiva, chiede solo di conservare l'avviso di copyright |
| Pezzi "cburnett" (`pieces/`) | GPLv2 **o successiva** | Sì: "o successiva" permette di usarli come GPLv3 |
| Dataset aperture (`data/openings/`) | CC0 (pubblico dominio) | Sì, nessun obbligo |
| Rete NNUE (dentro `stockfish.wasm`) | **Non verificabile**: le fonti consultate non indicano una licenza separata | Viene distribuita dagli autori stessi dentro binari GPLv3 |

Dettagli, versioni e hash dei file: [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) e [`engine/README.md`](../engine/README.md).

## 2. Gli obblighi della GPLv3 (per via di Stockfish)

**Quando valgono.** Gli obblighi nascono quando *distribuisci* il programma ("convey", nel testo della licenza).
Pubblicare l'app su un sito fa scaricare ai visitatori i file JavaScript e WebAssembly, che girano sul loro
dispositivo: secondo l'interpretazione prevalente questa è una distribuzione. Se invece usassi l'app solo tu, in locale,
non avresti obblighi.

**Perché tutta l'app è GPLv3.** L'app e Stockfish vengono caricati e usati insieme nella stessa pagina. Se questo
li renda un'unica opera "derivata" è una questione discussa. Avendo scelto la GPLv3 anche per il tuo codice, il problema
non si pone: tutto è sotto la stessa licenza.

Quando pubblichi devi:

1. **Includere il testo della licenza.** Fatto: file [`LICENSE`](../LICENSE) (testo ufficiale da gnu.org).
2. **Rendere disponibile il "sorgente corrispondente"** di ciò che distribuisci (GPLv3, sezione 6):
   - *il tuo codice*: i file `.js` serviti dal sito non sono minificati, quindi **sono già il sorgente**. Pubblicare
     il repository su GitHub rende la cosa ancora più chiara (e serve comunque per GitHub Pages);
   - *Stockfish*: il sorgente esatto del file `.wasm` è il tag `v17.1.0` di nmrugg/stockfish.js. La licenza permette di
     indicare un server di terzi, **ma l'obbligo di garantirne la disponibilità resta tuo** finché distribuisci l'app.
     Consiglio: fai un *fork* di <https://github.com/nmrugg/stockfish.js> nel tuo account GitHub e indica quello.
3. **Mostrare gli "avvisi legali appropriati" nell'interfaccia** (sezione 5(d) e definizione nella sezione 0): copyright,
   assenza di garanzia, licenza, come ottenere il sorgente. Fatto: finestra **"Informazioni e licenze"** in fondo alla pagina.
   Da completare: il nome del titolare del copyright e il link al tuo repository (`src/config/ui.js`).
4. **Conservare gli avvisi di copyright** di Stockfish, della build JavaScript (© Chess.com, LLC, è nell'intestazione di
   `engine/stockfish.js`: non toglierla), di chess.js e dei pezzi. Fatto.
5. **Se modifichi Stockfish**, distribuire le modifiche con GPLv3 e segnalare che il file è stato modificato (sezione 5(a)).
   Oggi i file del motore sono quelli originali (verificato con l'hash).

Cosa la GPLv3 **permette**: usare, modificare, distribuire e anche **vendere** l'app o servizi collegati.
Cosa **non permette**: aggiungere restrizioni per chi la riceve (sezione 10). Per esempio, non puoi vietare di copiare o
ridistribuire l'app, né renderla closed-source.

**Scenari di pubblicazione:**

- *Sito statico (GitHub Pages, Netlify) / PWA installata dal browser*: è lo scenario attuale, gli obblighi sopra bastano.
- *App negli store (App Store, Google Play)*: le condizioni degli store possono aggiungere restrizioni d'uso
  incompatibili con la sezione 10 della GPLv3. È un punto controverso per il codice di cui non sei l'unico autore
  (Stockfish). **Non l'ho verificato sui termini attuali degli store**: va controllato prima di quella scelta.
- *Analisi su un tuo server* (motore che gira sul server, l'utente riceve solo i risultati): con la GPL (non AGPL)
  questo non è "distribuzione". Non è però il modo in cui funziona oggi l'app.

## 3. Nomi, marchi e grafica di Chess.com e Lichess

- **Nomi.** Dire che l'app legge i PGN "di Chess.com e Lichess" è un uso descrittivo dei nomi, normalmente accettato.
  Non usare i loro loghi, non chiamare l'app con nomi simili e non far pensare a un'affiliazione. Fatto: dichiarazione
  di non affiliazione in README, avvisi e finestra informazioni.
- **Grafica di Chess.com.** La pagina della loro API pubblica chiede espressamente di rispettare la loro proprietà
  intellettuale: *"board color palettes, piece designs, sound effects"*. Situazione attuale:
  - scacchiera marrone, non la palette verde di Chess.com;
  - pezzi "cburnett", con licenza libera;
  - nessun suono;
  - icone delle categorie disegnate da zero, con i simboli standard di annotazione (!!, !, ?!, ?, ??).
- **"Game Review"** è il nome della funzione di Chess.com: l'app usa "Revisione partita".
- **Punto da valutare: le categorie.** Le parole (Brilliant, Great, Best…) sono generiche. Però l'insieme delle stesse
  9 categorie con colori simili può ricordare l'aspetto della Game Review di Chess.com. Il nostro colore per
  "Brillante" (turchese) **mi risulta** simile al loro, ma non l'ho verificato su una fonte ufficiale. Cambiare quel
  colore costa una riga di CSS (`--cls-brilliant` in `style.css`) e riduce il rischio di confusione.
- **Lichess.** I termini di servizio non parlano di marchi. Il codice e le formule di Lichess sono open source (AGPL):
  qui le formule sono reimplementate, non copiate, e sono citate come fonte.
- **Il nome CHES54.** Non ho fatto ricerche di anteriorità. Prima di investire sul nome, controlla le banche dati dei
  marchi (UIBM per l'Italia, EUIPO per l'UE).

## 4. Se aggiungerai l'importazione delle partite tramite API

Oggi l'app **non usa nessuna API**: legge solo i PGN che l'utente incolla o apre.

**Lichess** (documentazione ufficiale dell'API, licenza AGPL-3.0):
- *"Only make one request at a time."* Con una risposta **429** bisogna aspettare: *"In most cases, waiting one minute
  before retrying will be sufficient."*
- L'esportazione delle partite di un utente (`GET /api/games/user/{username}`) funziona anche senza login, con un
  flusso limitato (*"Anonymous request: 20 games per second"*).
- Termini di servizio: uso personale o commerciale consentito, ma è vietato *"Abuse of our infrastructure or resources -
  This includes abuse of our APIs."*

**Chess.com** (Published-Data API, "PubAPI"):
- *"The PubAPI is a read-only REST API"*, solo dati pubblici.
- Partite di un mese in formato PGN: `https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}/pgn`.
- *"Your serial access rate is unlimited"*: richieste in parallelo possono ricevere 429, e in caso di attività
  anomala *"we may block your application entirely"*.
- Le risposte sono in cache: si aggiornano al massimo ogni 12–24 ore (la pagina riporta entrambi i valori).
- Chiedono un *User-Agent* riconoscibile con un contatto. **Da un'app nel browser non si può impostare lo User-Agent**:
  se servisse, bisognerebbe passare da un piccolo server.
- Per dubbi sull'uso: legal@chess.com.

**Fair play.** Entrambe le piattaforme vietano l'aiuto di un motore durante una partita in corso (Lichess:
*"We prohibit the use of any external assistance used whilst a game you are involved in is ongoing"*).
Per questo l'app è pensata per partite concluse. Se aggiungi l'importazione, importa **solo partite finite**
(gli archivi di Chess.com e l'export di Lichess le restituiscono). Non usare endpoint per la partita in corso.

## 5. Lista di controllo prima di pubblicare

- [x] Inserire il nome del titolare del copyright e il link al repository in `src/config/ui.js`.
- [ ] Pubblicare il repository (pubblico) con `LICENSE`, `THIRD-PARTY-NOTICES.md` e questo file.
- [ ] Fare un fork di nmrugg/stockfish.js (tag `v17.1.0`) e aggiornare il link in `engine/README.md` e in `src/config/ui.js`.
- [ ] Decidere se cambiare il colore della categoria "Brillante".
- [ ] Verificare il nome "CHES54" nelle banche dati dei marchi.
- [ ] Prima di pubblicare negli store: verificare la compatibilità dei loro termini con la GPLv3.

## Fonti consultate (2026-10-18)

- Stockfish, README e licenza: <https://github.com/official-stockfish/Stockfish>
- stockfish.js, README e licenza: <https://github.com/nmrugg/stockfish.js> (tag `v17.1.0`, commit `f9512ef`)
- Pacchetto npm `stockfish@17.1.0`: <https://www.npmjs.com/package/stockfish/v/17.1.0> (file e hash confrontati con quelli dell'app)
- Testo GPLv3: <https://www.gnu.org/licenses/gpl-3.0.txt>
- chess.js, licenza: <https://github.com/jhlywa/chess.js/blob/master/LICENSE>
- Lichess, licenze dei file (pezzi cburnett): <https://github.com/lichess-org/lila/blob/master/COPYING.md>
- Lichess, documentazione API: <https://github.com/lichess-org/api> (specifica OpenAPI, versione 2.0.176)
- Lichess, termini di servizio: <https://lichess.org/terms-of-service>
- Chess.com, Published-Data API: <https://www.chess.com/news/view/published-data-api>
