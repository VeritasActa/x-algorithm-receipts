#!/usr/bin/env node
/**
 * Reproducibility demo.
 *
 * Runs the wrapper twice with the same input. The two receipts have different
 * issued_at timestamps and therefore different signatures, but the
 * cryptographic commitments to the input and the ranked output match exactly.
 *
 * This is the property no recommender system currently exposes externally:
 *   "anyone with the same code, model artifacts, config, and input can re-run
 *    and verify the same output, cryptographically."
 *
 * Run: npm run repro-demo
 */

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Default to a gitignored temp folder so re-running the demo does not dirty
// the committed example pair. To intentionally regenerate the committed
// examples (e.g. after changing the wrapper), pass `--update-committed`.
const UPDATE_COMMITTED = process.argv.includes('--update-committed');
const PAIR_DIR = resolve(
  REPO_ROOT,
  UPDATE_COMMITTED ? 'examples/reproducibility-pair' : '.repro-tmp',
);

if (!existsSync(PAIR_DIR)) mkdirSync(PAIR_DIR, { recursive: true });

function runPass(label, outReceipt, outJwks) {
  const result = spawnSync(
    'node',
    [
      'scripts/run-x-algorithm-with-receipt.mjs',
      '--mock',
      '--receipt-out',
      outReceipt,
      '--jwks-out',
      outJwks,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    throw new Error(`run ${label} failed`);
  }
}

function field(receipt, key) {
  return receipt.payload[key];
}

function shorten(value) {
  if (typeof value !== 'string') return String(value);
  if (value.length <= 60) return value;
  return value.slice(0, 56) + '...';
}

console.log('Reproducibility demo: prove that the same input produces the same');
console.log('cryptographic commitments to the ranked output, across independent runs.');
console.log('');

// Run twice. Same wrapper, same inputs, no shared state.
const aReceiptPath = resolve(PAIR_DIR, 'run-a.receipt.json');
const aJwksPath = resolve(PAIR_DIR, 'run-a.jwks');
const bReceiptPath = resolve(PAIR_DIR, 'run-b.receipt.json');
const bJwksPath = resolve(PAIR_DIR, 'run-b.jwks');

console.log('PASS A  $ npm run demo (writes examples/reproducibility-pair/run-a.receipt.json)');
runPass('A', aReceiptPath, aJwksPath);
console.log('PASS B  $ npm run demo (writes examples/reproducibility-pair/run-b.receipt.json)');
runPass('B', bReceiptPath, bJwksPath);
console.log('');

const a = JSON.parse(readFileSync(aReceiptPath, 'utf8'));
const b = JSON.parse(readFileSync(bReceiptPath, 'utf8'));

// Compare the commitments. These MUST match if the algorithm is deterministic
// and the input is identical.
const checks = [
  ['algorithm_repo', a, b],
  ['algorithm_commit', a, b],
  ['config_hash', a, b],
  ['input_commitment', a, b],
  ['output_root', a, b],
  ['ranked_items_root', a, b],
  ['model_artifacts_root', a, b],
];

let allMatch = true;
const reportLines = [];

console.log('COMMITMENT COMPARISON (these MUST match for reproducibility)');
console.log('----------------------------------------------------------------');
for (const [key, x, y] of checks) {
  const vA = field(x, key);
  const vB = field(y, key);
  const ok = vA === vB;
  if (!ok) allMatch = false;
  const status = ok ? '✓' : '✗';
  const label = key.padEnd(24);
  console.log(`  ${status} ${label} ${shorten(vA)}`);
  reportLines.push(`${ok ? 'MATCH ' : 'DIFFER'}: ${key}`);
}
console.log('');

// Confirm that timestamps and signatures differ (they should, the runs are independent).
const issuedA = a.issued_at;
const issuedB = b.issued_at;
const sigA = a.signature || a.payload?.signature;
const sigB = b.signature || b.payload?.signature;
const tsDiffer = issuedA !== issuedB;
const sigDiffer = sigA !== sigB;

console.log('RUN-LEVEL FIELDS (these SHOULD differ across independent runs)');
console.log('----------------------------------------------------------------');
console.log(`  ${tsDiffer ? '✓' : '✗'} issued_at  pass A: ${issuedA}`);
console.log(`                       pass B: ${issuedB}`);
console.log(`  ${sigDiffer ? '✓' : '✗'} signature  pass A: ${shorten(sigA)}`);
console.log(`                       pass B: ${shorten(sigB)}`);
console.log('');

if (!allMatch) {
  console.error('FAIL  Commitments differ across independent runs. The wrapper is not deterministic.');
  process.exit(2);
}

console.log('Result: every cryptographic commitment to the input and output is identical');
console.log('across the two runs, while the run-level metadata (timestamp, signature) differs');
console.log('as expected.');
console.log('');
console.log('This is the reproducibility property. Anyone with the same code, model');
console.log('artifacts, config, and input can re-run the ranker and verify that the');
console.log('committed output matches. The receipt format makes the property cryptographically');
console.log('checkable, instead of leaving it as a verbal claim.');
console.log('');
console.log('Limitations:');
console.log('  - Mock mode uses deterministic synthetic data. Real-mode reproducibility');
console.log('    depends on the underlying model and pipeline being deterministic, which is');
console.log('    a property of the upstream system, not the receipt.');
console.log('  - Hardware-level non-determinism (e.g. fused multiply-add ordering on GPUs)');
console.log('    can introduce small numerical drift that changes the output commitments.');
console.log('    A real deployment should pin its execution environment.');
process.exit(0);
