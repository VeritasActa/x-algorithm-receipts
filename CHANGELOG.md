# Changelog

## v0.5.0 - 2026-05-17

- Added a deployment/version receipt demo, the lowest-friction X-facing feature.
- Added `scripts/deployment-receipt-demo.mjs`, which derives a public production-version-style receipt from the real Phoenix receipt.
- Added a user-facing feed-session certificate example for algorithm/model/config/policy metadata without exposing user features or ranked output.
- Added committed fixtures under `examples/deployment-version/`.
- Added `docs/deployment-version-receipts.md` and `docs/x-maintainer-email.md`.

## v0.4.0 - 2026-05-17

- Added a local BRASS/VOPRF-gated disclosure demo for the recommender receipt.
- Added `scripts/voprf-gated-disclosure-demo.mjs`, which verifies a receipt, verifies a VOPRF token, and opens a scoped top-10 structured disclosure with Merkle proofs.
- Added `scripts/unlinkability-demo.mjs`, which shows the issuer view and verifier view for two redemptions by the same approved researcher.
- Added committed fixtures under `examples/voprf-gated-disclosure/`.
- Added Noble P-256/SHA-256 dependencies for the local demo crypto.
- Added Merkle proof helpers and tests.

## v0.3.0 - 2026-05-17

- Added a Phoenix real-mode structured parser (`phoenix-table-v1`) for ranked table rows.
- Added `ranked_items_root` and `ranked_items_top_n_optional` alongside the existing byte-level `output_root`.
- Added `algorithm_source_root` so real-mode receipts bind the source tree as well as the upstream commit.
- Regenerated the real receipt against `xai-org/x-algorithm@0bfc2795d308f90032544322747caacd535f75ae`.
- Added parser tests and updated the schema/docs/limitations for the two-root output model.

## v0.2.0 - 2026-05-16

- Added real mode against the Phoenix pipeline and shipped a real-mode receipt fixture.
- Added `LIMITATIONS.md`.
- Added GitHub Actions receipt verification and README badge.
- Added reproducibility and tamper demos.
