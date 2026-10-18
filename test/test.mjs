// Test rapidi della logica (senza browser): node test/test.mjs
import assert from 'node:assert/strict';
import { Chess } from '../lib/chess.js';
import { parseUserMove, toItalian, uciLineToSan } from '../js/notation.js';
import { explainMove } from '../js/explain.js';

const c = new Chess();
for (const [txt, san] of [['d3', 'd3'], ['e5', 'e5'], ['Cf3', 'Nf3'], ['Cc6', 'Nc6'], ['g2g3', 'g3'], ['f8-c5', 'Bc5'], ['Ag2', 'Bg2'], ['d6', 'd6'], ['0-0', 'O-O']]) {
  const m = parseUserMove(c, txt);
  assert.ok(m, `non riconosciuta: ${txt}`);
  assert.equal(c.move(m).san, san, txt);
}
assert.equal(parseUserMove(new Chess(), 'e5'), null, 'il bianco non può giocare e5');
assert.equal(toItalian('exd8=Q+'), 'exd8=D+');
assert.deepEqual(uciLineToSan(new Chess().fen(), ['g1f3', 'b8c6']), ['Cf3', 'Cc6']);

const p = new Chess();
p.move('d3'); p.move('e5');
const why = explainMove(p.fen(), 'g1f3', { cp: 20, mate: null });
console.log('Cf3 dopo 1.d3 e5 →', why);
assert.match(why, /sviluppa/i);
assert.match(why, /e5/);
console.log('O-O →', explainMove('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'e1g1', { cp: 30, mate: null }));
console.log('Matto →', explainMove('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a8', { cp: null, mate: 1 }));
console.log('OK – tutti i test superati');
