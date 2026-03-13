// Tests for provisioningToken.js
// Jest is the test runner. All crypto and external dependencies are mocked.


// Mock 'jose' to avoid ESM import errors in Jest (only testing pure utils here)
jest.mock('jose', () => ({}));
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
