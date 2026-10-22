# Statistiche delle aperture: fonte

File generato da `npm run build:opening-stats` il 2026-10-22. Non modificarlo a mano.

- Fonte: database delle partite di Lichess, <https://database.lichess.org/standard/lichess_db_standard_rated_2026-09.pgn.zst> (ultima modifica: Sat, 03 Oct 2026 05:06:59 GMT).
- Licenza: **CC0 1.0** (pubblico dominio), <https://database.lichess.org/>. Nessun account né API: download pubblico.
- Lette le prime 10.000.000 partite del file (3.27 GB compressi), tenute
  6.332.724: partite valutate in cadenza blitz, rapid, classical (bullet escluso), con entrambi i punteggi.
- Per ogni posizione dell'albero (dataset lichess-org/chess-openings) si conta la mossa giocata e il risultato finale,
  nella fascia di **chi muove**. Ci si ferma alla prima mossa che esce dall'albero (che viene comunque contata).
- **Fasce di punteggio Lichess (non Elo FIDE):** < 1000, 1000–1400, 1400–1800, 1800–2200, 2200+.
- Partite per fascia (prima mossa del Bianco): < 1000: 439.415; 1000–1400: 1.561.526; 1400–1800: 2.518.378; 1800–2200: 1.575.996; 2200+: 237.409.
- Tenute per posizione e fascia le 5 mosse più giocate. Nell'app le statistiche di una posizione si mostrano
  solo con almeno 20 partite nella fascia.
