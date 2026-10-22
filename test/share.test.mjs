// Condivisione con un link: andata e ritorno, link rotti, PGN essenziale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharePgn, encodeShare, decodeShare, MAX_SHARED_PGN } from '../src/analysis/share.js';
import { gameFromPgn } from '../src/analysis/game-model.js';

const PGN = '[Event "Club"]\n[White "Mario"]\n[Black "Anna"]\n[Result "1-0"]\n[WhiteClock "x"]\n\n1. e4 {[%clk 0:03:00]} e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7# 1-0\n';

test('sharePgn: intestazioni principali e mosse, senza commenti e orologio', () => {
  const pgn = sharePgn(gameFromPgn(PGN));
  assert.match(pgn, /\[White "Mario"\]/);
  assert.doesNotMatch(pgn, /clk|WhiteClock/);
  const g = gameFromPgn(pgn);
  assert.equal(g.plies.length, 7);
  assert.equal(g.result, '1-0');
});

test('sharePgn: posizione iniziale diversa (FEN)', () => {
  const g = gameFromPgn('[SetUp "1"]\n[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1"]\n\n1. Rd8# 1-0');
  assert.equal(gameFromPgn(sharePgn(g)).startFen, '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
});

test('encodeShare / decodeShare: andata e ritorno compresso, con la profondità', async () => {
  const pgn = sharePgn(gameFromPgn(PGN));
  const frag = await encodeShare(pgn, 14);
  assert.match(frag, /^r=z[A-Za-z0-9_-]+&d=14$/);
  assert.ok(frag.length < pgn.length * 1.2);
  assert.deepEqual(await decodeShare('#' + frag), { pgn, depth: 14 });
  assert.deepEqual(await decodeShare(frag.replace('&d=14', '')), { pgn, depth: null });
});

test('decodeShare: link rotti o estranei → null', async () => {
  for (const h of ['', '#', '#x=1', '#r=', '#r=zzzz', '#r=q' + 'a'.repeat(10), `#r=t${'A'.repeat(MAX_SHARED_PGN * 2 + 10)}`]) {
    assert.equal(await decodeShare(h), null, h.slice(0, 20));
  }
  assert.equal((await decodeShare('#r=t' + Buffer.from('1. e4').toString('base64url'))).pgn, '1. e4');
});
