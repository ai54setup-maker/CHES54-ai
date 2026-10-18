# Componenti di terze parti

CHES54.ai è distribuito con licenza GNU GPL versione 3 (vedi [`LICENSE`](LICENSE)) e include i componenti
seguenti. Provenienza e licenze verificate il 2026-10-18.

| Componente | Versione / provenienza | Autori | Licenza | Dove si trova |
|---|---|---|---|---|
| Stockfish (build WebAssembly di stockfish.js) | npm `stockfish@17.1.0`, build `lite-single-03e3232`; sorgente: <https://github.com/nmrugg/stockfish.js/tree/v17.1.0> | Gli sviluppatori di Stockfish (file AUTHORS di <https://github.com/official-stockfish/Stockfish>); build JavaScript © 2025 Chess.com, LLC (Nathan Rugg) | GPL-3.0 | `engine/` (dettagli e hash in [`engine/README.md`](engine/README.md)) |
| Rete neurale NNUE incorporata in Stockfish | inclusa nel file `.wasm` | Linmiao Xu ("linrock"), secondo l'intestazione di `engine/stockfish.js` | Non indicata separatamente nelle fonti consultate; distribuita dentro i binari GPL-3.0 di Stockfish | `engine/stockfish.wasm` |
| chess.js | npm `chess.js@1.4.0`, file `dist/esm/chess.js` (rimossa solo la riga `sourceMappingURL`) | © 2025 Jeff Hlywa | BSD-2-Clause, testo in [`lib/LICENSE-chess.js.txt`](lib/LICENSE-chess.js.txt) | `lib/chess.js` |
| Pezzi "cburnett" | dal progetto Lichess (<https://github.com/lichess-org/lila>, file COPYING.md) | Colin M.L. Burnett | GPLv2 o successiva (usata qui come GPLv3) | `pieces/` |
| Dataset delle aperture | <https://github.com/lichess-org/chess-openings>, commit `a6189a3` | Contributori di lichess-org/chess-openings | CC0 1.0 (pubblico dominio), testo in [`data/openings/source/COPYING.txt`](data/openings/source/COPYING.txt) | `data/openings/` |
| Partite di esempio | Morphy – Duke Karl/Count Isouard (Parigi 1858); Kasparov – Topalov (Wijk aan Zee 1999) | — | Le mosse di una partita sono fatti, non opere protette | `data/examples/` |

Formule usate (win%, precisione, soglie degli errori): riprese dal codice sorgente di Lichess
(<https://github.com/lichess-org/lila>, <https://github.com/lichess-org/scalachess>), AGPL-3.0. Qui sono
reimplementate: non viene copiato codice di Lichess. Dettagli e commit in [`CLAUDE.md`](CLAUDE.md).

CHES54.ai non è affiliato a Chess.com né a Lichess, e non è approvato da loro. I nomi sono citati solo per
indicare la compatibilità con i file PGN esportati da queste piattaforme.
