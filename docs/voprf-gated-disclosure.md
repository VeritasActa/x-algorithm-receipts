# VOPRF-gated recommender disclosure

The receipt format answers: "Was this ranking output bound to this code,
model, config, and input commitment?"

The VOPRF layer answers a different question: "Can this verifier unlock a
specific disclosure tier without letting the issuer track which receipt was
later verified?"

## Demo flow

```sh
npm run voprf-demo
```

The demo:

1. Verifies `examples/x-feed-real.receipt.json` with `examples/real.jwks`.
2. Creates a local BRASS-style VOPRF token for `dsa-researcher:top-10`.
3. Verifies issuer and client DLEQ proofs.
4. Derives a verifier-side nullifier.
5. Opens the top 10 structured ranked rows.
6. Verifies each disclosed row against the signed `ranked_items_root`.
7. Signs a disclosure attestation.

Fixtures live under `examples/voprf-gated-disclosure/`.

## Privacy boundary

The issuer sees a blinded request and an issued evaluation. It does not see the
receipt id, policy, or verifier-side nullifier in the local BRASS-style flow.

The verifier sees the token, scope, nullifier, receipt id, and requested
disclosure tier.

This means the issuer cannot link token issuance to later verification from the
cryptographic transcript alone. That is the property the demo is meant to make
visible.

## What this is not

This repo does not call the production ScopeBlind issuer at
`api.scopeblind.com`. The production commercial layer is managed issuance,
policy-tiered disclosure, retention, anchoring, and audit-room UX. This repo is
the public, reproducible demo layer.

This does not prove ranking fairness, truth, beneficial effect, legal
sufficiency, or production deployment.
