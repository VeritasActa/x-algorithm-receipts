#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const path = process.argv[2] || 'examples/x-feed-demo.receipt.json';
const receipt = JSON.parse(readFileSync(path, 'utf8'));
const payload = receipt.payload || {};
const ok = (label, value) => console.log(`✓ ${label.padEnd(22)} ${value}`);

if (receipt.type !== 'recommender_rank_receipt') {
  console.error(`unexpected receipt type: ${receipt.type}`);
  process.exit(1);
}

ok('receipt type', receipt.type);
ok('algorithm repo', payload.algorithm_repo || 'missing');
ok('algorithm commit', payload.algorithm_commit || 'missing');
ok('pipeline', payload.pipeline || 'missing');
ok('model artifacts', `${payload.model_artifacts?.length ?? 0} file commitment(s)`);
ok('model root', payload.model_artifacts_root || 'missing');
ok('config hash', payload.config_hash || 'missing');
ok('input commitment', payload.input_commitment || 'missing');
ok('output root', payload.output_root || 'missing');
ok('selected count', String(payload.selected_count ?? 'missing'));
ok('top-N disclosed', String(payload.output_top_n_optional?.top_n ?? 0));
ok('signature kid', receipt.kid || 'missing');
console.log('');
console.log(payload.caveat || 'Receipts bind execution evidence, not fairness or truth.');
