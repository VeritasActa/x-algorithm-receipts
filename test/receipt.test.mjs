import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalHash, canonicalize, merkleProof, merkleRoot, publicJwksFromPrivateJwk, signReceipt, verifyMerkleProof, verifyReceiptLocally } from '../scripts/lib.mjs';
import { buildDeploymentPayload, buildFeedCertificatePayload } from '../scripts/deployment-receipt-demo.mjs';
import { buildStdoutLineItems, parsePhoenixRankingOutput } from '../scripts/phoenix-parser.mjs';
import { createDemoIssuer, issueDemoToken, verifyDemoVoprfToken } from '../scripts/voprf-demo-crypto.mjs';

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
  assert.match(receipt.payload.ranked_items_root, /^merkle-rfc6962-sha256:[0-9a-f]{64}$/);
  assert.equal(receipt.payload.output_top_n_optional.top_n, 10);
  assert.equal(receipt.payload.output_top_n_optional.items.length, 10);
  assert.equal(receipt.payload.ranked_items_top_n_optional.top_n, 10);
  assert.equal(receipt.payload.ranked_items_top_n_optional.items.length, 10);
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

test('Phoenix parser extracts structured ranked rows from pipeline stdout', () => {
  const stdout = `
PIPELINE RESULTS - User 12345
Rank  Score    Ret     Fav     Reply   RT      Dwell   VQV     Topics                         Post URL
1     0.3922   0.8980  0.2930  0.0003  0.0114  0.4785  0.0781  Sports,NBA                     https://x.com/a/status/2055371034010726771
2     0.3010   0.7070  0.2010  0.0040  0.0100  0.3890  0.0550  -                              https://x.com/a/status/2055371034010726772
`;
  const rows = parsePhoenixRankingOutput(stdout);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    rank: 1,
    post_url: 'https://x.com/a/status/2055371034010726771',
    post_id: '2055371034010726771',
    score: 0.3922,
    retrieval_score: 0.898,
    favorite_probability: 0.293,
    reply_probability: 0.0003,
    repost_probability: 0.0114,
    dwell_probability: 0.4785,
    vqv_score: 0.0781,
    topics: ['Sports', 'NBA'],
  });
  assert.deepEqual(rows[1].topics, []);
});

test('stdout line builder preserves a stable line-indexed byte disclosure view', () => {
  const items = buildStdoutLineItems(' A \n\n B \n');
  assert.deepEqual(items, [
    { index: 0, line: 'A' },
    { index: 1, line: 'B' },
  ]);
});

test('Merkle proof verifies structured top-N records against ranked_items_root', () => {
  const receipt = JSON.parse(readFileSync(new URL('../examples/x-feed-real.receipt.json', import.meta.url), 'utf8'));
  const items = receipt.payload.ranked_items_top_n_optional.items;
  const opening = merkleProof(items, 0);
  assert.equal(verifyMerkleProof(items[0], opening, receipt.payload.ranked_items_root), true);
  assert.equal(verifyMerkleProof({ ...items[0], score: 999 }, opening, receipt.payload.ranked_items_root), false);
});

test('VOPRF demo token verifies and gates a receipt-specific policy', async () => {
  const issuer = createDemoIssuer({ kid: 'unit-test-issuer' });
  const receiptId = 'sha256:unit-test-receipt';
  const policy = 'dsa-researcher:top-10';
  const { token } = issueDemoToken({ issuer, origin: 'https://researcher.example', policy, receiptId });
  const ok = await verifyDemoVoprfToken(token, { expectedPolicy: policy, expectedReceiptId: receiptId, requireClientProof: true });
  assert.equal(ok.valid, true);
  assert.equal(ok.dleq.issuer, true);
  assert.equal(ok.dleq.client, true);
  assert.ok(ok.nullifier);

  const wrong = await verifyDemoVoprfToken(token, { expectedPolicy: 'dsa-researcher:top-30', expectedReceiptId: receiptId, requireClientProof: true });
  assert.equal(wrong.valid, false);
  assert.equal(wrong.error, 'policy_mismatch');
});

test('VOPRF nullifiers differ across receipt scopes', async () => {
  const issuer = createDemoIssuer({ kid: 'unit-test-issuer' });
  const a = issueDemoToken({ issuer, origin: 'https://researcher.example', policy: 'dsa-researcher:top-10', receiptId: 'sha256:a' });
  const b = issueDemoToken({ issuer, origin: 'https://researcher.example', policy: 'dsa-researcher:top-10', receiptId: 'sha256:b' });
  const va = await verifyDemoVoprfToken(a.token, { requireClientProof: true });
  const vb = await verifyDemoVoprfToken(b.token, { requireClientProof: true });
  assert.equal(va.valid, true);
  assert.equal(vb.valid, true);
  assert.notEqual(va.nullifier, vb.nullifier);
});

test('committed gated disclosure fixture opens top-10 rows against real receipt root', () => {
  const receipt = JSON.parse(readFileSync(new URL('../examples/x-feed-real.receipt.json', import.meta.url), 'utf8'));
  const disclosure = JSON.parse(readFileSync(new URL('../examples/voprf-gated-disclosure/researcher-top10.disclosure.json', import.meta.url), 'utf8'));
  assert.equal(disclosure.disclosed_items.length, 10);
  assert.equal(disclosure.merkle_openings.length, 10);
  disclosure.disclosed_items.forEach((item, index) => {
    assert.equal(verifyMerkleProof(item, disclosure.merkle_openings[index], receipt.payload.ranked_items_root), true);
  });
});

test('deployment receipt fixture verifies and binds the real Phoenix receipt version metadata', () => {
  const rankReceipt = JSON.parse(readFileSync(new URL('../examples/x-feed-real.receipt.json', import.meta.url), 'utf8'));
  const deploymentReceipt = JSON.parse(readFileSync(new URL('../examples/deployment-version/deployment.receipt.json', import.meta.url), 'utf8'));
  const jwks = JSON.parse(readFileSync(new URL('../examples/deployment-version/deployment.jwks', import.meta.url), 'utf8'));

  assert.equal(verifyReceiptLocally(deploymentReceipt, jwks.keys[0]), true);
  assert.equal(deploymentReceipt.type, 'recommender_deployment_receipt');
  assert.equal(deploymentReceipt.payload.receipt_profile, 'recommender.deployment_version.v1');
  assert.equal(deploymentReceipt.payload.algorithm.commit, rankReceipt.payload.algorithm_commit);
  assert.equal(deploymentReceipt.payload.model_bundle.artifacts_root, rankReceipt.payload.model_artifacts_root);
  assert.equal(deploymentReceipt.payload.config.config_hash, rankReceipt.payload.config_hash);
  assert.match(deploymentReceipt.payload.policy_bundle.root, /^merkle-rfc6962-sha256:[0-9a-f]{64}$/);
});

test('feed session certificate fixture verifies and references the deployment receipt', () => {
  const deploymentReceipt = JSON.parse(readFileSync(new URL('../examples/deployment-version/deployment.receipt.json', import.meta.url), 'utf8'));
  const certificate = JSON.parse(readFileSync(new URL('../examples/deployment-version/feed-session-certificate.receipt.json', import.meta.url), 'utf8'));
  const jwks = JSON.parse(readFileSync(new URL('../examples/deployment-version/deployment.jwks', import.meta.url), 'utf8'));

  assert.equal(verifyReceiptLocally(certificate, jwks.keys[0]), true);
  assert.equal(certificate.type, 'for_you_feed_version_certificate');
  assert.equal(certificate.payload.receipt_profile, 'recommender.feed_version_certificate.v1');
  assert.equal(certificate.payload.deployment_receipt_hash, canonicalHash(deploymentReceipt));
  assert.equal(certificate.payload.disclosed_to_user.algorithm_commit, deploymentReceipt.payload.algorithm.commit);
  assert.match(certificate.payload.private_session_commitment, /^merkle-rfc6962-sha256:[0-9a-f]{64}$/);
});

test('deployment payload builders preserve version metadata', () => {
  const rankReceipt = JSON.parse(readFileSync(new URL('../examples/x-feed-real.receipt.json', import.meta.url), 'utf8'));
  const deployment = buildDeploymentPayload({ rankReceipt, issuedAt: '2026-05-17T12:00:00.000Z' });
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const privateJwk = { ...privateKey.export({ format: 'jwk' }), kid: 'deployment-test-key', alg: 'EdDSA', use: 'sig' };
  privateJwk.x = publicKey.export({ format: 'jwk' }).x;
  const deploymentReceipt = signReceipt('recommender_deployment_receipt', deployment, privateJwk, { issued_at: '2026-05-17T12:00:00.000Z' }).artifact;
  const certificate = buildFeedCertificatePayload({ deployment, deploymentReceipt, rankReceipt, issuedAt: '2026-05-17T12:00:00.000Z' });

  assert.equal(deployment.algorithm.commit, rankReceipt.payload.algorithm_commit);
  assert.equal(certificate.disclosed_to_user.policy_bundle_root, deployment.policy_bundle.root);
  assert.equal(certificate.deployment_receipt_hash, canonicalHash(deploymentReceipt));
});
