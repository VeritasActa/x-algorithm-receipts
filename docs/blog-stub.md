# Open source shows what could run. Receipts prove what did run.

X publishing its For You algorithm code is a meaningful transparency step. But code publication and execution verifiability are different guarantees.

Open code lets researchers inspect what an algorithm could do. A signed receipt lets a verifier check what a specific run actually committed to: the source commit, model artifacts, config, private input commitments, and output root.

This repo demonstrates that second layer against the published X algorithm demo shape.

## The gap

Nobody outside the operator can prove that a specific feed ranking at a specific moment was produced by a specific source revision, model checkpoint, config, and input set. Logs help, but logs usually live inside the same trust domain as the system being audited.

A signed receipt moves the evidence into an offline-verifiable artifact.

## The demo

```sh
npm run demo
npm run verify
node scripts/inspect-receipt.mjs examples/x-feed-demo.receipt.json
```

The receipt commits to:

- algorithm repository and commit
- Phoenix pipeline entry point
- model/config/corpus hashes
- private input Merkle root
- exact stdout-line Merkle root
- structured ranked-item Merkle root
- selectively disclosed top-N output, either as raw lines or parsed records
- Ed25519 signature

## The boundary

Receipts prove that a specific output was bound to specific code, model artifacts, config, and input commitments. They do not prove the output is fair, truthful, or beneficial. Those are different audit problems.
