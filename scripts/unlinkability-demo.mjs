#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  createDemoIssuer,
  issueDemoToken,
  shortHash,
  verifyDemoVoprfToken,
} from './voprf-demo-crypto.mjs';

const DEFAULT_OUT = 'examples/voprf-gated-disclosure/unlinkability-demo.json';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const issuer = createDemoIssuer();
  const researcher = 'researcher-42';
  const origin = 'https://researcher.example';
  const receiptA = 'sha256:receipt-real-x-feed';
  const receiptB = 'sha256:receipt-second-sample';

  const issuedA = issueDemoToken({
    issuer,
    origin,
    policy: 'dsa-researcher:top-10',
    receiptId: receiptA,
  });
  const issuedB = issueDemoToken({
    issuer,
    origin,
    policy: 'dsa-researcher:top-5',
    receiptId: receiptB,
  });

  const verifiedA = await verifyDemoVoprfToken(issuedA.token, {
    expectedPolicy: 'dsa-researcher:top-10',
    expectedReceiptId: receiptA,
    requireClientProof: true,
  });
  const verifiedB = await verifyDemoVoprfToken(issuedB.token, {
    expectedPolicy: 'dsa-researcher:top-5',
    expectedReceiptId: receiptB,
    requireClientProof: true,
  });
  if (!verifiedA.valid || !verifiedB.valid) throw new Error('unexpected VOPRF verification failure');

  const report = {
    profile: 'scopeblind.recommender.unlinkability-demo.v1',
    demo_mode: true,
    same_approved_researcher: researcher,
    issuer_view: [
      { issuance: 'A', ...issuedA.issuerLog },
      { issuance: 'B', ...issuedB.issuerLog },
    ],
    verifier_view: [
      {
        redemption: 'A',
        receipt_id_hint: receiptA,
        policy: verifiedA.scope.policy,
        nullifier_hint: `${verifiedA.nullifier.slice(0, 18)}...`,
        dleq: verifiedA.dleq,
      },
      {
        redemption: 'B',
        receipt_id_hint: receiptB,
        policy: verifiedB.scope.policy,
        nullifier_hint: `${verifiedB.nullifier.slice(0, 18)}...`,
        dleq: verifiedB.dleq,
      },
    ],
    naive_signed_token_contrast: {
      subject: researcher,
      problem: 'A normal signed bearer token would carry a stable subject or account identifier, making redemptions linkable by default.',
    },
    conclusion: 'The issuer sees issuance events for an approved researcher, but the verifier-side nullifiers are scope-specific and do not reveal which blinded issuance created them. Linkability inside one verifier scope is still intentional for rate limiting.',
  };

  if (args['write-fixtures']) writeJson(resolve(process.cwd(), args.out || DEFAULT_OUT), report);
  printReport(report, verifiedA, verifiedB);
}

function printReport(report, verifiedA, verifiedB) {
  console.log('Issuer-blind unlinkability demo');
  console.log('--------------------------------');
  console.log(`Same approved researcher: ${report.same_approved_researcher}`);
  console.log('');
  console.log('Issuer view');
  for (const row of report.issuer_view) {
    console.log(`  issuance ${row.issuance}: blinded_request=${row.blinded_request}, issued_evaluation=${row.issued_evaluation}, sees_policy=${row.sees_policy}, sees_receipt_id=${row.sees_receipt_id}`);
  }
  console.log('');
  console.log('Verifier view');
  for (const row of report.verifier_view) {
    console.log(`  redemption ${row.redemption}: policy=${row.policy}, nullifier=${row.nullifier_hint}, receipt=${row.receipt_id_hint}`);
  }
  console.log('');
  console.log('Checks');
  console.log(`  token A valid: ${verifiedA.valid}, issuer proof: ${verifiedA.dleq.issuer}, client proof: ${verifiedA.dleq.client}`);
  console.log(`  token B valid: ${verifiedB.valid}, issuer proof: ${verifiedB.dleq.issuer}, client proof: ${verifiedB.dleq.client}`);
  console.log(`  nullifiers differ across scopes: ${verifiedA.nullifier !== verifiedB.nullifier}`);
  console.log(`  issuer-visible fingerprint A: ${shortHash(report.issuer_view[0].blinded_request)}`);
  console.log(`  issuer-visible fingerprint B: ${shortHash(report.issuer_view[1].blinded_request)}`);
  console.log('');
  console.log('Contrast');
  console.log(`  naive signed token subject: ${report.naive_signed_token_contrast.subject}`);
  console.log(`  problem: ${report.naive_signed_token_contrast.problem}`);
  console.log('');
  console.log('Result');
  console.log(`  ${report.conclusion}`);
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
