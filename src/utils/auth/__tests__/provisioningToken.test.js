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

import { Wallet } from 'ethers';
import {
  buildProviderRegistrationChallenge,
  normalizeHttpsUrl,
  verifyProviderRegistrationProof,
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

  test('rejects remote HTTP URLs', () => {
    expect(() => normalizeHttpsUrl('http://provider.example.com', 'Public base URL')).toThrow(
      'must use HTTPS'
    );
  });
});

describe('provider registration wallet proof', () => {
  const wallet = new Wallet('0x' + '1'.repeat(64));
  const payload = {
    jti: 'provider-token-1',
    registrationNonce: 'registration-nonce-1',
    walletAddress: wallet.address,
    providerOrganization: 'example.edu',
    publicBaseUrl: 'https://gateway.example.edu',
    chainId: 11155111,
    verifyingContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
  };

  test('accepts a signature from the wallet bound into the token', async () => {
    const walletSignature = await wallet.signMessage(buildProviderRegistrationChallenge(payload));

    expect(verifyProviderRegistrationProof({
      payload,
      walletAddress: wallet.address,
      walletSignature,
    })).toBe(true);
  });

  test('rejects a different wallet even when it provides a valid signature', async () => {
    const attacker = Wallet.createRandom();
    const walletSignature = await attacker.signMessage(buildProviderRegistrationChallenge({
      ...payload,
      walletAddress: attacker.address,
    }));

    expect(() => verifyProviderRegistrationProof({
      payload,
      walletAddress: attacker.address,
      walletSignature,
    })).toThrow('does not match');
  });
});
