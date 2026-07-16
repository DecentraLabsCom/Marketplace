/**
 * @jest-environment node
 */

import { TypedDataEncoder, Wallet } from 'ethers';
import {
  PROVISIONING_REGISTRATION_TYPES,
  buildProvisioningTypedData,
  normalizeBackendOrigin,
  normalizeWalletAddress,
  recoverProvisioningWalletAddress,
  validateProvisioningClaims,
} from '../provisioningTypedData';

const wallet = new Wallet(
  '0x0123456789012345678901234567890123456789012345678901234567890123'
);

const claims = {
  institutionId: 'example.edu',
  walletAddress: wallet.address,
  canonicalBackendOrigin: 'https://gateway.example.edu',
  registrationType: PROVISIONING_REGISTRATION_TYPES.PROVIDER,
  chainId: 11155111,
  registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
  jti: 'jti-1',
  nonce: '0x1111111111111111111111111111111111111111111111111111111111111111',
  issuedAt: 1_700_000_000,
  expiresAt: 1_700_000_300,
  iat: 1_700_000_000,
  exp: 1_700_000_300,
};

describe('institution provisioning EIP-712 payload', () => {
  test('matches the cross-runtime EIP-712 digest', () => {
    const typedData = buildProvisioningTypedData(claims);

    expect(TypedDataEncoder.hash(
      typedData.domain,
      typedData.types,
      typedData.message
    )).toBe('0xda82840f3b973137c22759c232b6871815858b08be099be0765a901d3e3e6365');
  });

  test('recovers the institutional wallet that signed the exact claims', async () => {
    const typedData = buildProvisioningTypedData(claims);
    const signature = await wallet.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message
    );

    expect(recoverProvisioningWalletAddress(claims, signature)).toBe(wallet.address);
  });

  test('a changed backend origin does not recover the expected wallet', async () => {
    const typedData = buildProvisioningTypedData(claims);
    const signature = await wallet.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message
    );

    const recovered = recoverProvisioningWalletAddress(
      { ...claims, canonicalBackendOrigin: 'https://attacker.example' },
      signature
    );

    expect(recovered).not.toBe(wallet.address);
  });

  test('rejects claims whose custom and JWT timestamps diverge', () => {
    expect(() => validateProvisioningClaims({ ...claims, exp: claims.exp + 1 })).toThrow(
      'expiresAt must match JWT exp'
    );
  });

  test('rejects a token bound to a different chain or registry', () => {
    expect(() =>
      validateProvisioningClaims(claims, {
        chainId: 1,
        registryContract: claims.registryContract,
      })
    ).toThrow('chainId does not match');

    expect(() =>
      validateProvisioningClaims(claims, {
        chainId: claims.chainId,
        registryContract: '0x9999999999999999999999999999999999999999',
      })
    ).toThrow('registryContract does not match');
  });

  test('normalizes wallet addresses to checksum format', () => {
    expect(normalizeWalletAddress(wallet.address.toLowerCase())).toBe(wallet.address);
  });

  test('accepts only a canonical backend origin without path, query or fragment', () => {
    expect(normalizeBackendOrigin('gateway.example.edu')).toBe('https://gateway.example.edu');
    expect(() => normalizeBackendOrigin('https://gateway.example.edu/api')).toThrow(
      'must be an origin without a path'
    );
    expect(() => normalizeBackendOrigin('https://gateway.example.edu/?tenant=1')).toThrow(
      'must not include query parameters or fragments'
    );
  });
});
