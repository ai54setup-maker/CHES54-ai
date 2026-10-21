# Lezioni: verifica

Generato da `npm run check:lessons` il 2026-10-21. SHA-256 di `lessons.json`: `9a78cfb0a905cc0afec8d31d2586368fb235fa0e8350b295de6285a3d0e47ceb`.
Esito: tutti i passi verificati.

- Spiegazioni: posizioni e mosse legali; scacco, matto, stallo, attacchi e inchiodature dichiarati nel passo
  controllati con chess.js.
- Esercizi con una soluzione: ogni mossa come nei problemi (prima scelta di Stockfish a profondità 18, unica buona;
  risposte a profondità 14); il nome della tattica, se indicato, è quello riconosciuto dall'Allenatore
  (`recognizeTactic`) sulla linea del motore.
- Esercizi con più risposte: valutate tutte le mosse legali a profondità 16; le accettate perdono al massimo
  8 punti di win% rispetto alla migliore, tutte le altre almeno 10.

| Passo | Tipo | Esito | Valutazione iniziale (Bianco) |
|---|---|---|---|
| fork passo 1 | spiegazione | ✔ |  |
| fork passo 2 | spiegazione | ✔ |  |
| fork passo 3 | esercizio | ✔ | +4.42 |
| fork passo 4 | esercizio | ✔ | +9.59 |
| pin passo 1 | spiegazione | ✔ |  |
| pin passo 2 | spiegazione | ✔ |  |
| pin passo 3 | esercizio | ✔ | +5.60 |
| skewer passo 1 | spiegazione | ✔ |  |
| skewer passo 2 | spiegazione | ✔ |  |
| skewer passo 3 | esercizio | ✔ | +6.95 |
| discovered passo 1 | spiegazione | ✔ |  |
| discovered passo 2 | spiegazione | ✔ |  |
| discovered passo 3 | esercizio | ✔ | +5.52 |
| back-rank passo 1 | spiegazione | ✔ |  |
| back-rank passo 2 | spiegazione | ✔ |  |
| back-rank passo 3 | esercizio | ✔ | M1 |
| back-rank passo 4 | esercizio | ✔ | M2 |
| queen-mate passo 1 | spiegazione | ✔ |  |
| queen-mate passo 2 | spiegazione | ✔ |  |
| queen-mate passo 3 | esercizio | ✔ | M1 |
| opening-principles passo 1 | spiegazione | ✔ |  |
| opening-principles passo 2 | spiegazione | ✔ |  |
| opening-principles passo 3 | spiegazione | ✔ |  |
| scholars-mate passo 1 | spiegazione | ✔ |  |
| scholars-mate passo 2 | spiegazione | ✔ |  |
| scholars-mate passo 3 | esercizio | ✔ | -0.28 |
| opposition passo 1 | spiegazione | ✔ |  |
| opposition passo 2 | spiegazione | ✔ |  |
| opposition passo 3 | esercizio | ✔ | +8.01 |
| square-rule passo 1 | spiegazione | ✔ |  |
| square-rule passo 2 | esercizio | ✔ | 0.00 |
