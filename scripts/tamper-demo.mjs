#!/usr/bin/env node
/**
 * Tampering demo.
 *
 * Loads the example receipt, flips one byte inside the payload, re-runs the
 * verifier, and shows that the signature check fails. Proves that any change
 * to the signed data invalidates the receipt.
 *
 * Run: npm run tamper-demo
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SOURCE = resolve(REPO_ROOT, 'examples/x-feed-demo.receipt.json');
const JWKS = resolve(REPO_ROOT, 'examples/demo.jwks');
const TMP_DIR = resolve(REPO_ROOT, '.tamper-tmp');
const TAMPERED = resolve(TMP_DIR, 'tampered.receipt.json');

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

console.log('Tamper-demo: prove that signed receipts detect any modification.');
console.log('');

// 1. Verify the unmodified receipt first.
console.log('STEP 1  Verify the original receipt');
console.log('       $ npx @veritasacta/verify examples/x-feed-demo.receipt.json --jwks examples/demo.jwks');
console.log('');
const baseline = spawnSync('npx', ['-y', '@veritasacta/verify@0.6.1', SOURCE, '--jwks', JWKS], {
  encoding: 'utf8',
});
process.stdout.write(baseline.stdout);
if (baseline.status !== 0) {
  console.error('Original receipt failed to verify. Aborting tamper demo.');
  process.exit(1);
}

// 2. Load receipt, flip one character inside the payload.
const receipt = JSON.parse(readFileSync(SOURCE, 'utf8'));
const original = receipt.payload.algorithm_commit;
const tampered = original.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
receipt.payload.algorithm_commit = tampered;
writeFileSync(TAMPERED, JSON.stringify(receipt, null, 2));

console.log('');
console.log('STEP 2  Flip one character inside the payload');
console.log(`       payload.algorithm_commit was:  ${original}`);
console.log(`       payload.algorithm_commit  now:  ${tampered}`);
console.log('       (last character changed; signature was not regenerated)');
console.log('');

// 3. Verify the tampered receipt. Expect failure.
console.log('STEP 3  Re-run verification on the tampered receipt');
console.log('       $ npx @veritasacta/verify .tamper-tmp/tampered.receipt.json --jwks examples/demo.jwks');
console.log('');

const after = spawnSync('npx', ['-y', '@veritasacta/verify@0.6.1', TAMPERED, '--jwks', JWKS], {
  encoding: 'utf8',
});
process.stdout.write(after.stdout);
process.stderr.write(after.stderr);

if (after.status === 0) {
  console.error('');
  console.error('FAIL  Tampered receipt verified as valid. The verifier is broken.');
  process.exit(2);
}

console.log('');
console.log('Result: the verifier rejected the tampered receipt, as expected.');
console.log('');
console.log('This is the core security property of signed receipts: any change to');
console.log("any committed field (algorithm commit, model hashes, config, input,");
console.log("output, timestamps) invalidates the signature. There is no way to");
console.log('selectively edit the payload without re-signing it, and re-signing');
console.log('requires the private key held by the original issuer.');
process.exit(0);
