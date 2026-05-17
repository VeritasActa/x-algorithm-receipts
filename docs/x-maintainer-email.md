# Draft email to X algorithm maintainers

Subject: Verifiable production-version receipts for the open X algorithm

Hi Yagiz,

Thank you to you and the team for publishing the X algorithm. Open sourcing the
For You system is a major transparency step.

I built a companion demo showing a possible next layer: signed deployment/version
receipts that prove which algorithm commit, model bundle, config hash, and policy
bundle were active during a rollout window.

Repo:
https://github.com/VeritasActa/x-algorithm-receipts

The simplest X-native feature is not a governance product. It is an optional
deployment receipt:

1. X publishes a signed receipt saying production rollout R used algorithm commit
   C, model artifact root M, config hash H, and policy bundle P during time
   window T.
2. Anyone can verify the receipt offline.
3. No user data, ranking output, or private infrastructure details need to be
   disclosed.

I added a working demo:

```sh
npm install
npm run deployment-demo
npx @veritasacta/verify examples/deployment-version/deployment.receipt.json \
  --jwks examples/deployment-version/deployment.jwks
```

The repo also includes a user-facing certificate example: a Premium user could
see that a feed session used algorithm version C / model bundle M / policy bundle
P, while the viewer features and candidate set remain committed but private.

For deeper audits, the same repo demonstrates post-ranking receipts and
VOPRF-gated selective disclosure for vetted researchers. The claim is narrow:
execution/version binding, not ranking quality or fairness.

If useful, I would be happy to draft this as a minimal optional audit hook with
no dependency on Veritas Acta. The hook can simply emit structured evidence;
signing, anchoring, and disclosure policy can remain outside the core ranking
pipeline.

Best,
Tom Farley
