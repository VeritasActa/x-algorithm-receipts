import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalize, merkleRoot, publicJwksFromPrivateJwk, signReceipt, verifyReceiptLocally } from '../scripts/lib.mjs';

test('canonicalize sorts keys recursively', () => {
  assert.equal(canonicalize({ b: 2, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":2}');
});

test('merkle root is deterministic and order-sensitive', () => {
  const a = merkleRoot([{ x: 1 }, { x: 2 }]);
  const b = merkleRoot([{ x: 1 }, { x: 2 }]);
  const c = merkleRoot([{ x: 2 }, { x: 1 }]);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('committed demo receipt has the expected recommender profile', () => {
  const receipt = JSON.parse(readFileSync(new URL('../examples/x-feed-demo.receipt.json', import.meta.url), 'utf8'));
  assert.equal(receipt.type, 'recommender_rank_receipt');
  assert.equal(receipt.payload.receipt_profile, 'recommender.post_ranking.v1');
  assert.equal(receipt.payload.algorithm_repo, 'https://github.com/xai-org/x-algorithm');
  assert.match(receipt.payload.output_root, /^merkle-rfc6962-sha256:[0-9a-f]{64}$/);
  assert.equal(receipt.payload.output_top_n_optional.top_n, 10);
  assert.equal(receipt.payload.output_top_n_optional.items.length, 10);
});

test('signReceipt output verifies with the matching JWKS public key', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const privateJwk = { ...privateKey.export({ format: 'jwk' }), kid: 'unit-test-key', alg: 'EdDSA', use: 'sig' };
  const publicJwk = publicKey.export({ format: 'jwk' });
  privateJwk.x = publicJwk.x;
  const { artifact } = signReceipt('recommender_rank_receipt', { receipt_profile: 'recommender.post_ranking.v1' }, privateJwk, { issued_at: '2026-05-16T00:00:00Z' });
  const jwks = publicJwksFromPrivateJwk(privateJwk);
  assert.equal(verifyReceiptLocally(artifact, jwks.keys[0]), true);
});
