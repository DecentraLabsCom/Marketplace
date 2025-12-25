import { SignJWT, importPKCS8, importSPKI, exportJWK, calculateJwkThumbprint } from 'jose';
import { createPublicKey, randomUUID } from 'crypto';
import marketplaceJwtService from './marketplaceJwt';
import devLog from '@/utils/dev/logger';

const ALG = 'RS256';
let cachedKeys = null;

async function getKeyMaterial() {
  if (cachedKeys) {
    return cachedKeys;
  }

  const privateKeyPem = await marketplaceJwtService.getPrivateKeyPem();
  const privateKey = await importPKCS8(privateKeyPem, ALG);

  // Derive public key and convert to JWK
  const publicKeyPem = createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString();
  const publicKey = await importSPKI(publicKeyPem, ALG);
  const publicJwk = await exportJWK(publicKey);

  // Compute deterministic kid from public JWK thumbprint
  const thumbprint = await calculateJwkThumbprint({ kty: publicJwk.kty, n: publicJwk.n, e: publicJwk.e });
  const jwkWithMeta = { ...publicJwk, kid: thumbprint, alg: ALG, use: 'sig' };

  cachedKeys = {
    privateKey,
    kid: thumbprint,
    publicJwk: jwkWithMeta,
  };

  devLog.log('ProvisioningToken: Signing material loaded (kid set)');
  return cachedKeys;
}

export async function getProvisioningJwks() {
  const { publicJwk } = await getKeyMaterial();
  return { keys: [publicJwk] };
}

export async function signProvisioningToken(claims, {
  issuer = 'marketplace-provisioning',
  audience = 'blockchain-services',
  ttlSeconds = 900,
} = {}) {
  const { privateKey, kid } = await getKeyMaterial();
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + ttlSeconds;

  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: ALG, kid })
    .setIssuedAt(nowSec)
    .setExpirationTime(expSec)
    .setIssuer(issuer)
    .setAudience(audience)
    .setJti(randomUUID())
    .sign(privateKey);

  return { token, expiresAt: new Date(expSec * 1000).toISOString(), kid };
}

export function normalizeHttpsUrl(url, label) {
  if (!url || typeof url !== 'string') {
    throw new Error(`${label} is required`);
  }
  const trimmed = url.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new Error(`${label} must be a valid URL`);
  }

  const protocol = parsed.protocol.toLowerCase();
  const isDev = process.env.NODE_ENV !== 'production';
  if (protocol !== 'https:' && !(isDev && protocol === 'http:')) {
    throw new Error(`${label} must start with https://`);
  }

  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function requireString(value, label) {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

export function requireEmail(value, label = 'email') {
  const email = requireString(value, label);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error(`Invalid ${label}`);
  }
  return email;
}

export function requireApiKey(value) {
  const isDev = process.env.NODE_ENV !== 'production';
  if ((!value || typeof value !== 'string' || value.trim().length === 0) && isDev) {
    return 'dev-only-institutional-services-api-key-32chars';
  }

  const key = requireString(value, 'API key');
  if (key.length < 32) {
    throw new Error('API key must be at least 32 characters');
  }
  return key;
}
