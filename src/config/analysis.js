// Parametri delle formule di analisi: unico posto dove cambiarli.
// Le fonti e lo stato di verifica di ogni valore sono documentati in CLAUDE.md.

export const ANALYSIS_CONFIG = Object.freeze({
  winPercent: Object.freeze({
    // Coefficiente della sigmoide di Lichess: win% = 50 + 50 * (2 / (1 + exp(-k * cp)) - 1)
    coefficient: 0.00368208,
  }),
});
