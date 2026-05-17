#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  canonicalHash,
  ensureDemoPrivateJwk,
  merkleRoot,
  publicJwksFromPrivateJwk,
  sha256Prefixed,
  signReceipt,
  verifyReceiptLocally,
} from './lib.mjs';

const DEFAULT_RANK_RECEIPT = 'examples/x-feed-real.receipt.json';
const DEFAULT_RANK_JWKS = 'examples/real.jwks';
const DEFAULT_OUT_DIR = 'examples/deployment-version';
const PRIVATE_KEY = '.tmp/demo.private.jwk';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const rankReceiptPath = resolve(root, args.receipt || DEFAULT_RANK_RECEIPT);
  const rankJwksPath = resolve(root, args.jwks || DEFAULT_RANK_JWKS);
  const outDir = resolve(root, args.out || DEFAULT_OUT_DIR);
  const issuedAt = args['issued-at'] || '2026-05-17T12:00:00.000Z';

  const rankReceipt = JSON.parse(readFileSync(rankReceiptPath, 'utf8'));
  const rankJwks = JSON.parse(readFileSync(rankJwksPath, 'utf8'));
  const rankKey = rankJwks.keys.find((candidate) => candidate.kid === rankReceipt.kid) || rankJwks.keys[0];
  if (!verifyReceiptLocally(rankReceipt, rankKey)) throw new Error(`source ranking receipt failed verification: ${rankReceiptPath}`);

  const privateJwk = ensureDemoPrivateJwk(PRIVATE_KEY);
  const deployment = buildDeploymentPayload({ rankReceipt, issuedAt });
  const deploymentReceipt = signReceipt('recommender_deployment_receipt', deployment, privateJwk, { issued_at: issuedAt }).artifact;
  const certificate = buildFeedCertificatePayload({ deployment, deploymentReceipt, rankReceipt, issuedAt });
  const feedCertificate = signReceipt('for_you_feed_version_certificate', certificate, privateJwk, { issued_at: issuedAt }).artifact;
  const jwks = publicJwksFromPrivateJwk(privateJwk);

  if (args['write-fixtures']) {
    writeJson(resolve(outDir, 'deployment.receipt.json'), deploymentReceipt);
    writeJson(resolve(outDir, 'feed-session-certificate.receipt.json'), feedCertificate);
    writeJson(resolve(outDir, 'deployment.jwks'), jwks);
  }

  printSummary({ deploymentReceipt, feedCertificate, deployment, certificate, outDir, wrote: Boolean(args['write-fixtures']) });
}

export function buildDeploymentPayload({ rankReceipt, issuedAt }) {
  const source = rankReceipt.payload;
  const policyComponents = [
    {
      name: 'visibility-filtering',
      version: 'demo-2026-05-15',
      commitment: sha256Prefixed('x-algorithm-demo:visibility-filtering:v2026-05-15'),
      disclosed: false,
      purpose: 'Commitment to post-selection visibility policy bundle without publishing private enforcement rules.',
    },
    {
      name: 'brand-safety-and-ads-blending',
      version: 'demo-2026-05-15',
      commitment: sha256Prefixed('x-algorithm-demo:brand-safety-ads-blending:v2026-05-15'),
      disclosed: false,
      purpose: 'Commitment to ad-placement and brand-safety configuration active for this rollout.',
    },
    {
      name: 'grox-content-understanding',
      version: 'demo-2026-05-15',
      commitment: sha256Prefixed('x-algorithm-demo:grox-content-understanding:v2026-05-15'),
      disclosed: false,
      purpose: 'Commitment to classifier/embedder configuration used for content-understanding stages.',
    },
  ];
  const publicMetadata = {
    service: 'x-for-you-feed',
    environment: 'production-version-demo',
    deployment_id: 'x-for-you-phoenix-demo-2026-05-15',
    valid_from: issuedAt,
    valid_until: '2026-05-24T12:00:00.000Z',
    rollout: 'example: canary-or-public-production-window',
  };

  return {
    receipt_profile: 'recommender.deployment_version.v1',
    event_kind: 'algorithm_deployment_receipt',
    public_metadata: publicMetadata,
    algorithm: {
      repo: source.algorithm_repo,
      commit: source.algorithm_commit,
      source_root: source.algorithm_source_root,
      worktree_dirty: source.algorithm_worktree_dirty,
    },
    runtime: {
      pipeline: source.pipeline,
      structured_output_version: source.structured_output_version,
      source_receipt: canonicalHash(rankReceipt),
    },
    model_bundle: {
      artifacts_root: source.model_artifacts_root,
      artifact_count: source.model_artifacts?.length || 0,
      sample_artifacts: (source.model_artifacts || []).slice(0, 5),
    },
    config: {
      config_hash: source.config_hash,
      algorithm_source_note: source.algorithm_source_note,
    },
    policy_bundle: {
      root: merkleRoot(policyComponents),
      components: policyComponents,
    },
    public_user_facing_fields: [
      'deployment_id',
      'valid_from',
      'algorithm.commit',
      'model_bundle.artifacts_root',
      'config.config_hash',
      'policy_bundle.root',
    ],
    private_fields_committed_not_disclosed: [
      'viewer identity',
      'viewer feature vector',
      'candidate set',
      'raw policy internals',
      'ranking output for a specific user',
    ],
    caveat: 'Demo deployment receipt only. It shows how X could prove which algorithm/model/config/policy bundle was active during a production window without disclosing user data. It is not a claim about production X.',
  };
}

export function buildFeedCertificatePayload({ deployment, deploymentReceipt, rankReceipt, issuedAt }) {
  const privateSessionInputs = [
    { name: 'viewer_id', commitment: sha256Prefixed('demo-viewer-12345') },
    { name: 'request_id', commitment: sha256Prefixed('demo-request-2026-05-17T12:00:00Z') },
    { name: 'candidate_set', commitment: rankReceipt.payload.input_commitment },
  ];
  return {
    receipt_profile: 'recommender.feed_version_certificate.v1',
    event_kind: 'for_you_feed_version_certificate',
    certificate_id: 'demo-feed-certificate-2026-05-17-001',
    issued_at: issuedAt,
    deployment_receipt_hash: canonicalHash(deploymentReceipt),
    disclosed_to_user: {
      service: deployment.public_metadata.service,
      deployment_id: deployment.public_metadata.deployment_id,
      valid_from: deployment.public_metadata.valid_from,
      algorithm_commit: deployment.algorithm.commit,
      model_artifacts_root: deployment.model_bundle.artifacts_root,
      config_hash: deployment.config.config_hash,
      policy_bundle_root: deployment.policy_bundle.root,
    },
    private_session_commitment: merkleRoot(privateSessionInputs),
    private_session_inputs: privateSessionInputs,
    caveat: 'User-facing version certificate demo. It proves version metadata was signed and committed, not that this was displayed to any real X user or used in production.',
  };
}

function printSummary({ deploymentReceipt, feedCertificate, deployment, certificate, outDir, wrote }) {
  console.log('X algorithm deployment/version receipt demo');
  console.log('-------------------------------------------');
  console.log(`[ok] deployment receipt type: ${deploymentReceipt.type}`);
  console.log(`[ok] deployment id: ${deployment.public_metadata.deployment_id}`);
  console.log(`[ok] algorithm commit: ${deployment.algorithm.commit}`);
  console.log(`[ok] model artifacts root: ${deployment.model_bundle.artifacts_root}`);
  console.log(`[ok] config hash: ${deployment.config.config_hash}`);
  console.log(`[ok] policy bundle root: ${deployment.policy_bundle.root}`);
  console.log('');
  console.log('User-facing certificate');
  console.log(`[ok] certificate type: ${feedCertificate.type}`);
  console.log(`[ok] deployment receipt hash: ${certificate.deployment_receipt_hash}`);
  console.log(`[ok] private session commitment: ${certificate.private_session_commitment}`);
  console.log('');
  console.log('Result');
  console.log('  This is the lowest-friction X-facing feature: publish signed deployment');
  console.log('  receipts proving which algorithm commit, model bundle, config hash, and');
  console.log('  policy bundle were active for a rollout window. User-facing certificates');
  console.log('  can disclose that metadata without exposing user features or ranked output.');
  if (wrote) console.log(`\nWrote fixtures under ${relativeOut(outDir)}/`);
}

function relativeOut(path) {
  return path.replace(`${process.cwd()}/`, '');
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exit(1);
  });
}
