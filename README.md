# x-algorithm-receipts

Open source shows what could run. Receipts prove what did run.

This repo is a small receipt wrapper for the published [`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm) demo pipeline. It does not modify X's repo and it does not claim to audit production X. It shows the missing verifiability layer: a specific ranking run can be bound to a code commit, model artifact hashes, config hash, input commitment, output Merkle root, and Ed25519 signature.

## What this proves

A valid receipt proves that a specific output was bound to specific code, model artifacts, config, and input commitments at signing time.

It does not prove that the ranking was fair, truthful, beneficial, unbiased, legally sufficient, or actually used in production. Those are different audit problems.

## Quick demo, no X artifacts required

The mock demo creates a synthetic Phoenix-style ranking event, signs it, and verifies the receipt offline.

```sh
npm run demo
npm run verify
node scripts/inspect-receipt.mjs examples/x-feed-demo.receipt.json
```

Expected verifier shape:

```text
✓ Signature: VALID
  Format:     v2 (draft-farley-acta-signed-receipts-03)
  Type:       recommender_rank_receipt
  Algorithm:  ed25519
  Tier:       T1 basic (ed25519-signature, jcs-canonicalization)
  No servers were contacted.
```

Expected receipt inspection shape:

```text
✓ algorithm repo         https://github.com/xai-org/x-algorithm
✓ algorithm commit       git:published-demo-mock-2026-05-15
✓ pipeline               phoenix/run_pipeline.py
✓ model artifacts        5 file commitment(s)
✓ input commitment       merkle-rfc6962-sha256:...
✓ output root            merkle-rfc6962-sha256:...
✓ selected count         50
✓ top-N disclosed        10
```

## Real mode against a local x-algorithm checkout

Clone the X algorithm repo and download/extract its Phoenix artifacts as described upstream. Then run:

```sh
git clone https://github.com/xai-org/x-algorithm.git ./x-algorithm
# Follow upstream instructions to place Phoenix artifacts under:
# ./x-algorithm/phoenix/artifacts/oss-phoenix-artifacts

node scripts/run-x-algorithm-with-receipt.mjs \
  --x-algorithm-dir ./x-algorithm \
  --artifacts-dir ./x-algorithm/phoenix/artifacts/oss-phoenix-artifacts \
  --receipt-out receipts/x-feed-real.receipt.json \
  --jwks-out receipts/x-feed-real.jwks

npx @veritasacta/verify receipts/x-feed-real.receipt.json --jwks receipts/x-feed-real.jwks
node scripts/inspect-receipt.mjs receipts/x-feed-real.receipt.json
```

The real wrapper executes `uv run run_pipeline.py` inside `x-algorithm/phoenix`, captures stdout/stderr digests, hashes model/config/corpus files, commits to the input files, commits to the ranked output lines, signs the event, and writes a local JWKS for offline verification.

## Receipt profile

The receipt type is `recommender_rank_receipt` with profile `recommender.post_ranking.v1`.

Core payload fields:

| Field | Meaning |
|---|---|
| `algorithm_repo` | Source repository for the algorithm implementation. |
| `algorithm_commit` | Git commit hash for the checked-out algorithm source. |
| `pipeline` | Pipeline entry point, currently `phoenix/run_pipeline.py`. |
| `model_artifacts` | Per-file SHA-256 commitments for model/config/corpus artifacts. |
| `model_artifacts_root` | Merkle root over `model_artifacts`. |
| `config_hash` | Hash over config artifact commitments. |
| `input_commitment` | Merkle root over private or selectively disclosable input references. |
| `output_root` | Merkle root over the complete ranked output commitment. |
| `output_top_n_optional` | Optional selectively disclosed top-N output sample. |
| `selected_count` | Count of committed ranked outputs. |
| `caveat` | Explicit limitation of the proof claim. |

See [`docs/audit-event-schema.md`](docs/audit-event-schema.md) and [`schemas/recommender-post-ranking-v1.schema.json`](schemas/recommender-post-ranking-v1.schema.json).

## Why a wrapper, not a PR?

At the time this was built, the upstream repository had no open issues, no open PRs, and pull request creation was restricted. A wrapper keeps the contribution vendor-neutral and avoids asking xAI to adopt any receipt format. If upstream wants a hook later, the minimal shape is an optional post-ranking audit event that external systems can sign however they choose.

## Proposed upstream hook

```rust
on_rank_complete(RankAuditEvent {
    algorithm_commit,
    model_artifact_hashes,
    config_hash,
    input_commitment,
    output_root,
    output_top_n_optional,
    timestamp,
})
```

No signing requirement. No policy engine. No external service dependency. The hook only emits structured evidence; signing and anchoring stay outside the core ranking pipeline.

## License

Apache-2.0. This repo is independent of `xai-org/x-algorithm`; use that repository under its own license and terms.
