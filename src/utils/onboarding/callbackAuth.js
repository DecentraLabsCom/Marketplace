import { createHmac, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';

const CALLBACK_ISSUER = 'marketplace-onboarding-callback';
const CALLBACK_AUDIENCE = 'marketplace-onboarding';
const CALLBACK_TYPE = 'onboarding-callback';
const CALLBACK_TOKEN_QUERY_PARAM = 'cb_token';
const DEFAULT_TOKEN_TTL_SECONDS = 20 * 60;
const DEFAULT_HMAC_MAX_AGE_SECONDS = 5 * 60;

const parseBoolean = (value) => String(value || '').toLowerCase() === 'true';

const resolveTokenTtlSeconds = () => {
  const parsed = Number(process.env.ONBOARDING_CALLBACK_TOKEN_TTL_SECONDS || DEFAULT_TOKEN_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TOKEN_TTL_SECONDS;
  }
  return Math.floor(parsed);
};

const resolveMaxHmacAgeSeconds = () => {
  const parsed = Number(process.env.ONBOARDING_CALLBACK_HMAC_MAX_AGE_SECONDS || DEFAULT_HMAC_MAX_AGE_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HMAC_MAX_AGE_SECONDS;
  }
  return Math.floor(parsed);
};

export const isOnboardingCallbackSignatureRequired = () =>
  parseBoolean(process.env.ONBOARDING_CALLBACK_REQUIRE_SIGNATURE);

export const getOnboardingCallbackSecret = ({ required = false } = {}) => {
  const secret = process.env.ONBOARDING_CALLBACK_SECRET || process.env.SESSION_SECRET || '';
  if (secret && secret.length >= 32) {
    return secret;
  }

  if (required) {
    throw new Error(
      'Onboarding callback secret is required (set ONBOARDING_CALLBACK_SECRET or SESSION_SECRET with >= 32 chars)'
    );
  }
  return null;
};

export const canVerifyOnboardingCallbackSignature = () =>
  Boolean(getOnboardingCallbackSecret({ required: false }));

export function issueOnboardingCallbackToken({ stableUserId, institutionId, sessionId = null } = {}) {
  const secret = getOnboardingCallbackSecret({ required: true });
  const ttlSeconds = resolveTokenTtlSeconds();
  const nowSec = Math.floor(Date.now() / 1000);

  const payload = {
    typ: CALLBACK_TYPE,
    iat: nowSec,
    ...(stableUserId ? { stableUserId } : {}),
    ...(institutionId ? { institutionId } : {}),
    ...(sessionId ? { sessionId } : {}),
  };

  const token = jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: CALLBACK_ISSUER,
    audience: CALLBACK_AUDIENCE,
    expiresIn: ttlSeconds,
  });

  return {
    token,
    expiresAt: new Date((nowSec + ttlSeconds) * 1000).toISOString(),
    ttlSeconds,
  };
}

export function extractCallbackTokenFromRequest(request) {
  try {
    const url = new URL(request.url);
    const tokenFromQuery = url.searchParams.get(CALLBACK_TOKEN_QUERY_PARAM) || url.searchParams.get('token');
    if (tokenFromQuery) return tokenFromQuery;
  } catch {
    // Ignore URL parsing issues and continue with headers.
  }

  const headerToken = request.headers.get('x-onboarding-callback-token');
  if (headerToken) return headerToken;

  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length).trim();
  }

  return null;
}

export function verifyOnboardingCallbackToken(token, expected = {}) {
  if (!token || typeof token !== 'string') {
    return { ok: false, code: 'MISSING_TOKEN' };
  }

  const secret = getOnboardingCallbackSecret({ required: false });
  if (!secret) {
    return { ok: false, code: 'TOKEN_SECRET_UNAVAILABLE' };
  }

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: CALLBACK_ISSUER,
      audience: CALLBACK_AUDIENCE,
    });

    if (payload?.typ !== CALLBACK_TYPE) {
      return { ok: false, code: 'INVALID_TOKEN_TYPE' };
    }

    if (expected.stableUserId && payload?.stableUserId && expected.stableUserId !== payload.stableUserId) {
      return { ok: false, code: 'STABLE_USER_MISMATCH' };
    }
    if (expected.institutionId && payload?.institutionId && expected.institutionId !== payload.institutionId) {
      return { ok: false, code: 'INSTITUTION_MISMATCH' };
    }
    if (expected.sessionId && payload?.sessionId && expected.sessionId !== payload.sessionId) {
      return { ok: false, code: 'SESSION_MISMATCH' };
    }

    return { ok: true, payload };
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return { ok: false, code: 'TOKEN_EXPIRED' };
    }
    return { ok: false, code: 'TOKEN_INVALID', error };
  }
}

function normalizeHexSignature(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  const prefixed = trimmed.toLowerCase().startsWith('sha256=') ? trimmed.slice('sha256='.length) : trimmed;
  if (!/^[a-fA-F0-9]{64}$/.test(prefixed)) {
    return null;
  }
  return prefixed.toLowerCase();
}

export function computeOnboardingCallbackHmac({ rawBody, timestamp, secret }) {
  const safeBody = typeof rawBody === 'string' ? rawBody : '';
  const safeTimestamp = String(timestamp || '');
  return createHmac('sha256', secret).update(`${safeTimestamp}.${safeBody}`).digest('hex');
}

export function verifyOnboardingCallbackHmac(request, rawBody) {
  const signatureHeader = request.headers.get('x-onboarding-signature');
  const timestampHeader = request.headers.get('x-onboarding-timestamp');

  if (!signatureHeader && !timestampHeader) {
    return { ok: false, code: 'MISSING_HMAC' };
  }

  const signature = normalizeHexSignature(signatureHeader);
  if (!signature) {
    return { ok: false, code: 'INVALID_HMAC_SIGNATURE_FORMAT' };
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, code: 'INVALID_HMAC_TIMESTAMP' };
  }

  const maxAge = resolveMaxHmacAgeSeconds();
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > maxAge) {
    return { ok: false, code: 'HMAC_TIMESTAMP_EXPIRED' };
  }

  const secret = getOnboardingCallbackSecret({ required: false });
  if (!secret) {
    return { ok: false, code: 'HMAC_SECRET_UNAVAILABLE' };
  }

  const expected = computeOnboardingCallbackHmac({
    rawBody,
    timestamp,
    secret,
  });

  try {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(signature, 'hex');
    if (expectedBuffer.length !== providedBuffer.length) {
      return { ok: false, code: 'HMAC_MISMATCH' };
    }
    const matches = timingSafeEqual(expectedBuffer, providedBuffer);
    return matches ? { ok: true } : { ok: false, code: 'HMAC_MISMATCH' };
  } catch (error) {
    return { ok: false, code: 'HMAC_COMPARE_ERROR', error };
  }
}

export function buildSignedOnboardingCallbackUrl(baseCallbackUrl, claims = {}) {
  const required = isOnboardingCallbackSignatureRequired();
  const secretAvailable = canVerifyOnboardingCallbackSignature();

  if (!secretAvailable) {
    if (required) {
      throw new Error('Onboarding callback signature is required but no secret is configured');
    }
    return baseCallbackUrl;
  }

  const { token } = issueOnboardingCallbackToken(claims);
  const callbackUrl = new URL(baseCallbackUrl);
  callbackUrl.searchParams.set(CALLBACK_TOKEN_QUERY_PARAM, token);
  return callbackUrl.toString();
}

export default {
  isOnboardingCallbackSignatureRequired,
  getOnboardingCallbackSecret,
  canVerifyOnboardingCallbackSignature,
  issueOnboardingCallbackToken,
  extractCallbackTokenFromRequest,
  verifyOnboardingCallbackToken,
  computeOnboardingCallbackHmac,
  verifyOnboardingCallbackHmac,
  buildSignedOnboardingCallbackUrl,
};
