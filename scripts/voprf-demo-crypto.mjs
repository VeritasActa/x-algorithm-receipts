import { randomBytes } from 'node:crypto';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

const G = p256.ProjectivePoint.BASE;
const N = p256.CURVE.n;

export function randomScalar() {
  let scalar = modN(bytesToBig(randomBytes(32)));
  return scalar === 0n ? 1n : scalar;
}

export function createDemoIssuer({ kid = 'scopeblind-demo-voprf-2026' } = {}) {
  const k = randomScalar();
  const Y = G.multiply(k);
  return {
    kid,
    privateScalar: k,
    publicKey: b64u(Y.toRawBytes(true)),
  };
}

export function issueDemoToken({
  issuer,
  origin,
  epoch = epochDay(),
  policy,
  receiptId,
  withClientProof = true,
}) {
  const KID = issuer.kid;
  const AADr = buildAADr({ policy, receiptId });
  const Y = G.multiply(issuer.privateScalar);
  const P = scopePoint({ origin, epoch, AADr });
  const rBlind = randomScalar();
  const M = P.multiply(rBlind);
  const Z = M.multiply(issuer.privateScalar);
  const piI = proveDleqIssuer({ k: issuer.privateScalar, Y, M, Z });
  const Zprime = Z.multiply(modInverse(rBlind, N));
  const eta = new Uint8Array(32);
  const yBytes = Hlabel('OPRF_METERING_Y_v1', Zprime.toRawBytes(true), KID, AADr, eta);
  const cNonce = randomBytes(16);
  const dClient = Hlabel('HTTP_CTX_v1', 'POST', '/verify/recommender-disclosure', sha256(new Uint8Array(0)));
  const tlsHash = sentinelTlsHash();

  const token = {
    algorithm: 'voprf-p256-sha256',
    kid: KID,
    KID,
    AADr,
    origin,
    epoch,
    policy,
    receipt_id: receiptId,
    issuer_public_key: b64u(Y.toRawBytes(true)),
    P: b64u(P.toRawBytes(true)),
    M: b64u(M.toRawBytes(true)),
    Z: b64u(Z.toRawBytes(true)),
    Zprime: b64u(Zprime.toRawBytes(true)),
    piI,
    y: b64u(yBytes),
    eta: b64u(eta),
    c: b64u(cNonce),
    d_client: b64u(dClient),
    tlsHash: b64u(tlsHash),
    scope: { origin, epoch, policy, receipt_id: receiptId },
  };

  if (withClientProof) {
    token.piC = proveClientBlind({
      P,
      M,
      rBlind,
      y: yBytes,
      cNonce,
      dClient,
      AADr,
      KID,
      eta,
      tlsHash,
    });
  }

  return {
    token,
    issuerLog: {
      kid: KID,
      blinded_request: shortHash(token.M),
      issued_evaluation: shortHash(token.Z),
      sees_receipt_id: false,
      sees_policy: false,
      note: 'The issuer signs the blinded element M. It does not learn the redemption scope or later nullifier.',
    },
  };
}

export async function verifyDemoVoprfToken(input, opts = {}) {
  const algorithm = input.algorithm || 'voprf-p256-sha256';
  if (algorithm !== 'voprf-p256-sha256') return invalid('unsupported_algorithm', algorithm);

  const issuerPubKey = opts.issuerPublicKey || input.issuer_public_key;
  if (!issuerPubKey) return invalid('missing_issuer_public_key', algorithm);

  for (const field of ['M', 'Z', 'Zprime', 'piI']) {
    if (input[field] === undefined || input[field] === null) return invalid(`missing_field:${field}`, algorithm);
  }
  if (!input.piI?.c || !input.piI?.r) return invalid('malformed_piI', algorithm);

  let M, Z, Zprime, Y;
  try {
    M = decodePoint(input.M);
    Z = decodePoint(input.Z);
    Zprime = decodePoint(input.Zprime);
    Y = decodePoint(issuerPubKey);
  } catch (err) {
    return invalid(err?.message || 'invalid_point', algorithm);
  }

  const piIValid = dleqVerifyIssuer({
    Y,
    M,
    Z,
    c: bytesToBig(b64ud(input.piI.c)),
    r: bytesToBig(b64ud(input.piI.r)),
  });
  if (!piIValid) return invalid('invalid_piI', algorithm, { kid: input.kid || input.KID, dleq: { issuer: false, client: null } });

  let piCValid = null;
  if (input.piC) {
    const P = decodePoint(input.P);
    const KID = input.KID || input.kid || '';
    const AADr = input.AADr || '';
    const y = input.y ? b64ud(input.y) : new Uint8Array(0);
    const cNonce = input.c ? b64ud(input.c) : new Uint8Array(0);
    const d = input.d_client ? b64ud(input.d_client) : new Uint8Array(0);
    const eta = input.eta ? b64ud(input.eta) : new Uint8Array(0);
    const tlsHash = input.tlsHash ? b64ud(input.tlsHash) : sentinelTlsHash();
    const bindContext = buildClientBindContext({ y, cNonce, d, AADr, KID, eta, tlsHash });
    piCValid = dleqVerifyClient({
      P,
      M,
      c: bytesToBig(b64ud(input.piC.c)),
      r: bytesToBig(b64ud(input.piC.r)),
      bindContext,
    });
    if (!piCValid) return invalid('invalid_piC', algorithm, { kid: input.kid || input.KID, dleq: { issuer: true, client: false } });
  } else if (opts.requireClientProof) {
    return invalid('missing_piC', algorithm, { kid: input.kid || input.KID, dleq: { issuer: true, client: null } });
  }

  const KID = input.KID || input.kid || '';
  const AADr = input.AADr || '';
  const eta = input.eta ? b64ud(input.eta) : new Uint8Array(0);
  const nullifier = b64u(deriveNullifier(b64ud(input.Zprime), KID, AADr, eta));
  const scope = input.scope || { origin: input.origin, epoch: input.epoch, policy: input.policy, receipt_id: input.receipt_id };

  if (opts.expectedPolicy && scope.policy !== opts.expectedPolicy) {
    return invalid('policy_mismatch', algorithm, { scope });
  }
  if (opts.expectedReceiptId && scope.receipt_id !== opts.expectedReceiptId) {
    return invalid('receipt_mismatch', algorithm, { scope });
  }

  return {
    valid: true,
    format: 'voprf-token',
    algorithm,
    scope,
    nullifier,
    kid: input.kid || input.KID,
    dleq: { issuer: true, client: piCValid === null ? null : true },
  };
}

export function buildAADr({ policy, receiptId }) {
  return `policy=${policy}|receipt=${receiptId}`;
}

export function epochDay(date = new Date()) {
  return Math.floor(date.getTime() / 86400000);
}

export function shortHash(value, size = 16) {
  return b64u(sha256(typeof value === 'string' ? utf8ToBytes(value) : value)).slice(0, size);
}

function invalid(error, algorithm, extra = {}) {
  return { valid: false, error, format: 'voprf-token', algorithm, ...extra };
}

function scopePoint({ origin, epoch, AADr }) {
  const seed = Hlabel('SCOPE_POINT_v1', origin, String(epoch), AADr);
  const scalar = modN(bytesToBig(seed)) || 1n;
  return G.multiply(scalar);
}

function proveDleqIssuer({ k, Y, M, Z }) {
  const alpha = randomScalar();
  const A1 = G.multiply(alpha);
  const A2 = M.multiply(alpha);
  const c = modN(bytesToBig(Hlabel(
    'OPRF_METERING_DLEQ_v1',
    G.toRawBytes(true), Y.toRawBytes(true),
    M.toRawBytes(true), Z.toRawBytes(true),
    A1.toRawBytes(true), A2.toRawBytes(true),
  )));
  const r = modN(alpha - c * k);
  return { c: b64u(bigToBytes32(c)), r: b64u(bigToBytes32(r)) };
}

function proveClientBlind({ P, M, rBlind, y, cNonce, dClient, AADr, KID, eta, tlsHash }) {
  const bindContext = buildClientBindContext({ y, cNonce, d: dClient, AADr, KID, eta, tlsHash });
  const kc = randomScalar();
  const A1 = P.multiply(kc);
  const A2 = G;
  const c = modN(bytesToBig(Hlabel(
    'OPRF_METERING_DLEQ_v1',
    P.toRawBytes(true), M.toRawBytes(true),
    G.toRawBytes(true), G.toRawBytes(true),
    A1.toRawBytes(true), A2.toRawBytes(true),
    bindContext,
  )));
  const r = modN(kc - c * rBlind);
  return { c: b64u(bigToBytes32(c)), r: b64u(bigToBytes32(r)) };
}

function dleqVerifyIssuer({ Y, M, Z, c, r }) {
  return dleqVerify({
    g1: G, h1: Y,
    g2: M, h2: Z,
    c, r,
    bind: new Uint8Array(0),
  });
}

function dleqVerifyClient({ P, M, c, r, bindContext }) {
  return dleqVerify({
    g1: P, h1: M,
    g2: G, h2: G,
    c, r,
    bind: bindContext,
    A2Override: G,
  });
}

function dleqVerify({ g1, h1, g2, h2, c, r, bind, A2Override }) {
  const A1 = g1.multiply(r).add(h1.multiply(c));
  const A2 = A2Override || g2.multiply(r).add(h2.multiply(c));
  const challenge = Hlabel(
    'OPRF_METERING_DLEQ_v1',
    g1.toRawBytes(true), h1.toRawBytes(true),
    g2.toRawBytes(true), h2.toRawBytes(true),
    A1.toRawBytes(true), A2.toRawBytes(true),
    bind || new Uint8Array(0),
  );
  return modN(bytesToBig(challenge)) === c;
}

function buildClientBindContext({ y, cNonce, d, AADr, KID, eta, tlsHash }) {
  return H('BRASS_BIND_v1', y, cNonce, d, AADr, KID, eta, tlsHash);
}

function deriveNullifier(Zprime, KID, AADr, eta) {
  return Hlabel('OPRF_METERING_Y_v1', Zprime, KID, AADr, eta);
}

function sentinelTlsHash() {
  return sha256(utf8ToBytes('BRASS:TLS_EXPORTER_v1:NO_TLS_EXPORTER_v1'));
}

function decodePoint(value) {
  const point = p256.ProjectivePoint.fromHex(b64ud(value));
  point.assertValidity();
  if (point.equals(p256.ProjectivePoint.ZERO)) throw new Error('invalid_point_infinity');
  return point;
}

function Hlabel(label, ...parts) {
  return H(`BRASS:${label}:`, ...parts);
}

function H(...parts) {
  const byteParts = parts.map(toBytes);
  const total = byteParts.reduce((sum, part) => sum + part.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const part of byteParts) {
    buf.set(part, offset);
    offset += part.length;
  }
  return sha256(buf);
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return utf8ToBytes(value);
  throw new TypeError('expected string or Uint8Array');
}

function modN(value) {
  const result = value % N;
  return result >= 0n ? result : result + N;
}

function modInverse(a, m) {
  let [oldR, r] = [a, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new Error('scalar is not invertible');
  return modN(oldS);
}

function bytesToBig(bytes) {
  let out = 0n;
  for (const byte of bytes) out = (out << 8n) | BigInt(byte);
  return out;
}

function bigToBytes32(value) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const raw = Buffer.from(hex, 'hex');
  const out = new Uint8Array(32);
  out.set(raw, 32 - raw.length);
  return out;
}

function b64u(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64ud(value) {
  let base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return new Uint8Array(Buffer.from(base64, 'base64'));
}
