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

import {
  createProvisioningPayload,
  normalizeHttpsUrl,
} from '../provisioningToken';

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

describe('provisioning token security claims', () => {
  test('binds jti, nonce and timestamps into the signed payload', () => {
    const payload = createProvisioningPayload(
      {
        institutionId: 'example.edu',
        walletAddress: '0x1234567890123456789012345678901234567890',
        canonicalBackendOrigin: 'https://gateway.example.edu',
        registrationType: 'provider',
        chainId: 11155111,
        registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      },
      {
        ttlSeconds: 300,
        nowSec: 1_700_000_000,
        jti: 'fixed-jti',
        nonce: '0x1111111111111111111111111111111111111111111111111111111111111111',
      }
    );

    expect(payload).toMatchObject({
      jti: 'fixed-jti',
      nonce: '0x1111111111111111111111111111111111111111111111111111111111111111',
      issuedAt: 1_700_000_000,
      expiresAt: 1_700_000_300,
      iat: 1_700_000_000,
      exp: 1_700_000_300,
    });
  });

  test('security claims cannot be overridden by caller claims', () => {
    const payload = createProvisioningPayload(
      { jti: 'attacker-jti', issuedAt: 1, expiresAt: 2 },
      {
        nowSec: 1_700_000_000,
        ttlSeconds: 300,
        jti: 'server-jti',
        nonce: '0x2222222222222222222222222222222222222222222222222222222222222222',
      }
    );

    expect(payload.jti).toBe('server-jti');
    expect(payload.issuedAt).toBe(1_700_000_000);
    expect(payload.expiresAt).toBe(1_700_000_300);
  });
});
