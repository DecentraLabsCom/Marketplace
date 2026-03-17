var mockGetPrivateKeyPem = jest.fn(async () => 'mockPrivateKeyPem');
// Move mock declaration above jest.mock
jest.mock('../marketplaceJwt', () => ({
  __esModule: true,
  default: {
    async getPrivateKeyPem() {
      return await mockGetPrivateKeyPem();
    }
  },
  getPrivateKeyPem: mockGetPrivateKeyPem,
}));
// Tests for provisioningToken.js
// Jest is the test runner. All crypto and external dependencies are mocked.


// Mock 'jose' to avoid ESM import errors in Jest (only testing pure utils here)
jest.mock('jose', () => ({
  SignJWT: jest.fn().mockImplementation(function (claims) {
    this.claims = claims;
    this.header = {};
    this.issuedAt = null;
    this.exp = null;
    this.issuer = null;
    this.audience = null;
    this.jti = null;
    return this;
  }),
  importPKCS8: jest.fn(async () => 'mockPrivateKey'),
  importSPKI: jest.fn(async () => 'mockPublicKey'),
  exportJWK: jest.fn(async () => ({ kty: 'RSA', n: 'mockN', e: 'mockE' })),
  calculateJwkThumbprint: jest.fn(async () => 'mockThumbprint'),
  decodeJwt: jest.fn((token) => ({ aud: 'https://audience.com', publicBaseUrl: 'https://audience.com', marketplaceBaseUrl: 'https://issuer.com' })),
  importJWK: jest.fn(async () => 'mockPublicKey'),
  jwtVerify: jest.fn(async () => ({ payload: { marketplaceBaseUrl: 'https://issuer.com', publicBaseUrl: 'https://audience.com', aud: ['https://audience.com'] } })),
}));

jest.mock('crypto', () => ({
  createPublicKey: jest.fn(() => ({
    export: jest.fn(() => ({ toString: () => 'mockPublicKeyPem' }))
  })),
  randomUUID: jest.fn(() => 'mock-jti'),
}));



let provisioningToken;
beforeAll(async () => {
  provisioningToken = await import('../provisioningToken');
});
  describe('getKeyMaterial', () => {
    it('returns cached keys after first call', async () => {
      const keys1 = await provisioningToken.__getKeyMaterial?.() || await provisioningToken.getProvisioningJwks();
      const keys2 = await provisioningToken.__getKeyMaterial?.() || await provisioningToken.getProvisioningJwks();
      expect(keys1).toEqual(keys2);
    });
  });

  describe('getProvisioningJwks', () => {
    it('returns JWKS with expected structure', async () => {
      const jwks = await provisioningToken.getProvisioningJwks();
      expect(jwks).toHaveProperty('keys');
      expect(jwks.keys[0]).toHaveProperty('kty', 'RSA');
      expect(jwks.keys[0]).toHaveProperty('kid', 'mockThumbprint');
    });
  });

  describe('signProvisioningToken', () => {
    it('returns token, expiresAt, and kid', async () => {
      // Mock SignJWT chain
      const mockSign = jest.fn(async () => 'mockToken');
      const SignJWT = provisioningToken.SignJWT || require('jose').SignJWT;
      SignJWT.prototype.setProtectedHeader = function (header) { this.header = header; return this; };
      SignJWT.prototype.setIssuedAt = function (iat) { this.issuedAt = iat; return this; };
      SignJWT.prototype.setExpirationTime = function (exp) { this.exp = exp; return this; };
      SignJWT.prototype.setIssuer = function (issuer) { this.issuer = issuer; return this; };
      SignJWT.prototype.setAudience = function (aud) { this.audience = aud; return this; };
      SignJWT.prototype.setJti = function (jti) { this.jti = jti; return this; };
      SignJWT.prototype.sign = mockSign;

      const result = await provisioningToken.signProvisioningToken({ foo: 'bar' });
      expect(result).toHaveProperty('token', 'mockToken');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('kid', 'mockThumbprint');
    });
  });

  describe('verifyProvisioningToken', () => {
    it('verifies token and returns payload', async () => {
      const payload = await provisioningToken.verifyProvisioningToken('mockToken', { issuer: 'https://issuer.com' });
      expect(payload).toHaveProperty('marketplaceBaseUrl', 'https://issuer.com');
      expect(payload).toHaveProperty('publicBaseUrl', 'https://audience.com');
    });
    it('throws if token is missing', async () => {
      await expect(provisioningToken.verifyProvisioningToken('', { issuer: 'https://issuer.com' })).rejects.toThrow('Provisioning token is required');
    });
    it('throws if issuer mismatch', async () => {
      // Patch decodeJwt and jwtVerify to return mismatched issuer
      const origDecodeJwt = require('jose').decodeJwt;
      const origJwtVerify = require('jose').jwtVerify;
      require('jose').decodeJwt = jest.fn(() => ({ aud: 'https://audience.com', publicBaseUrl: 'https://audience.com', marketplaceBaseUrl: 'https://wrong.com' }));
      require('jose').jwtVerify = jest.fn(async () => ({ payload: { marketplaceBaseUrl: 'https://wrong.com', publicBaseUrl: 'https://audience.com', aud: ['https://audience.com'] } }));
      await expect(provisioningToken.verifyProvisioningToken('mockToken', { issuer: 'https://issuer.com' })).rejects.toThrow('Marketplace base URL mismatch');
      require('jose').decodeJwt = origDecodeJwt;
      require('jose').jwtVerify = origJwtVerify;
    });
    it('throws if audience mismatch', async () => {
      // Patch jwtVerify to return wrong audience
      const origJwtVerify = require('jose').jwtVerify;
      require('jose').jwtVerify = jest.fn(async () => ({ payload: { marketplaceBaseUrl: 'https://issuer.com', publicBaseUrl: 'https://wrong.com', aud: ['https://audience.com'] } }));
      await expect(provisioningToken.verifyProvisioningToken('mockToken', { issuer: 'https://issuer.com' })).rejects.toThrow('Token audience must match public base URL');
      require('jose').jwtVerify = origJwtVerify;
    });
  });
import * as provisioningToken from '../provisioningToken';

describe('provisioningToken.js', () => {
  describe('normalizeHttpsUrl', () => {
    it('trims and returns valid http/https URLs', () => {
      expect(provisioningToken.normalizeHttpsUrl(' https://example.com/ ', 'Test')).toBe('https://example.com');
      expect(provisioningToken.normalizeHttpsUrl('http://foo.com/', 'Test')).toBe('http://foo.com');
    });
    it('throws if url is missing or not a string', () => {
      expect(() => provisioningToken.normalizeHttpsUrl('', 'Test')).toThrow('Test is required');
      expect(() => provisioningToken.normalizeHttpsUrl(null, 'Test')).toThrow('Test is required');
    });
    it('throws if url is not valid', () => {
      expect(() => provisioningToken.normalizeHttpsUrl('not-a-url', 'Test')).toThrow('Test must be a valid URL');
    });
    it('throws if protocol is not http/https', () => {
      expect(() => provisioningToken.normalizeHttpsUrl('ftp://foo.com', 'Test')).toThrow('Test must start with http:// or https://');
    });
  });

  describe('requireString', () => {
    it('returns trimmed string', () => {
      expect(provisioningToken.requireString(' foo ', 'Label')).toBe('foo');
    });
    it('throws if value is missing or empty', () => {
      expect(() => provisioningToken.requireString('', 'Label')).toThrow('Label is required');
      expect(() => provisioningToken.requireString('   ', 'Label')).toThrow('Label is required');
      expect(() => provisioningToken.requireString(null, 'Label')).toThrow('Label is required');
    });
  });

  describe('requireEmail', () => {
    it('returns valid email', () => {
      expect(provisioningToken.requireEmail('foo@bar.com')).toBe('foo@bar.com');
    });
    it('throws for invalid email', () => {
      expect(() => provisioningToken.requireEmail('not-an-email')).toThrow('Invalid email');
      expect(() => provisioningToken.requireEmail('foo@bar')).toThrow('Invalid email');
    });
    it('throws for missing email', () => {
      expect(() => provisioningToken.requireEmail('', 'Email')).toThrow('Email is required');
    });
  });

  describe('requireApiKey', () => {
    const OLD_ENV = process.env;
    beforeEach(() => { jest.resetModules(); process.env = { ...OLD_ENV }; });
    afterAll(() => { process.env = OLD_ENV; });
    it('returns dev key in dev mode if missing', () => {
      process.env.NODE_ENV = 'development';
      expect(provisioningToken.requireApiKey('')).toBe('dev-only-institutional-services-api-key-32chars');
    });
    it('throws if key is too short', () => {
      process.env.NODE_ENV = 'production';
      expect(() => provisioningToken.requireApiKey('short')).toThrow('API key must be at least 32 characters');
    });
    it('returns trimmed key if valid', () => {
      process.env.NODE_ENV = 'production';
      expect(provisioningToken.requireApiKey(' '.repeat(5) + 'a'.repeat(32) + ' ')).toBe('a'.repeat(32));
    });
  });

  describe('extractBearerToken', () => {
    it('extracts token from Bearer header', () => {
      expect(provisioningToken.extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
      expect(provisioningToken.extractBearerToken('bearer xyz')).toBe('xyz');
    });
    it('returns null if header is missing or not Bearer', () => {
      expect(provisioningToken.extractBearerToken('')).toBeNull();
      expect(provisioningToken.extractBearerToken('Basic foo')).toBeNull();
      expect(provisioningToken.extractBearerToken(null)).toBeNull();
    });
  });
});
