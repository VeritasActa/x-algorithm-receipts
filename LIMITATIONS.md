# Limitations

This document is the canonical list of what this wrapper does and does not prove. It exists so claims can be precise.

## What a receipt proves

A valid receipt proves that, at signing time, a specific output was bound to:

- a specific code commit (`algorithm_commit`)
- specific model artifacts (`model_artifacts`)
- a specific runtime config (`config_hash`)
- a specific input commitment (`input_commitment`)
- a specific output commitment (`output_root`)

That binding is called **execution binding**. The receipt proves the binding, no more.

## What a receipt does NOT prove

Receipts do **not** prove any of the following. These are different audit problems requiring different methods:

- The ranking is fair.
- The ranking is truthful.
- The ranking is socially beneficial.
- The model was trained on legally sourced data.
- The algorithm is good for users.
- The system in production uses the same code, models, or config.
- The signer was honest about what they hashed (see "Observer trust" below).
- The output is the one a user actually saw.

## Mock mode vs real mode

- **Mock mode** (default for the shipped example) generates a synthetic Phoenix-style ranking event with deterministic, hand-shaped data. It exists so the demo verifies in seconds without downloading 2.9 GB of artifacts. The receipt's `execution_mode` field is set to `"mock"` to make this explicit on inspection.
- **Real mode** executes `phoenix/run_pipeline.py` against a local clone of `xai-org/x-algorithm` with the upstream Phoenix artifacts in place. The receipt's `execution_mode` is `"real"`.

The cryptographic guarantee is identical in both modes. The semantic content differs: real mode binds to actual model artifact bytes; mock mode binds to synthetic placeholders.

## Real mode commits to pipeline output bytes, not parsed records

The v0.2.0 real-mode wrapper executes the Phoenix pipeline as a subprocess and hashes the exact bytes of stdout (plus stderr) the pipeline emitted. The included `output_top_n_optional.items` array contains literal output lines as printed by the pipeline (including header rows like `"PIPELINE RESULTS - User 12345"`), not parsed `{rank, post_id, score}` records.

This means:

- A re-runner who produces identical pipeline output will produce a matching `output_root`. **This is the property the receipt actually proves.**
- A re-runner who produces different output (even minor formatting drift) will produce a different `output_root`, and the receipts will not match.
- The receipt does **not** internally validate the structure of the output. If the pipeline crashed and printed an error message, the receipt would still verify, bound to that error message.

A v0.3.0 enhancement (open work) is to parse the Phoenix output into structured per-item records before committing. That gives more semantically useful selective disclosure but does not change the underlying cryptographic property.

## Reproducibility (mock) vs reproducibility (production)

The `npm run repro-demo` script proves that this wrapper, in mock mode, produces identical `input_commitment` and `output_root` across independent runs with the same input. That is **wrapper-level reproducibility**.

Production-recommender reproducibility (whether a real-world ranker, run twice with the same input, produces the same output) is a property of the underlying system, not the receipt. Many ML systems are non-deterministic at the hardware level (e.g. GPU fused multiply-add ordering, mixed-precision rounding). A deployment that wants reproducible production receipts should pin its execution environment and inputs precisely.

The receipt format makes reproducibility **checkable**: any two receipts can be compared field-by-field, and any mismatch is immediately visible. It does not **enforce** reproducibility.

## Observer trust

The receipt is only as trustworthy as the signer.

- If the signer holds the private key, they choose what bytes get hashed. A dishonest signer could hash whatever they want and sign it, then claim the output was "bound" to those bytes.
- The receipt does not prove the signer was honest about what `phoenix/run_pipeline.py` actually produced. It proves the signer signed those specific bytes.
- To get binding stronger than "trust this signer," you need external attestation: a trusted execution environment, multiple independent signers, transparency-log anchoring, etc. The receipt format composes with all three but does not require any of them.

For the shipped example, the signer is the wrapper's local Ed25519 keypair, and the JWKS is shipped alongside the receipt. The trust model is: "trust whoever published this JWKS." For higher-assurance deployments, the JWKS should be served from a domain you control, anchored in a transparency log, or co-signed by independent parties.

## Browser verifier

The in-browser verifier at https://www.scopeblind.com/verify-receipt verifies receipt contents locally in your browser using `@noble/curves`. Receipt contents you paste or drop are not uploaded to any server.

It does load static assets (HTML, JS bundles) from Cloudflare Pages CDN at page load, and the "Load example" button fetches the example receipt + JWKS from a public jsDelivr CDN mirror of this repo. No telemetry, no receipt content transmission.

## Regulatory framing

Receipts are an engineering primitive, not a regulatory artifact. Whether a deployment of receipt-emitting recommenders satisfies any specific regulatory framework (DSA Article 27, AI Act Article 12, etc.) depends on retention policy, access control, the auditor's authority, the regulator's view of the receipt's evidentiary weight, and other factors well outside the scope of the receipt format itself.

Nothing in this repo is legal advice. The format is published as an IETF Internet-Draft (`draft-farley-acta-signed-receipts`) to allow legal and regulatory review on its own terms.

## Versions

- This document applies to the `v0.2.0` release shipped 16 May 2026.
- Material changes to what receipts prove will be flagged in future revisions of this document and noted in the changelog.

## Reporting

If you find a case where this repo overclaims, file an issue. Precision in what we claim is the whole point.
