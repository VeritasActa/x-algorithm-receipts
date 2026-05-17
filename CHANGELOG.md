# Changelog

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
