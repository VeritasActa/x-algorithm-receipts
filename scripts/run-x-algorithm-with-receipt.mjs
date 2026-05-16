#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  canonicalHash,
  fileSha256,
  merkleRoot,
  publicJwksFromPrivateJwk,
  relativePosix,
  sha256Prefixed,
  signReceipt,
  ensureDemoPrivateJwk,
  verifyReceiptLocally,
  listFilesRecursive,
} from './lib.mjs';

const DEFAULT_PRIVATE_KEY = '.tmp/demo.private.jwk';

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(process.cwd());
  const receiptOut = resolve(root, args['receipt-out'] || 'examples/x-feed-demo.receipt.json');
  const jwksOut = resolve(root, args['jwks-out'] || 'examples/demo.jwks');
  const keyFile = resolve(root, args['key-file'] || DEFAULT_PRIVATE_KEY);
  const privateJwk = ensureDemoPrivateJwk(keyFile);

  const event = args.mock ? buildMockAuditEvent(args) : buildRealAuditEvent(args);
  const { artifact, signed_hash } = signReceipt('recommender_rank_receipt', event, privateJwk, {
    issuer: args.issuer || 'did:web:scopeblind.com:examples:x-algorithm-receipts',
  });
  const publicJwks = publicJwksFromPrivateJwk(privateJwk);
  const ok = verifyReceiptLocally(artifact, publicJwks.keys[0]);
  if (!ok) throw new Error('local signature self-check failed');

  mkdirSync(dirname(receiptOut), { recursive: true });
  mkdirSync(dirname(jwksOut), { recursive: true });
  writeFileSync(receiptOut, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(jwksOut, `${JSON.stringify(publicJwks, null, 2)}\n`);

  if (args['opening-out']) {
    const openingOut = resolve(root, args['opening-out']);
    mkdirSync(dirname(openingOut), { recursive: true });
    writeFileSync(openingOut, `${JSON.stringify(buildOpening(event), null, 2)}\n`);
  }

  console.log(`wrote receipt: ${receiptOut}`);
  console.log(`wrote jwks:    ${jwksOut}`);
  console.log(`signed hash:   ${signed_hash}`);
  console.log(`verify:        npx @veritasacta/verify ${relativePosix(root, receiptOut)} --jwks ${relativePosix(root, jwksOut)}`);
}

function buildMockAuditEvent(args) {
  const fullRanked = Array.from({ length: 50 }, (_, i) => {
    const rank = i + 1;
    const favorite = Number((0.87 * Math.exp(-i / 18) + 0.02).toFixed(6));
    const reply = Number((0.19 * Math.exp(-i / 20) + 0.006).toFixed(6));
    const repost = Number((0.31 * Math.exp(-i / 22) + 0.01).toFixed(6));
    const dwell = Number((0.71 * Math.exp(-i / 30) + 0.04).toFixed(6));
    return {
      rank,
      post_id: `demo_post_${String(900000 + i)}`,
      score: Number((favorite * 1.0 + reply * 0.7 + repost * 0.85 + dwell * 0.2).toFixed(6)),
      probabilities: { favorite, reply, repost, dwell },
    };
  });

  const privateInputFields = [
    { name: 'user_history', value: '3 liked sports posts: NFL, NBA, NHL' },
    { name: 'viewer_id', value: 'demo_user_private_7421' },
    { name: 'served_history', value: ['demo_seen_1', 'demo_seen_2', 'demo_seen_3'] },
  ];

  const modelArtifacts = [
    mockArtifact('phoenix/artifacts/oss-phoenix-artifacts/retrieval/model_params.npz'),
    mockArtifact('phoenix/artifacts/oss-phoenix-artifacts/retrieval/config.json'),
    mockArtifact('phoenix/artifacts/oss-phoenix-artifacts/ranker/model_params.npz'),
    mockArtifact('phoenix/artifacts/oss-phoenix-artifacts/ranker/config.json'),
    mockArtifact('phoenix/artifacts/oss-phoenix-artifacts/sports_corpus.npz'),
  ];

  return {
    receipt_profile: 'recommender.post_ranking.v1',
    event_kind: 'post_ranking_audit_event',
    algorithm_repo: 'https://github.com/xai-org/x-algorithm',
    algorithm_commit: args['algorithm-commit'] || 'git:published-demo-mock-2026-05-15',
    pipeline: 'phoenix/run_pipeline.py',
    execution_mode: 'mock',
    model_artifacts: modelArtifacts,
    model_artifacts_root: merkleRoot(modelArtifacts),
    config_hash: canonicalHash({ mini_phoenix: true, emb_size: 128, num_layers: 4, num_heads: 4 }),
    input_commitment: merkleRoot(privateInputFields),
    input_commitment_note: 'Merkle root over private user features. The sample opening discloses field names but not production user data.',
    output_root: merkleRoot(fullRanked),
    output_top_n_optional: {
      top_n: Number(args['top-n'] || 10),
      items: fullRanked.slice(0, Number(args['top-n'] || 10)),
    },
    selected_count: fullRanked.length,
    top_k_retrieval: Number(args['top-k-retrieval'] || 200),
    top_k_display: Number(args['top-k-display'] || 50),
    runtime_environment: {
      wrapper: 'ScopeBlind/x-algorithm-receipts@0.1.0',
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    caveat: 'Receipts prove that a specific output was bound to specific code, model artifacts, config, and input commitments. They do not prove the output is fair, truthful, or beneficial.',
  };
}

function mockArtifact(path) {
  return { path, sha256: sha256Prefixed(Buffer.from(`mock:${path}`, 'utf8')) };
}

function buildRealAuditEvent(args) {
  const xDir = resolve(args['x-algorithm-dir'] || 'x-algorithm');
  const phoenixDir = join(xDir, 'phoenix');
  if (!existsSync(join(phoenixDir, 'run_pipeline.py'))) {
    throw new Error(`missing ${join(phoenixDir, 'run_pipeline.py')}. Pass --x-algorithm-dir /path/to/x-algorithm or use --mock.`);
  }

  const commit = git(xDir, ['rev-parse', 'HEAD']);
  const status = git(xDir, ['status', '--porcelain']);
  const artifactsDir = resolve(args['artifacts-dir'] || join(phoenixDir, 'artifacts', 'oss-phoenix-artifacts'));
  const sequenceFile = resolve(args['sequence-file'] || join(artifactsDir, 'example_sequence.json'));
  const corpusFile = resolve(args['corpus-file'] || join(artifactsDir, 'sports_corpus.npz'));
  const topKRetrieval = Number(args['top-k-retrieval'] || 200);
  const topKDisplay = Number(args['top-k-display'] || 30);

  const command = buildPipelineCommand({ artifactsDir, sequenceFile, corpusFile, topKRetrieval, topKDisplay, args });
  const run = spawnSync(command.cmd, command.argv, { cwd: phoenixDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.error) throw run.error;
  if (run.status !== 0) {
    throw new Error(`pipeline exited ${run.status}\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`);
  }

  const modelArtifacts = collectArtifactHashes(artifactsDir, xDir);
  if (existsSync(corpusFile) && !modelArtifacts.some((f) => resolve(xDir, f.path) === corpusFile)) {
    modelArtifacts.push({ path: relativePosix(xDir, corpusFile), sha256: fileSha256(corpusFile) });
  }

  const outputLines = run.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const openedOutputs = outputLines.slice(0, Math.min(outputLines.length, topKDisplay));
  const inputCommitments = [];
  if (existsSync(sequenceFile)) inputCommitments.push({ path: relativePosix(xDir, sequenceFile), sha256: fileSha256(sequenceFile) });
  if (existsSync(corpusFile)) inputCommitments.push({ path: relativePosix(xDir, corpusFile), sha256: fileSha256(corpusFile) });

  return {
    receipt_profile: 'recommender.post_ranking.v1',
    event_kind: 'post_ranking_audit_event',
    algorithm_repo: 'https://github.com/xai-org/x-algorithm',
    algorithm_commit: `git:${commit}`,
    algorithm_worktree_dirty: status.length > 0,
    pipeline: 'phoenix/run_pipeline.py',
    execution_mode: 'real',
    run_command: [command.cmd, ...command.argv],
    model_artifacts: modelArtifacts,
    model_artifacts_root: merkleRoot(modelArtifacts),
    config_hash: canonicalHash(modelArtifacts.filter((a) => a.path.endsWith('config.json'))),
    input_commitment: merkleRoot(inputCommitments),
    input_commitment_note: 'Merkle root over sequence/corpus references. Production deployments should commit to feature vectors before ranking.',
    output_root: merkleRoot(outputLines.map((line, index) => ({ index, line }))),
    output_top_n_optional: {
      top_n: openedOutputs.length,
      items: openedOutputs.map((line, index) => ({ rank: index + 1, line })),
    },
    selected_count: outputLines.length,
    stdout_hash: sha256Prefixed(Buffer.from(run.stdout, 'utf8')),
    stderr_hash: sha256Prefixed(Buffer.from(run.stderr || '', 'utf8')),
    top_k_retrieval: topKRetrieval,
    top_k_display: topKDisplay,
    runtime_environment: {
      wrapper: 'ScopeBlind/x-algorithm-receipts@0.1.0',
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    caveat: 'Receipts prove that a specific output was bound to specific code, model artifacts, config, and input commitments. They do not prove the output is fair, truthful, or beneficial.',
  };
}

function buildPipelineCommand({ artifactsDir, sequenceFile, corpusFile, topKRetrieval, topKDisplay, args }) {
  if (args.command) {
    const parts = String(args.command).split(' ').filter(Boolean);
    return { cmd: parts[0], argv: parts.slice(1) };
  }
  const argv = [
    'run', 'run_pipeline.py',
    '--artifacts_dir', artifactsDir,
    '--sequence_file', sequenceFile,
    '--corpus_file', corpusFile,
    '--top_k_retrieval', String(topKRetrieval),
    '--top_k_display', String(topKDisplay),
  ];
  return { cmd: 'uv', argv };
}

function collectArtifactHashes(artifactsDir, xDir) {
  if (!existsSync(artifactsDir)) return [];
  return listFilesRecursive(artifactsDir, { maxFiles: 5000, skipLargeBytes: 3 * 1024 * 1024 * 1024 })
    .filter((path) => /\.(json|npz|txt|yaml|yml|ckpt|bin)$/i.test(path) || basename(path).includes('model'))
    .map((path) => ({ path: relativePosix(xDir, path), sha256: fileSha256(path) }));
}

function buildOpening(event) {
  return {
    receipt_profile: event.receipt_profile,
    algorithm_commit: event.algorithm_commit,
    output_root: event.output_root,
    output_top_n_optional: event.output_top_n_optional,
    caveat: event.caveat,
  };
}

function git(cwd, argv) {
  return execFileSync('git', ['-C', cwd, ...argv], { encoding: 'utf8' }).trim();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith('--')) throw new Error(`unexpected argument ${item}`);
    const key = item.slice(2);
    if (key === 'mock') {
      out.mock = true;
    } else {
      const value = argv[++i];
      if (value === undefined) throw new Error(`missing value for --${key}`);
      out[key] = value;
    }
  }
  return out;
}

main();
