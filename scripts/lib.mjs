import { createHash, generateKeyPairSync, createPrivateKey, sign as edSign, verify as edVerify } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

export function canonicalize(value) {
  assertAsciiKeys(value);
  return JSON.stringify(sortKeysDeep(value));
}

export function sortKeysDeep(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
  return out;
}

export function assertAsciiKeys(value) {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertAsciiKeys(item);
    return;
  }
  for (const key of Object.keys(value)) {
    for (let i = 0; i < key.length; i++) {
      if (key.charCodeAt(i) > 0x7f) throw new Error(`non-ASCII key rejected: ${JSON.stringify(key)}`);
    }
    assertAsciiKeys(value[key]);
  }
}

export function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function sha256Prefixed(input) {
  return `sha256:${sha256Hex(input)}`;
}

export function canonicalHash(value) {
  return sha256Prefixed(Buffer.from(canonicalize(value), 'utf8'));
}

export function fileSha256(path) {
  return sha256Prefixed(readFileSync(path));
}

export function base64urlToBuffer(value) {
  const pad = '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from((value + pad).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function bufferToBase64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function jwkPublicKeyHex(jwk) {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string') {
    throw new Error('expected Ed25519 OKP JWK');
  }
  return base64urlToBuffer(jwk.x).toString('hex');
}

export function publicJwksFromPrivateJwk(privateJwk) {
  return {
    keys: [{
      kty: 'OKP',
      crv: 'Ed25519',
      kid: privateJwk.kid,
      x: privateJwk.x,
      use: 'sig',
      alg: 'EdDSA',
    }],
  };
}

export function ensureDemoPrivateJwk(path) {
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  const kid = `x-algorithm-demo-${sha256Hex(base64urlToBuffer(pub.x)).slice(0, 12)}`;
  const jwk = { ...priv, kid, alg: 'EdDSA', use: 'sig' };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(jwk, null, 2)}\n`);
  return jwk;
}

export function signReceipt(type, payload, privateJwk, meta = {}) {
  const envelope = {
    v: 2,
    type,
    algorithm: 'ed25519',
    kid: privateJwk.kid,
    issuer: meta.issuer || 'did:web:scopeblind.com:examples:x-algorithm-receipts',
    issued_at: meta.issued_at || new Date().toISOString(),
    payload,
  };
  const key = createPrivateKey({ key: privateJwk, format: 'jwk' });
  const message = Buffer.from(canonicalize(envelope), 'utf8');
  const signature = edSign(null, message, key).toString('hex');
  return {
    artifact: { ...envelope, signature },
    signature,
    signed_hash: sha256Prefixed(message),
  };
}

export function verifyReceiptLocally(receipt, publicJwk) {
  const { signature, ...unsigned } = receipt;
  const message = Buffer.from(canonicalize(unsigned), 'utf8');
  const key = { key: publicJwk, format: 'jwk' };
  return edVerify(null, message, key, Buffer.from(signature, 'hex'));
}

export function merkleRootHex(leaves) {
  if (!Array.isArray(leaves) || leaves.length === 0) return sha256Hex(Buffer.alloc(0));
  let layer = leaves.map((leaf) => createHash('sha256').update(Buffer.concat([Buffer.from([0x00]), Buffer.from(leaf, 'utf8')])).digest());
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      const right = layer[i + 1] || layer[i];
      next.push(createHash('sha256').update(Buffer.concat([Buffer.from([0x01]), left, right])).digest());
    }
    layer = next;
  }
  return layer[0].toString('hex');
}

export function merkleRoot(values) {
  const leaves = values.map((value) => canonicalize(value));
  return `merkle-rfc6962-sha256:${merkleRootHex(leaves)}`;
}

export function listFilesRecursive(root, opts = {}) {
  const maxFiles = opts.maxFiles ?? 5000;
  const skipLargeBytes = opts.skipLargeBytes ?? 1024 * 1024 * 1024;
  const out = [];
  const walk = (dir) => {
    if (out.length >= maxFiles) return;
    const entries = safeReadDir(dir);
    for (const entry of entries) {
      if (out.length >= maxFiles) break;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['.git', '__pycache__', '.venv', 'node_modules'].includes(entry.name)) walk(path);
      } else if (entry.isFile()) {
        const st = statSync(path);
        if (st.size <= skipLargeBytes) out.push(path);
      }
    }
  };
  walk(resolve(root));
  return out.sort();
}

function safeReadDir(dir) {
  try {
    return Array.from(readdirSync(dir, { withFileTypes: true }));
  } catch {
    return [];
  }
}

export function relativePosix(from, to) {
  return relative(from, to).split(sep).join('/');
}
