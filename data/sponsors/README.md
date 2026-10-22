# Sponsor di CHES54.com

Per aggiungere uno sponsor (nessun codice da toccare):

1. Copia qui il logo (PNG o WebP, max ~200 KB) e, se c'è, la foto (max ~400 KB).
2. Aggiungi una voce in `sponsors.json`:
   - `id`: minuscole, numeri e trattini (es. `piadineria-morgan`)
   - `name`, `city`
   - `description`: `{ "it": "…", "en": "…" }`
   - `url`: link `https://…` (sito, Instagram o Google Maps)
   - `logo`: nome del file in questa cartella, oppure `null` (scheda con il solo nome)
   - `photo`: facoltativa, nome del file oppure `null`
   - `hidden`: `true` per tenerlo nascosto finché i dati non sono completi
3. `npm test` controlla campi, file e link; il service worker mette in cache le immagini da solo.
