// Transport per Node (test e strumenti da riga di comando): Stockfish WASM in un processo figlio.
// Non viene caricato nel browser.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, basename } from 'node:path';

/**
 * @param {string} scriptPath percorso di engine/stockfish.js
 * @returns {import('./engine.js').Transport}
 */
export function nodeTransport(scriptPath) {
  // cwd = cartella del motore, così lo script trova stockfish.wasm accanto a sé.
  const proc = spawn(process.execPath, [basename(scriptPath)], { cwd: dirname(scriptPath) });
  const rl = createInterface({ input: proc.stdout });
  let onLine = () => {};
  let onError = () => {};
  rl.on('line', (line) => onLine(line));
  proc.on('error', (err) => onError(err));
  proc.on('exit', (code) => { if (code) onError(new Error(`Stockfish terminato con codice ${code}`)); });
  return {
    send: (cmd) => { if (proc.stdin.writable) proc.stdin.write(cmd + '\n'); },
    onLine: (cb) => { onLine = cb; },
    onError: (cb) => { onError = cb; },
    terminate: () => {
      proc.stdin.end();
      proc.kill();
    },
  };
}
