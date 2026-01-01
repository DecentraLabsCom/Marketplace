/**
 * Session Cookie Management with JWT Signing
 * 
 * Provides secure session cookie handling by signing user session data with JWT/HMAC.
 * This prevents tampering with session data stored in cookies.
 * 
 * Security Features:
 * - JWT HS256 signing with SESSION_SECRET
 * - HttpOnly, Secure, SameSite=Strict cookies
 * - 24-hour session expiration
 * - Automatic validation on read
 */

import jwt from 'jsonwebtoken';
import devLog from '@/utils/dev/logger';

const COOKIE_NAME = 'user_session';
const COOKIE_CHUNK_COUNT_NAME = `${COOKIE_NAME}.count`;
const DEFAULT_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds
const MAX_COOKIE_VALUE_LENGTH = 3800;

function decodeBase64Value(value) {
  if (!value || typeof value !== 'string') return null;
  if (!/^[A-Za-z0-9+/_=-]+$/.test(value)) return null;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  try {
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function parseLegacyJson(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  try {
    const legacySession = JSON.parse(rawValue);
    devLog.warn('Legacy JSON session detected - will be converted to JWT on next write');
    return legacySession;
  } catch {
    return null;
  }
}

function tryParseCompoundJwt(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  const segments = rawValue.split('.');
  if (segments.length !== 2) return null;
  const [encodedLeft, signature] = segments;
  const decodedLeft = decodeBase64Value(encodedLeft);
  if (!decodedLeft) return null;

  if (decodedLeft.includes('.')) {
    const reconstructed = `${decodedLeft}.${signature}`;
    const jwtSession = verifySessionToken(reconstructed);
    if (jwtSession) return jwtSession;
  }

  return parseLegacyJson(decodedLeft);
}

function parseSessionValue(rawValue) {
  if (!rawValue) return null;

  const jwtSession = verifySessionToken(rawValue);
  if (jwtSession) {
    return jwtSession;
  }

  const legacySession = parseLegacyJson(rawValue);
  if (legacySession) return legacySession;

  const compoundSession = tryParseCompoundJwt(rawValue);
  if (compoundSession) return compoundSession;

  const decoded = decodeBase64Value(rawValue);
  if (!decoded) return null;

  const decodedJwt = verifySessionToken(decoded);
  if (decodedJwt) {
    return decodedJwt;
  }

  const decodedLegacy = parseLegacyJson(decoded);
  if (decodedLegacy) return decodedLegacy;

  return null;
}


/**
 * Get the session secret from environment
 * Falls back to a development-only secret if not configured
 * @returns {string} Session secret
 * @throws {Error} In production if SESSION_SECRET is not set
 */
function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET environment variable is required in production');
    }
    // Development fallback - NOT secure, only for local development
    devLog.warn('⚠️ Using development fallback SESSION_SECRET - NOT secure for production');
    return 'dev-only-session-secret-not-for-production-use-32chars';
  }
  
  // Validate minimum secret length (256 bits = 32 bytes)
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long');
  }
  
  return secret;
}

/**
 * Session data structure
 * @typedef {Object} SessionData
 * @property {string} id - User ID
 * @property {string} [email] - User email
 * @property {string} [name] - User display name
 * @property {string} [affiliation] - User's institution/organization
 * @property {string} [role] - User's role (e.g., 'student', 'staff')
 * @property {string} [scopedRole] - User's scoped affiliation
 * @property {string} [organizationType] - Organization type
 * @property {string} [personalUniqueCode] - Personal unique identifier
 * @property {string} [organizationName] - Organization name
 * @property {string} [wallet] - Associated wallet address (if linked)
 */

/**
 * Creates a signed JWT session cookie value
 * @param {SessionData} sessionData - User session data to store
 * @param {number} [maxAgeSec] - Cookie max age in seconds (default: 24 hours)
 * @returns {string} Signed JWT token
 */
export function createSessionToken(sessionData, maxAgeSec = DEFAULT_MAX_AGE) {
  if (!sessionData || typeof sessionData !== 'object') {
    throw new Error('Session data is required');
  }
  
  if (!sessionData.id && !sessionData.email) {
    throw new Error('Session must contain at least id or email');
  }
  
  const secret = getSessionSecret();
  
  const payload = {
    ...sessionData,
    // Add standard JWT claims
    iat: Math.floor(Date.now() / 1000),
  };
  
  const token = jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: maxAgeSec,
    issuer: 'marketplace-session',
  });
  
  devLog.log('✅ Session token created for user:', sessionData.id || sessionData.email);
  
  return token;
}

/**
 * Verifies and decodes a session token
 * @param {string} token - JWT token from cookie
 * @returns {SessionData|null} Decoded session data or null if invalid
 */
export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }
  
  try {
    const secret = getSessionSecret();
    
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'marketplace-session',
    });
    
    // Remove JWT-specific claims from returned data
    const { iat, exp, iss, ...sessionData } = decoded;
    
    return sessionData;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      devLog.log('Session token expired');
    } else if (error.name === 'JsonWebTokenError') {
      devLog.warn('Invalid session token:', error.message);
    } else {
      devLog.error('Session verification error:', error.message);
    }
    return null;
  }
}

/**
 * Creates cookie options for the session cookie
 * @param {number} [maxAgeSec] - Cookie max age in seconds (default: 24 hours)
 * @returns {Object} Cookie options object
 */
export function getSessionCookieOptions(maxAgeSec = DEFAULT_MAX_AGE) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: maxAgeSec,
  };
}

/**
 * Splits large cookie values into safe-sized chunks.
 */
function chunkCookieValue(value) {
  const chunks = [];
  for (let i = 0; i < value.length; i += MAX_COOKIE_VALUE_LENGTH) {
    chunks.push(value.slice(i, i + MAX_COOKIE_VALUE_LENGTH));
  }
  return chunks;
}

function getChunkedSessionToken(cookieStore) {
  const prefix = `${COOKIE_NAME}.`;
  const chunkCountRaw = cookieStore?.get?.(COOKIE_CHUNK_COUNT_NAME)?.value;
  const chunkCount = Number(chunkCountRaw);

  if (Number.isFinite(chunkCount) && chunkCount > 0) {
    const chunks = [];
    for (let i = 0; i < chunkCount; i += 1) {
      const value = cookieStore?.get?.(`${COOKIE_NAME}.${i}`)?.value;
      if (!value) {
        return null;
      }
      chunks.push(value);
    }
    return chunks.join('');
  }

  if (cookieStore?.getAll) {
    const chunks = cookieStore
      .getAll()
      .filter((cookie) => cookie.name.startsWith(prefix))
      .map((cookie) => {
        const index = Number(cookie.name.slice(prefix.length));
        return Number.isFinite(index) ? { index, value: cookie.value } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);

    if (!chunks.length) return null;
    return chunks.map((chunk) => chunk.value).join('');
  }

  const chunks = [];
  for (let i = 0; i < 20; i += 1) {
    const value = cookieStore?.get?.(`${COOKIE_NAME}.${i}`)?.value;
    if (!value) break;
    chunks.push(value);
  }
  return chunks.length ? chunks.join('') : null;
}

function getBaseSessionValues(cookieStore) {
  if (!cookieStore) return [];

  if (cookieStore.getAll) {
    const matches = cookieStore
      .getAll()
      .filter((cookie) => cookie.name === COOKIE_NAME && cookie.value);

    if (matches.length) {
      return matches.map((cookie) => cookie.value);
    }
  }

  const value = cookieStore.get?.(COOKIE_NAME)?.value;
  return value ? [value] : [];
}

/**
 * Creates session cookie configurations for Next.js response.cookies.set()
 * @param {SessionData} sessionData - User session data to store
 * @param {number} [maxAgeSec] - Cookie max age in seconds (default: 24 hours)
 * @returns {Array<{ name: string, value: string, options: Object }>} Cookie configurations
 */
export function createSessionCookie(sessionData, maxAgeSec = DEFAULT_MAX_AGE) {
  const token = createSessionToken(sessionData, maxAgeSec);
  const options = getSessionCookieOptions(maxAgeSec);
  const chunks = chunkCookieValue(token);

  if (chunks.length === 1) {
    return [{
      name: options.name,
      value: token,
      ...options,
    }];
  }

  const clearBase = {
    name: options.name,
    value: '',
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    maxAge: 0,
  };
  const chunkCountCookie = {
    ...options,
    name: COOKIE_CHUNK_COUNT_NAME,
    value: String(chunks.length),
  };

  return [
    clearBase,
    chunkCountCookie,
    ...chunks.map((chunk, index) => ({
      ...options,
      name: `${options.name}.${index}`,
      value: chunk,
    })),
  ];
}

/**
 * Creates a cookie configuration to destroy/clear the session
 * @returns {{ name: string, value: string, options: Object }} Cookie configuration for clearing
 */
export function createDestroySessionCookie(name = COOKIE_NAME) {
  return {
    name,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  };
}

/**
 * Gets session data from a cookie store (Next.js cookies())
 * @param {Object} cookieStore - Next.js cookie store from cookies()
 * @returns {SessionData|null} Session data or null if no valid session
 */
export function getSessionFromCookies(cookieStore) {
  const baseValues = getBaseSessionValues(cookieStore);

  if (baseValues.length) {
    const combined = baseValues.length === 1 ? baseValues[0] : baseValues.join('');
    const parsedCombined = parseSessionValue(combined);
    if (parsedCombined) return parsedCombined;

    if (baseValues.length > 1) {
      const parsedDotted = parseSessionValue(baseValues.join('.'));
      if (parsedDotted) return parsedDotted;

      for (const value of baseValues) {
        const parsed = parseSessionValue(value);
        if (parsed) return parsed;
      }
    }
  }

  const sessionCookie = getChunkedSessionToken(cookieStore);

  if (!sessionCookie) {
    return null;
  }

  return parseSessionValue(sessionCookie);
}


export function clearSessionCookies(cookieStore) {
  if (!cookieStore) return [];
  const names = new Set([COOKIE_NAME, COOKIE_CHUNK_COUNT_NAME]);
  const prefix = `${COOKIE_NAME}.`;

  if (cookieStore.getAll) {
    cookieStore.getAll().forEach((cookie) => {
      if (cookie.name.startsWith(prefix)) {
        names.add(cookie.name);
      }
    });
  } else {
    for (let i = 0; i < 20; i += 1) {
      const name = `${COOKIE_NAME}.${i}`;
      if (!cookieStore.get?.(name)) break;
      names.add(name);
    }
  }

  const cleared = [];
  names.forEach((name) => {
    const destroy = createDestroySessionCookie(name);
    cookieStore.set(destroy.name, destroy.value, {
      maxAge: destroy.maxAge,
      path: destroy.path,
      httpOnly: destroy.httpOnly,
      secure: destroy.secure,
      sameSite: destroy.sameSite,
    });
    if (cookieStore.delete) {
      cookieStore.delete(name);
    }
    cleared.push(name);
  });

  return cleared;
}

/**
 * Cookie name constant for external use
 */
export const SESSION_COOKIE_NAME = COOKIE_NAME;

export default {
  createSessionToken,
  verifySessionToken,
  createSessionCookie,
  createDestroySessionCookie,
  getSessionFromCookies,
  getSessionCookieOptions,
  clearSessionCookies,
  SESSION_COOKIE_NAME,
};
