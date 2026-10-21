# Problemi: fonte e verifica

File generato da `npm run build:puzzles` il 2026-10-21. Non modificarlo a mano.

## Fonte
- Database dei problemi di Lichess: <https://database.lichess.org/lichess_db_puzzle.csv.zst> (ultima modifica del file: Fri, 02 Oct 2026 08:51:45 GMT).
- Licenza: **CC0 1.0** (pubblico dominio), <https://database.lichess.org/#puzzles>.
- Letti in streaming il 2026-10-21 i primi 600000 problemi del file (non tutto il database).
  SHA-256 delle righe lette (`data/puzzles/source/puzzles-slice.csv`, esclusa da git): `9c1fe9d84cedb7021c0270c5ebce4accfcf5fc5088f39870cb21662527b28044`.
- Ogni problema conserva il suo identificativo Lichess (`https://lichess.org/training/<id>`) e il link alla partita da cui viene.

## Selezione
- Problemi letti: 600000; di buona qualità: 264552 (popolarità ≥ 85, partite giocate ≥ 300,
  deviazione del punteggio ≤ 90, al massimo 8 semimosse).
- Tema principale = il primo, in quest'ordine, tra i temi assegnati da Lichess: mateIn1, mateIn2, mateIn3, fork, pin, skewer, discoveredAttack, hangingPiece, deflection, endgame.
  **I temi sono quelli di Lichess** (calcolati dal loro programma), non una nostra valutazione.
- Difficoltà dal punteggio Lichess del problema: Facile 0–1299, Medio 1300–1799, Difficile 1800–2299, Esperto 2300–3999.
- Fino a 15 problemi per tema e difficoltà, prima quelli giocati da più persone (al massimo 45 candidati provati).

## Verifica con Stockfish (regole in `src/analysis/puzzle.js`)
- Mosse da trovare: profondità 18, MultiPV 2. La mossa deve essere la prima scelta del motore e
  l'unica buona (la seconda linea perde almeno 10 punti di win%; con un matto, la seconda linea non deve dare
  un matto altrettanto veloce). All'ultima mossa basta che la mossa dia scacco matto.
- Risposte dell'avversario: profondità 14, MultiPV 3; prima scelta del motore o al massimo
  3 punti di win% peggiore.

## Risultato: 588 problemi
| Tema | Facile | Medio | Difficile | Esperto |
|---|---|---|---|---|
| Matto in 1 | 15 | 15 | 15 | 3 |
| Matto in 2 | 15 | 15 | 15 | 15 |
| Matto in 3 | 15 | 15 | 15 | 15 |
| Forchetta | 15 | 15 | 15 | 15 |
| Inchiodatura | 15 | 15 | 15 | 15 |
| Infilata | 15 | 15 | 15 | 15 |
| Attacco di scoperta | 15 | 15 | 15 | 15 |
| Pezzo in presa | 15 | 15 | 15 | 15 |
| Deviazione | 15 | 15 | 15 | 15 |
| Finale | 15 | 15 | 15 | 15 |

## Esclusi dalla verifica
- risposta: la risposta dell'avversario non è tra le migliori del motore: 29
- risposta: la risposta dell'avversario non è la migliore: 14
- mossa: non è l'unica mossa buona: 1
