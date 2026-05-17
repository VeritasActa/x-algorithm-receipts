#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  canonicalHash,
  ensureDemoPrivateJwk,
  merkleProof,
  publicJwksFromPrivateJwk,
  signReceipt,
  verifyMerkleProof,
  verifyReceiptLocally,
} from './lib.mjs';
import {
  createDemoIssuer,
  issueDemoToken,
  shortHash,
  verifyDemoVoprfToken,
} from './voprf-demo-crypto.mjs';

const DEFAULT_RECEIPT = 'examples/x-feed-real.receipt.json';
const DEFAULT_JWKS = 'examples/real.jwks';
const DEFAULT_OUT = 'examples/voprf-gated-disclosure/researcher-top10.disclosure.json';
const DEFAULT_ATTESTATION = 'examples/voprf-gated-disclosure/gated-disclosure.attestation.json';
const DEFAULT_ATTESTATION_JWKS = 'examples/voprf-gated-disclosure/gated-disclosure.jwks';
const PRIVATE_KEY = '.tmp/demo.private.jwk';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const receiptPath = resolve(root, args.receipt || DEFAULT_RECEIPT);
  const jwksPath = resolve(root, args.jwks || DEFAULT_JWKS);
  const topN = Number(args['top-n'] || 10);
  const policy = args.policy || `dsa-researcher:top-${topN}`;
  const origin = args.origin || 'https://researcher.example';

  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const jwks = JSON.parse(readFileSync(jwksPath, 'utf8'));
  const key = jwks.keys.find((candidate) => candidate.kid === receipt.kid) || jwks.keys[0];
  const receiptValid = verifyReceiptLocally(receipt, key);
  if (!receiptValid) throw new Error(`receipt signature failed for ${receiptPath}`);

  const receiptId = canonicalHash({
    type: receipt.type,
    issued_at: receipt.issued_at,
    algorithm_commit: receipt.payload.algorithm_commit,
    ranked_items_root: receipt.payload.ranked_items_root,
  });
  const items = receipt.payload.ranked_items_top_n_optional?.items || [];
  if (items.length === 0) throw new Error('receipt does not carry structured ranked items for demo disclosure');
  if (topN > items.length) throw new Error(`requested top ${topN}, but receipt only carries ${items.length} structured items`);

  const issuer = createDemoIssuer();
  const { token, issuerLog } = issueDemoToken({ issuer, origin, policy, receiptId });
  const tokenResult = await verifyDemoVoprfToken(token, {
    expectedPolicy: policy,
    expectedReceiptId: receiptId,
    requireClientProof: true,
  });
  if (!tokenResult.valid) throw new Error(`VOPRF token rejected: ${tokenResult.error}`);

  const disclosure = buildDisclosureBundle({ receipt, receiptId, tokenResult, items, topN, policy });
  const ok = disclosure.disclosed_items.every((item, index) => (
    verifyMerkleProof(item, disclosure.merkle_openings[index], receipt.payload.ranked_items_root)
  ));
  if (!ok) throw new Error('disclosure Merkle proof verification failed');

  const attestation = signDisclosureAttestation({ disclosure, receipt, tokenResult });
  if (args['write-fixtures']) {
    writeJson(resolve(root, args.out || DEFAULT_OUT), disclosure);
    writeJson(resolve(root, args['attestation-out'] || DEFAULT_ATTESTATION), attestation.artifact);
    writeJson(resolve(root, args['attestation-jwks-out'] || DEFAULT_ATTESTATION_JWKS), attestation.jwks);
  }

  printSummary({ receipt, receiptId, topN, policy, issuerLog, tokenResult, disclosure, wrote: Boolean(args['write-fixtures']) });
}

function buildDisclosureBundle({ receipt, receiptId, tokenResult, items, topN, policy }) {
  const disclosedItems = items.slice(0, topN);
  return {
    profile: 'scopeblind.recommender.voprf-gated-disclosure.v1',
    demo_mode: true,
    demo_note: 'Local demo of BRASS/VOPRF-gated disclosure. Production issuance is the managed ScopeBlind API; this fixture does not call api.scopeblind.com.',
    receipt_ref: {
      receipt_id: receiptId,
      type: receipt.type,
      algorithm_commit: receipt.payload.algorithm_commit,
      ranked_items_root: receipt.payload.ranked_items_root,
      ranked_items_count: receipt.payload.ranked_items_count,
    },
    authorization: {
      token_format: 'voprf-p256-sha256',
      policy,
      token_kid: tokenResult.kid,
      nullifier_hint: tokenResult.nullifier.slice(0, 18),
      dleq: tokenResult.dleq,
    },
    disclosure: {
      field: 'ranked_items_top_n_optional.items',
      top_n: topN,
      hidden_count: Math.max(0, items.length - topN),
      hidden_fields_remain_committed: true,
    },
    disclosed_items: disclosedItems,
    merkle_openings: disclosedItems.map((_, index) => merkleProof(items, index)),
    caveat: 'The token gates disclosure of a committed opening. It proves authorization and receipt binding, not ranking fairness or production deployment.',
  };
}

function signDisclosureAttestation({ disclosure, receipt, tokenResult }) {
  const privateJwk = ensureDemoPrivateJwk(PRIVATE_KEY);
  const payload = {
    profile: 'scopeblind.recommender.gated-disclosure-attestation.v1',
    receipt_id: disclosure.receipt_ref.receipt_id,
    receipt_signature_hash: canonicalHash(receipt),
    disclosure_hash: canonicalHash(disclosure),
    token_nullifier_hint: tokenResult.nullifier.slice(0, 18),
    policy: disclosure.authorization.policy,
    disclosed_top_n: disclosure.disclosure.top_n,
    caveat: disclosure.caveat,
  };
  const { artifact } = signReceipt('recommender_gated_disclosure_attestation', payload, privateJwk);
  return { artifact, jwks: publicJwksFromPrivateJwk(privateJwk) };
}

function printSummary({ receipt, receiptId, topN, policy, issuerLog, tokenResult, disclosure, wrote }) {
  console.log('VOPRF-gated recommender disclosure demo');
  console.log('----------------------------------------');
  console.log(`[ok] receipt signature valid: ${receipt.type}`);
  console.log(`[ok] receipt id: ${receiptId}`);
  console.log(`[ok] algorithm commit: ${receipt.payload.algorithm_commit}`);
  console.log(`[ok] ranked_items_root: ${receipt.payload.ranked_items_root}`);
  console.log('');
  console.log('Issuer view');
  console.log(`  kid: ${issuerLog.kid}`);
  console.log(`  blinded request: ${issuerLog.blinded_request}`);
  console.log(`  issued evaluation: ${issuerLog.issued_evaluation}`);
  console.log(`  sees receipt id: ${issuerLog.sees_receipt_id}`);
  console.log(`  sees policy: ${issuerLog.sees_policy}`);
  console.log('');
  console.log('Verifier view');
  console.log(`  VOPRF token valid: ${tokenResult.valid}`);
  console.log(`  DLEQ issuer proof: ${tokenResult.dleq.issuer}`);
  console.log(`  DLEQ client proof: ${tokenResult.dleq.client}`);
  console.log(`  policy: ${policy}`);
  console.log(`  nullifier hint: ${tokenResult.nullifier.slice(0, 18)}...`);
  console.log('');
  console.log('Disclosure');
  console.log(`  disclosed structured ranked items: top ${topN}`);
  console.log(`  hidden committed items: ${disclosure.disclosure.hidden_count}`);
  console.log(`  first disclosed item: #${disclosure.disclosed_items[0].rank} score=${disclosure.disclosed_items[0].score} post=${disclosure.disclosed_items[0].post_id}`);
  console.log(`  disclosure hash: ${shortHash(JSON.stringify(disclosure), 24)}`);
  console.log('');
  console.log('Result');
  console.log('  The receipt verifies offline. The VOPRF token proves the holder is');
  console.log('  authorized for this disclosure tier. The disclosed rows verify against');
  console.log('  the signed ranked_items_root. The issuer does not see the receipt id,');
  console.log('  policy, or nullifier in this local BRASS-style flow.');
  if (wrote) console.log(`\nWrote fixtures under ${DEFAULT_OUT.split('/').slice(0, -1).join('/')}/`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) throw new Error(`unexpected argument ${item}`);
    const key = item.slice(2);
    if (key === 'write-fixtures') {
      out[key] = true;
    } else {
      const value = argv[++i];
      if (value === undefined) throw new Error(`missing value for --${key}`);
      out[key] = value;
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
