/**
 * Unit tests for sessionCookie.js
 * Tests JWT signing and verification for secure session cookies
 */

import jwt from 'jsonwebtoken';

// Mock the logger
jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock environment variables
const originalEnv = process.env;

describe('sessionCookie', () => {
  let sessionCookie;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set a valid 32+ character secret for testing
    process.env.SESSION_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('createSessionToken', () => {
    beforeEach(async () => {
      sessionCookie = await import('@/utils/auth/sessionCookie');
    });

    it('should create a valid JWT token from session data', () => {
      const sessionData = {
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
      };

      const token = sessionCookie.createSessionToken(sessionData);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should include all session data in the token', () => {
      const sessionData = {
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        affiliation: 'Test University',
        role: 'student',
        wallet: '0x1234567890abcdef1234567890abcdef12345678',
      };

      const token = sessionCookie.createSessionToken(sessionData);
      const decoded = jwt.decode(token);

      expect(decoded.id).toBe(sessionData.id);
      expect(decoded.email).toBe(sessionData.email);
      expect(decoded.name).toBe(sessionData.name);
      expect(decoded.affiliation).toBe(sessionData.affiliation);
      expect(decoded.role).toBe(sessionData.role);
      expect(decoded.wallet).toBe(sessionData.wallet);
    });

    it('should include JWT standard claims (iat, exp, iss)', () => {
      const sessionData = { id: 'user123', email: 'test@example.com' };

      const token = sessionCookie.createSessionToken(sessionData);
      const decoded = jwt.decode(token);

      expect(decoded.iat).toBeDefined();
      expect(typeof decoded.iat).toBe('number');
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
      expect(decoded.iss).toBe('marketplace-session');
    });

    it('should throw error if session data is missing', () => {
      expect(() => sessionCookie.createSessionToken(null)).toThrow('Session data is required');
      expect(() => sessionCookie.createSessionToken(undefined)).toThrow('Session data is required');
    });

    it('should throw error if session has no id or email', () => {
      expect(() => sessionCookie.createSessionToken({ name: 'Test' })).toThrow(
        'Session must contain at least id or email'
      );
    });

    it('should use custom maxAge when provided', () => {
      const sessionData = { id: 'user123' };
      const maxAge = 3600; // 1 hour

      const token = sessionCookie.createSessionToken(sessionData, maxAge);
      const decoded = jwt.decode(token);

      // exp should be approximately iat + maxAge
      expect(decoded.exp - decoded.iat).toBe(maxAge);
    });
  });

  describe('verifySessionToken', () => {
    beforeEach(async () => {
      sessionCookie = await import('@/utils/auth/sessionCookie');
    });

    it('should verify and decode a valid token', () => {
      const sessionData = {
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
      };

      const token = sessionCookie.createSessionToken(sessionData);
      const verified = sessionCookie.verifySessionToken(token);

      expect(verified).toBeDefined();
      expect(verified.id).toBe(sessionData.id);
      expect(verified.email).toBe(sessionData.email);
      expect(verified.name).toBe(sessionData.name);
    });

    it('should remove JWT claims from returned data', () => {
      const sessionData = { id: 'user123', email: 'test@example.com' };

      const token = sessionCookie.createSessionToken(sessionData);
      const verified = sessionCookie.verifySessionToken(token);

      expect(verified.iat).toBeUndefined();
      expect(verified.exp).toBeUndefined();
      expect(verified.iss).toBeUndefined();
    });

    it('should return null for invalid token', () => {
      const result = sessionCookie.verifySessionToken('invalid-token');
      expect(result).toBeNull();
    });

    it('should return null for null/undefined token', () => {
      expect(sessionCookie.verifySessionToken(null)).toBeNull();
      expect(sessionCookie.verifySessionToken(undefined)).toBeNull();
      expect(sessionCookie.verifySessionToken('')).toBeNull();
    });

    it('should return null for expired token', () => {
      const sessionData = { id: 'user123' };
      // Create token with 0 second expiry
      const token = jwt.sign(sessionData, process.env.SESSION_SECRET, {
        algorithm: 'HS256',
        expiresIn: -1, // Already expired
        issuer: 'marketplace-session',
      });

      const result = sessionCookie.verifySessionToken(token);
      expect(result).toBeNull();
    });

    it('should return null for token signed with wrong secret', () => {
      const sessionData = { id: 'user123' };
      const token = jwt.sign(sessionData, 'wrong-secret-key-that-is-32-chars-long', {
        algorithm: 'HS256',
        expiresIn: 3600,
        issuer: 'marketplace-session',
      });

      const result = sessionCookie.verifySessionToken(token);
      expect(result).toBeNull();
    });
  });

  describe('createSessionCookie', () => {
    beforeEach(async () => {
      sessionCookie = await import('@/utils/auth/sessionCookie');
    });

    it('should return complete cookie configuration', () => {
      const sessionData = { id: 'user123', email: 'test@example.com' };

      const cookies = sessionCookie.createSessionCookie(sessionData);
      const cookie = cookies[0];

      expect(cookie.name).toBe('user_session');
      expect(cookie.value).toBeDefined();
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe('strict');
      expect(cookie.path).toBe('/');
      expect(cookie.maxAge).toBe(60 * 60 * 24); // 24 hours
    });

    it('should set secure=true in production', async () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      const prodSessionCookie = await import('@/utils/auth/sessionCookie');

      const sessionData = { id: 'user123' };
      const cookies = prodSessionCookie.createSessionCookie(sessionData);
      const cookie = cookies[0];

      expect(cookie.secure).toBe(true);
    });

    it('should set secure=false in development', () => {
      const sessionData = { id: 'user123' };
      const cookies = sessionCookie.createSessionCookie(sessionData);
      const cookie = cookies[0];

      expect(cookie.secure).toBe(false);
    });
  });

  describe('createDestroySessionCookie', () => {
    beforeEach(async () => {
      sessionCookie = await import('@/utils/auth/sessionCookie');
    });

    it('should return cookie config for clearing session', () => {
      const cookie = sessionCookie.createDestroySessionCookie();

      expect(cookie.name).toBe('user_session');
      expect(cookie.value).toBe('');
      expect(cookie.maxAge).toBe(0);
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe('strict');
      expect(cookie.path).toBe('/');
    });
  });

  describe('getSessionFromCookies', () => {
    beforeEach(async () => {
      sessionCookie = await import('@/utils/auth/sessionCookie');
    });

    it('should return null if no session cookie exists', () => {
      const mockCookieStore = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const result = sessionCookie.getSessionFromCookies(mockCookieStore);

      expect(result).toBeNull();
      expect(mockCookieStore.get).toHaveBeenCalledWith('user_session');
    });

    it('should return session data from valid JWT cookie', () => {
      const sessionData = { id: 'user123', email: 'test@example.com' };
      const token = sessionCookie.createSessionToken(sessionData);

      const mockCookieStore = {
        get: jest.fn().mockReturnValue({ value: token }),
      };

      const result = sessionCookie.getSessionFromCookies(mockCookieStore);

      expect(result).toBeDefined();
      expect(result.id).toBe(sessionData.id);
      expect(result.email).toBe(sessionData.email);
    });

    it('should handle legacy JSON cookie format (migration support)', () => {
      const legacySessionData = { id: 'legacy-user', email: 'legacy@test.com' };
      const legacyToken = JSON.stringify(legacySessionData);

      const mockCookieStore = {
        get: jest.fn().mockReturnValue({ value: legacyToken }),
      };

      const result = sessionCookie.getSessionFromCookies(mockCookieStore);

      expect(result).toBeDefined();
      expect(result.id).toBe(legacySessionData.id);
      expect(result.email).toBe(legacySessionData.email);
    });

    it('should return null for invalid cookie value', () => {
      const mockCookieStore = {
        get: jest.fn().mockReturnValue({ value: 'invalid-not-jwt-not-json' }),
      };

      const result = sessionCookie.getSessionFromCookies(mockCookieStore);

      expect(result).toBeNull();
    });

    it('should decode base64-encoded JWT cookies', () => {
      const sessionData = { id: 'user123', email: 'test@example.com' };
      const token = sessionCookie.createSessionToken(sessionData);
      const encoded = Buffer.from(token, 'utf8').toString('base64');

      const mockCookieStore = {
        get: jest.fn().mockReturnValue({ value: encoded }),
      };

      const result = sessionCookie.getSessionFromCookies(mockCookieStore);

      expect(result).toBeDefined();
      expect(result.id).toBe(sessionData.id);
      expect(result.email).toBe(sessionData.email);
    });

    it('should decode compound base64 header-payload cookies', () => {
      const sessionData = { id: 'user123', email: 'test@example.com' };
      const token = sessionCookie.createSessionToken(sessionData);
      const [header, payload, signature] = token.split('.');
      const encodedLeft = Buffer.from(`${header}.${payload}`, 'utf8').toString('base64');
      const compound = `${encodedLeft}.${signature}`;

      const mockCookieStore = {
        get: jest.fn().mockReturnValue({ value: compound }),
      };

      const result = sessionCookie.getSessionFromCookies(mockCookieStore);

      expect(result).toBeDefined();
      expect(result.id).toBe(sessionData.id);
      expect(result.email).toBe(sessionData.email);
    });

    it('should rebuild session from multiple cookies with the same name', () => {
      const sessionData = { id: 'user123', email: 'test@example.com' };
      const token = sessionCookie.createSessionToken(sessionData);
      const splitIndex = Math.floor(token.length / 2);
      const parts = [token.slice(0, splitIndex), token.slice(splitIndex)];

      const mockCookieStore = {
        get: jest.fn().mockReturnValue(undefined),
        getAll: jest.fn().mockReturnValue([
          { name: 'user_session', value: parts[0] },
          { name: 'user_session', value: parts[1] },
        ]),
      };

      const result = sessionCookie.getSessionFromCookies(mockCookieStore);

      expect(result).toBeDefined();
      expect(result.id).toBe(sessionData.id);
      expect(result.email).toBe(sessionData.email);
    });

    it('should reconstruct session from chunked cookies', () => {
      const sessionData = { id: 'user123', email: 'test@example.com' };
      const token = sessionCookie.createSessionToken(sessionData);
      const chunked = [
        { name: 'user_session.0', value: token.slice(0, 10) },
        { name: 'user_session.1', value: token.slice(10) },
      ];

      const mockCookieStore = {
        get: jest.fn().mockReturnValue(undefined),
        getAll: jest.fn().mockReturnValue(chunked),
      };

      const result = sessionCookie.getSessionFromCookies(mockCookieStore);

      expect(result).toBeDefined();
      expect(result.id).toBe(sessionData.id);
      expect(result.email).toBe(sessionData.email);
    });
  });

  describe('SESSION_SECRET validation', () => {
    it('should throw error in production if SESSION_SECRET is not set', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SESSION_SECRET;
      jest.resetModules();

      const prodSessionCookie = await import('@/utils/auth/sessionCookie');

      expect(() => {
        prodSessionCookie.createSessionToken({ id: 'user123' });
      }).toThrow('SESSION_SECRET environment variable is required in production');
    });

    it('should throw error if SESSION_SECRET is too short', async () => {
      process.env.SESSION_SECRET = 'short';
      jest.resetModules();

      const shortSecretSessionCookie = await import('@/utils/auth/sessionCookie');

      expect(() => {
        shortSecretSessionCookie.createSessionToken({ id: 'user123' });
      }).toThrow('SESSION_SECRET must be at least 32 characters long');
    });

    it('should use fallback secret in development if not set', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SESSION_SECRET;
      jest.resetModules();

      const devSessionCookie = await import('@/utils/auth/sessionCookie');
      const devLog = (await import('@/utils/dev/logger')).default;

      // Should not throw and should warn
      const token = devSessionCookie.createSessionToken({ id: 'user123' });
      expect(token).toBeDefined();
      expect(devLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('development fallback SESSION_SECRET')
      );
    });
  });
});
