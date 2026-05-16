# Draft upstream issue

Title: Add optional post-ranking audit event hook

Body:

The published Phoenix pipeline is useful for understanding what could run. A small optional audit hook would make it easier for external tooling to prove what did run for a specific ranking invocation, without coupling the repository to any signing system or compliance framework.

Proposed shape:

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

Non-goals:

- No signing requirement inside `x-algorithm`.
- No policy engine.
- No external service dependency.
- No claim that the output is fair, truthful, or legally sufficient.

The hook only emits structured evidence. External systems can sign, store, selectively disclose, or anchor it as needed.

I built a wrapper demo showing the pattern against the published Phoenix pipeline shape: `[repo link]`. It emits one `recommender.post_ranking.v1` event per ranking run and signs it as a Veritas Acta receipt, but the hook itself is intentionally format-neutral.
