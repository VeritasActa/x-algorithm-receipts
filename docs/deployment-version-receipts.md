# Deployment/version receipts for recommender systems

The post-ranking receipt proves a specific ranking run was bound to specific
code, model artifacts, config, input commitment, and output root.

A deployment/version receipt is the lower-friction production feature: it lets a
platform publish signed evidence of which algorithm, model bundle, config, and
policy bundle were active during a rollout window without exposing user data or
ranking outputs.

## Demo

```sh
npm run deployment-demo
```

The demo reads `examples/x-feed-real.receipt.json`, verifies it, and derives two
new artifacts:

- `recommender_deployment_receipt`: public version evidence for a rollout window.
- `for_you_feed_version_certificate`: a user-facing certificate that discloses
  algorithm/model/config/policy metadata while keeping viewer/session inputs
  committed but private.

Fixtures live under `examples/deployment-version/`.

## What X could expose publicly

A production deployment receipt could safely disclose:

- deployment id
- valid-from / valid-until window
- algorithm commit
- model artifact Merkle root
- config hash
- policy bundle root
- rollout cohort or region, if X chooses

It does not need to disclose:

- user identity
- user feature vectors
- candidate sets
- ranking outputs
- raw policy internals

## User-facing certificate

A Premium user could receive a small certificate saying:

> This For You session was served by algorithm commit C, model bundle M, config
> H, and policy bundle P.

The session-specific data remains private, but committed. That makes the
certificate useful for transparency without turning the product into a raw data
export surface.

## Why this is the first pitch

This is less invasive than per-feed receipts and easier to adopt than researcher
selective disclosure. It closes the immediate transparency gap:

> Open source shows the algorithm. Deployment receipts prove which version was
> actually active during a rollout window.

## Limits

The demo is not a claim about production X. It shows the receipt shape and the
verification path. A real deployment would need X or an authorized deployment
observer to hold the signing key and define the deployment window, rollout
metadata, and disclosure policy.
