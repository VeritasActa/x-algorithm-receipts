# x-algorithm-receipts

Open source shows what could run. Receipts prove what did run.

This repo is a small receipt wrapper for the published [`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm) demo pipeline. It does not modify X's repo and it does not claim to audit production X. It shows the missing verifiability layer: a specific ranking run can be bound to a code commit, model artifact hashes, config hash, input commitment, output Merkle root, and Ed25519 signature.

![Verifier output showing a valid signature for the mock-mode demo receipt, with the Sigil visual fingerprint and full payload details.](screenshots/01-verifier-valid.png)

Three commands to install, verify, inspect:

```sh
npm install
npm run demo                                                        # generate mock receipt
npx @veritasacta/verify examples/x-feed-demo.receipt.json \
  --jwks examples/demo.jwks                                         # verify offline
node scripts/inspect-receipt.mjs examples/x-feed-demo.receipt.json  # inspect semantic fields
```

No accounts, no API keys, no cloud calls. The verifier is open-source Apache-2.0 on npm (`@veritasacta/verify`). The receipt format is documented as an active IETF Internet-Draft, `draft-farley-acta-signed-receipts`.

## What this proves

A valid receipt proves that a specific output was bound to specific code, model artifacts, config, and input commitments at signing time.

It does not prove that the ranking was fair, truthful, beneficial, unbiased, legally sufficient, or actually used in production. Those are different audit problems.

## Receipt inspection (semantic fields)

![Inspector output listing the bound algorithm repo, commit, pipeline, model artifacts, hashes, and disclosure counts.](screenshots/02-inspector.png)

## Tamper detection

Flip one character anywhere in the signed payload and the verifier rejects the receipt with a spec-cited error.

![Tamper demo: a valid receipt becomes invalid after one character of the payload is modified; the verifier returns INVALID with the `invalid_signature` error code.](screenshots/03-tamper-rejected.png)

```sh
npm run tamper-demo
```

This is the core security property of signed receipts: any change to any committed field (algorithm commit, model hashes, config, input, output) invalidates the signature. There is no way to selectively edit the payload without re-signing it.

## Reproducibility

Run the wrapper twice with the same input. The two receipts have different `issued_at` timestamps and signatures, but the cryptographic commitments to the input and the ranked output match exactly.

![Reproducibility demo: two independent runs produce identical input_commitment and output_root, but different timestamps and signatures.](screenshots/04-reproducibility.png)

```sh
npm run repro-demo
```

This is the property no production recommender system currently exposes externally: "anyone with the same code, model artifacts, config, and input can re-run and verify the same output, cryptographically." Committed pair lives in [`examples/reproducibility-pair/`](examples/reproducibility-pair/).

## Real mode against an actual Phoenix pipeline (v0.2.0)

The repo ships a real-mode receipt at [`examples/x-feed-real.receipt.json`](examples/x-feed-real.receipt.json) bound to a real ranking pass against `xai-org/x-algorithm@c3ef3307baea78655d0db2672cf2aa51a0381454`. Verify it the same way as the mock receipt:

```sh
npx @veritasacta/verify examples/x-feed-real.receipt.json --jwks examples/real.jwks
node scripts/inspect-receipt.mjs examples/x-feed-real.receipt.json
```

To reproduce yourself, clone X's repo, download the Phoenix artifacts (2.9 GB via Git LFS), and run the wrapper:

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

The real wrapper executes `uv run run_pipeline.py` inside `x-algorithm/phoenix`, captures stdout/stderr digests, hashes all model and config and corpus files, commits to the input files, commits to the ranked output lines, signs the event, and writes a local JWKS for offline verification.

In real mode, `output_top_n_optional.items` contains the literal pipeline output lines (which include the ranked-results table). The signed commitment is over the exact bytes the pipeline printed, so a re-runner who gets a different output will produce a different `output_root` and the receipts will not match. Structured parsing of the ranking items (rank/post_id/score per line) is a planned v0.3.0 feature.

## Browser verifier (no CLI required)

Drop a receipt and JWKS at https://www.scopeblind.com/verify-receipt. Pure client-side verification using `@noble/curves` from a CDN, no servers contacted.

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

At the time this was built, the upstream repository had Issues, Discussions, Wiki, and external PR creation all disabled. A wrapper keeps the contribution vendor-neutral and avoids asking xAI to adopt any receipt format. If a channel ever opens upstream, the minimal shape is an optional post-ranking audit event that external systems can sign however they choose.

## Proposed upstream hook (RFC)

Full RFC: [#1 RFC: Add optional post-ranking audit event hook](https://github.com/VeritasActa/x-algorithm-receipts/issues/1).

```rust
pub struct RankAuditEvent {
    pub algorithm_commit: String,
    pub model_artifacts: Vec<ArtifactRef>,
    pub config_hash: String,
    pub input_commitment: String,
    pub output_root: String,
    pub output_top_n_optional: Option<TopNOpening>,
    pub timestamp: i64,
}
```

No signing requirement. No policy engine. No external service dependency. The hook only emits structured evidence; signing and anchoring stay outside the core ranking pipeline. The RFC is filed here on the companion repo because upstream Issues are disabled; if xAI opens a channel, the proposal copies over verbatim.

## License

Apache-2.0. This repo is independent of `xai-org/x-algorithm`; use that repository under its own license and terms.
