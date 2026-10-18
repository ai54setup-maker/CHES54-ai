# Motore: Stockfish 17.1 (build WebAssembly "lite", single-thread)

| File | Origine | SHA-256 |
|---|---|---|
| `stockfish.js` | pacchetto npm [`stockfish@17.1.0`](https://www.npmjs.com/package/stockfish/v/17.1.0), file `src/stockfish-17.1-lite-single-03e3232.js` | `1c8265e52fdaef797684b4979b42c5dcfe0350df3e11a87e48e4ec5f86e0ca5c` |
| `stockfish.wasm` | stesso pacchetto, file `src/stockfish-17.1-lite-single-03e3232.wasm` | `7ca31bedd166148931a1cc84dbd8dd9cf001744e9994caf23a3c6ff4988d7086` |

- **Licenza:** GNU GPL versione 3 (testo completo: [`../LICENSE`](../LICENSE)).
- **Codice sorgente corrispondente:** <https://github.com/nmrugg/stockfish.js/tree/v17.1.0>
  (commit `f9512ef9aff391026813a56855dd086cb72a2d58`), basato su Stockfish
  <https://github.com/official-stockfish/Stockfish> (autori: vedi il file AUTHORS di Stockfish).
- **Rete neurale (NNUE):** incorporata nel file `.wasm`; autori indicati nell'intestazione di `stockfish.js`
  (Linmiao Xu, "linrock"). Le pagine consultate non indicano una licenza separata per la rete.
- I file non sono stati modificati. `package.json` in questa cartella serve solo a eseguire il motore in Node (test).

Per aggiornare il motore: sostituire i due file con quelli di una nuova versione del pacchetto, aggiornare questa
tabella (nomi, hash, link al sorgente) e la versione in `sw.js`.
