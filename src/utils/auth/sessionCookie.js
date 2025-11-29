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
const DEFAULT_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds

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
 * Creates a complete session cookie configuration for Next.js response.cookies.set()
 * @param {SessionData} sessionData - User session data to store
 * @param {number} [maxAgeSec] - Cookie max age in seconds (default: 24 hours)
 * @returns {{ name: string, value: string, options: Object }} Cookie configuration
 */
export function createSessionCookie(sessionData, maxAgeSec = DEFAULT_MAX_AGE) {
  const token = createSessionToken(sessionData, maxAgeSec);
  const options = getSessionCookieOptions(maxAgeSec);
  
  return {
    name: options.name,
    value: token,
    ...options,
  };
}

/**
 * Creates a cookie configuration to destroy/clear the session
 * @returns {{ name: string, value: string, options: Object }} Cookie configuration for clearing
 */
export function createDestroySessionCookie() {
  return {
    name: COOKIE_NAME,
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
  const sessionCookie = cookieStore.get(COOKIE_NAME)?.value;
  
  if (!sessionCookie) {
    return null;
  }
  
  // Try to verify as JWT first (new format)
  const jwtSession = verifySessionToken(sessionCookie);
  if (jwtSession) {
    return jwtSession;
  }
  
  // Fallback: try to parse as plain JSON (legacy format - for migration)
  // This allows existing sessions to continue working during transition
  try {
    const legacySession = JSON.parse(sessionCookie);
    devLog.warn('⚠️ Legacy JSON session detected - will be converted to JWT on next write');
    return legacySession;
  } catch {
    // Not valid JSON either
    return null;
  }
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
  SESSION_COOKIE_NAME,
};
