/**
 * @jest-environment node
 */

jest.mock('jose', () => ({
  SignJWT: jest.fn(),
  importPKCS8: jest.fn(),
  importSPKI: jest.fn(),
  exportJWK: jest.fn(),
  calculateJwkThumbprint: jest.fn(),
  decodeJwt: jest.fn(),
  importJWK: jest.fn(),
  jwtVerify: jest.fn(),
}));

import { normalizeHttpsUrl } from '../provisioningToken';

describe('provisioning token URL normalization', () => {
  test('adds https when public base URL has no scheme', () => {
    expect(normalizeHttpsUrl('sarlab.dia.uned.es', 'Public base URL')).toBe(
      'https://sarlab.dia.uned.es'
    );
  });

  test('collapses duplicate schemes before signing audience', () => {
    expect(normalizeHttpsUrl('https://https://sarlab.dia.uned.es', 'Public base URL')).toBe(
      'https://sarlab.dia.uned.es'
    );
  });

  test('trims trailing slash after normalization', () => {
    expect(normalizeHttpsUrl(' https://sarlab.dia.uned.es/ ', 'Public base URL')).toBe(
      'https://sarlab.dia.uned.es'
    );
  });

  test('rejects invalid URLs after normalization', () => {
    expect(() => normalizeHttpsUrl('not a valid host', 'Public base URL')).toThrow(
      'Public base URL must be a valid URL'
    );
  });
});
