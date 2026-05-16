#!/usr/bin/env sh
set -eu
npx @veritasacta/verify examples/x-feed-demo.receipt.json --jwks examples/demo.jwks
node scripts/inspect-receipt.mjs examples/x-feed-demo.receipt.json
