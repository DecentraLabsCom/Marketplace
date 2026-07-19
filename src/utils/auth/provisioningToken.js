import {
  SignJWT,
  importPKCS8,
  importSPKI,
  exportJWK,
  calculateJwkThumbprint,
  decodeJwt,
  importJWK,
  jwtVerify,
} from 'jose';
import { createPublicKey, randomBytes, randomUUID } from 'crypto';
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
  audience,
  subject = 'marketplace',
  ttlSeconds = 900,
} = {}) {
  const tokenAudience = requireString(audience, 'Token audience');
  if (subject !== 'marketplace') {
    throw new Error('Provisioning token subject must be marketplace');
  }
  const { privateKey, kid } = await getKeyMaterial();
  const payload = createProvisioningPayload(claims, { ttlSeconds });

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: ALG, kid })
    .setIssuedAt(payload.issuedAt)
    .setExpirationTime(payload.expiresAt)
    .setIssuer(issuer)
    .setAudience(tokenAudience)
    .setSubject(subject)
    .setJti(payload.jti)
    .sign(privateKey);

  return {
    token,
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
    kid,
    payload,
  };
}

export function createProvisioningPayload(claims, {
  ttlSeconds = 900,
  nowSec = Math.floor(Date.now() / 1000),
  jti = randomUUID(),
  nonce = `0x${randomBytes(32).toString('hex')}`,
} = {}) {
  const lifetime = Number(ttlSeconds);
  if (!Number.isSafeInteger(lifetime) || lifetime <= 0 || lifetime > 900) {
    throw new Error('Provisioning token TTL must be between 1 and 900 seconds');
  }
  const issuedAt = Number(nowSec);
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) {
    throw new Error('Provisioning token issuedAt must be a positive integer');
  }
  const expiresAt = issuedAt + lifetime;

  return {
    ...claims,
    jti,
    nonce,
    issuedAt,
    expiresAt,
    iat: issuedAt,
    exp: expiresAt,
  };
}

export function normalizeHttpsUrl(url, label) {
  if (!url || typeof url !== 'string') {
    throw new Error(`${label} is required`);
  }
  let trimmed = url.trim();
  const repeatedScheme = trimmed.match(/^(?:https?:\/\/)+/i);
  if (repeatedScheme) {
    const schemes = repeatedScheme[0].match(/https?:\/\//gi) || [];
    const preferredScheme = schemes.some((scheme) => scheme.toLowerCase() === 'https://')
      ? 'https://'
      : schemes[0].toLowerCase();
    trimmed = `${preferredScheme}${trimmed.slice(repeatedScheme[0].length)}`;
  } else {
    trimmed = `https://${trimmed}`;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new Error(`${label} must be a valid URL`, { cause: error });
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error(`${label} must start with http:// or https://`);
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

export function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    return null;
  }
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function normalizeAudienceValue(audience) {
  if (typeof audience === 'string' && audience.trim()) {
    return normalizeHttpsUrl(audience, 'Token audience');
  }
  if (Array.isArray(audience)) {
    const normalized = audience
      .filter((value) => typeof value === 'string' && value.trim())
      .map((value) => normalizeHttpsUrl(value, 'Token audience'));
    if (normalized.length > 0) {
      return normalized.length === 1 ? normalized[0] : normalized;
    }
  }
  throw new Error('Token audience is required');
}

function normalizeAudienceList(audience) {
  const values = Array.isArray(audience) ? audience : [audience];
  return values
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => normalizeHttpsUrl(value, 'Token audience'));
}

export async function verifyProvisioningToken(token, {
  issuer,
  clockToleranceSeconds = 60,
} = {}) {
  if (!token || typeof token !== 'string') {
    throw new Error('Provisioning token is required');
  }

  const expectedIssuer = normalizeHttpsUrl(issuer, 'Marketplace base URL');
  const decoded = decodeJwt(token);
  const expectedAudience = decoded.canonicalBackendOrigin
    ? normalizeHttpsUrl(decoded.canonicalBackendOrigin, 'Canonical backend origin')
    : normalizeAudienceValue(decoded.aud);

  const { publicJwk } = await getKeyMaterial();
  const publicKey = await importJWK(publicJwk, ALG);
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: expectedIssuer,
    audience: expectedAudience,
    clockTolerance: clockToleranceSeconds,
  });

  if (payload.marketplaceBaseUrl) {
    const claimMarketplaceBaseUrl = normalizeHttpsUrl(payload.marketplaceBaseUrl, 'Marketplace base URL');
    if (claimMarketplaceBaseUrl !== expectedIssuer) {
      throw new Error('Marketplace base URL mismatch');
    }
  }

  if (payload.canonicalBackendOrigin) {
    const claimPublicBaseUrl = normalizeHttpsUrl(payload.canonicalBackendOrigin, 'Canonical backend origin');
    const audienceList = normalizeAudienceList(payload.aud);
    if (audienceList.length === 0 || !audienceList.includes(claimPublicBaseUrl)) {
      throw new Error('Token audience must match public base URL');
    }
  }

  return payload;
}
