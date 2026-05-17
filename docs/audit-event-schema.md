# `recommender.post_ranking.v1` audit event

This profile describes a post-ranking audit event for a recommender-system pipeline.

It is intentionally narrower than a fairness, bias, or regulatory-compliance proof. It binds one ranking output to one code/model/config/input commitment set.

## Event lifecycle

1. A ranking pipeline receives private user/context inputs.
2. The pipeline computes ranked candidates.
3. The wrapper commits to private inputs with a Merkle root.
4. The wrapper commits to the exact stdout-line output with a Merkle root.
5. The wrapper parses Phoenix ranked rows into structured records and commits to them with a second Merkle root.
6. Optional top-N stdout lines and structured ranked items are disclosed for inspection.
7. The event is signed as a Veritas Acta v2 Ed25519 receipt.
8. A verifier checks the signature and recomputes any disclosed commitments offline.

## Required fields

| Field | Type | Description |
|---|---|---|
| `receipt_profile` | string | Must be `recommender.post_ranking.v1`. |
| `event_kind` | string | Must be `post_ranking_audit_event`. |
| `algorithm_repo` | string | Repository URL for the algorithm source. |
| `algorithm_commit` | string | Git commit identifier, prefixed with `git:`. |
| `algorithm_source_root` | string | RFC6962-style Merkle root over source-file commitments. |
| `pipeline` | string | Pipeline entry point. |
| `model_artifacts` | array | File-level artifact commitments. |
| `model_artifacts_root` | string | RFC6962-style Merkle root over artifact commitments. |
| `config_hash` | string | SHA-256 commitment to the effective config. |
| `input_commitment` | string | Commitment to private or selectively disclosed inputs. |
| `output_root` | string | Commitment to the exact stdout-line output. |
| `ranked_items_root` | string | Commitment to parsed structured ranked records. |
| `selected_count` | number | Number of committed ranked outputs. |
| `caveat` | string | Required limitation language. |

## Optional fields

| Field | Type | Description |
|---|---|---|
| `output_top_n_optional` | object | Selectively disclosed top-N stdout-line sample. |
| `ranked_items_top_n_optional` | object | Selectively disclosed structured top-N ranked records. |
| `run_command` | array | Command used to run the local demo. |
| `stdout_hash` | string | SHA-256 of captured stdout. |
| `stderr_hash` | string | SHA-256 of captured stderr. |
| `structured_output_version` | string | Parser profile for structured output, e.g. `phoenix-table-v1`. |
| `runtime_environment` | object | Wrapper/runtime metadata. |
| `algorithm_worktree_dirty` | boolean | Whether local source had uncommitted changes. |

## Non-goals

This profile does not prove fairness, truthfulness, beneficial social effect, legal sufficiency, or production deployment. It proves only that the signed event binds the disclosed and committed evidence to one ranking run.
