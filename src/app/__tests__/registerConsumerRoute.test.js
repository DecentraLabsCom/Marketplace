/**
 * @jest-environment node
 */

// Mock modules before importing anything
jest.mock('@/utils/auth/guards', () => {
  class HttpError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
      this.name = 'HttpError';
    }
  }

  class ForbiddenError extends HttpError {
    constructor(message = 'Access denied') {
      super(403, message);
      this.name = 'ForbiddenError';
    }
  }

  return {
    requireAuth: jest.fn(),
    HttpError,
    ForbiddenError,
  };
});

jest.mock('@/utils/auth/provisioningToken', () => ({
  __esModule: true,
  extractBearerToken: jest.fn((header) => {
    if (!header) {
      return null;
    }
    return header.replace(/^Bearer\s+/i, '').trim();
  }),
  normalizeHttpsUrl: jest.fn((url) => {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('URL is required');
    }
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      throw new Error('URL must use http:// or https://');
    }
    return url;
  }),
  requireString: jest.fn((value, label) => {
    if (!value || typeof value !== 'string' || !value.trim()) {
      throw new Error(`${label} is required`);
    }
    return value.trim();
  }),
  verifyProvisioningToken: jest.fn(),
}));

jest.mock('@/utils/auth/provisioningTypedData', () => ({
  PROVISIONING_REGISTRATION_TYPES: { PROVIDER: 'provider', CONSUMER: 'consumer' },
  getProvisioningRegistryConfig: jest.fn(() => ({
    chainId: 11155111,
    registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
  })),
  recoverProvisioningWalletAddress: jest.fn(),
  validateProvisioningClaims: jest.fn((payload) => payload),
}));

jest.mock('@/utils/auth/provisioningReplayStore', () => {
  class ProvisioningReplayError extends Error {}
  return {
    ProvisioningReplayError,
    consumeProvisioningJti: jest.fn(),
    updateProvisioningAudit: jest.fn(),
  };
});

jest.mock('@/utils/auth/marketplaceJwt', () => ({
  __esModule: true,
  default: {
    normalizeOrganizationDomain: jest.fn((domain) => domain.toLowerCase()),
  },
}));

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}));

// Now import after mocks are set up
import { verifyProvisioningToken } from '@/utils/auth/provisioningToken';
import { recoverProvisioningWalletAddress } from '@/utils/auth/provisioningTypedData';
import {
  consumeProvisioningJti,
  updateProvisioningAudit,
} from '@/utils/auth/provisioningReplayStore';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { headers } from 'next/headers';
import { POST } from '../api/institutions/registerConsumer/route.js';

describe('/api/institutions/registerConsumer route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyProvisioningToken.mockResolvedValue({
      registrationType: 'consumer',
      marketplaceBaseUrl: 'https://marketplace.example.com',
      consumerName: 'Consumer University',
      institutionId: 'example.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
      canonicalBackendOrigin: 'https://auth.example.com',
      chainId: 11155111,
      registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      jti: 'consumer-jti',
      nonce: `0x${'11'.repeat(32)}`,
      issuedAt: 1700000000,
      expiresAt: 1700000300,
    });
    recoverProvisioningWalletAddress.mockImplementation((_payload, signature) => {
      if (!signature) throw new Error('Wallet signature is required');
      return '0x1234567890123456789012345678901234567890';
    });
    consumeProvisioningJti.mockResolvedValue('provisioning:jti:consumer-jti');

    getContractInstance.mockImplementation((_contractType = 'diamond', _readOnly = true) =>
      Promise.resolve({
        resolveSchacHomeOrganization: jest.fn().mockResolvedValue(null),
      })
    );
  });

  test('returns 401 when provisioning token is missing', async () => {
    const mockHeaders = new Map();
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: '0x1234567890123456789012345678901234567890',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    });
  });

  test('returns 401 when provisioning token is invalid', async () => {
    verifyProvisioningToken.mockRejectedValue(new Error('Invalid token'));
    const mockHeaders = new Map([['authorization', 'Bearer invalid-token']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: '0x1234567890123456789012345678901234567890',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    });
  });

  test('returns 401 when wallet signature is missing', async () => {
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: '0x1234567890123456789012345678901234567890',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid institutional wallet proof',
    });
  });

  test('returns 400 when organization is missing in token', async () => {
    verifyProvisioningToken.mockResolvedValue({
      registrationType: 'consumer',
      marketplaceBaseUrl: 'https://marketplace.example.com',
      consumerName: 'Consumer University',
      walletAddress: '0x1234567890123456789012345678901234567890',
      canonicalBackendOrigin: 'https://auth.example.com',
      chainId: 11155111,
      registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      jti: 'consumer-jti',
      nonce: `0x${'11'.repeat(32)}`,
      issuedAt: 1700000000,
      expiresAt: 1700000300,
    });
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletSignature: `0x${'22'.repeat(65)}`,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Organization (schacHomeOrganization) is required',
    });
  });

  test('executes grantInstitutionRole with server signer', async () => {
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const walletAddress = '0x1234567890123456789012345678901234567890';
    verifyProvisioningToken.mockResolvedValue({
      registrationType: 'consumer',
      marketplaceBaseUrl: 'https://marketplace.example.com',
      consumerName: 'Consumer University',
      institutionId: 'Example.EDU',
      walletAddress,
      canonicalBackendOrigin: 'https://auth.example.com',
      chainId: 11155111,
      registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      jti: 'consumer-jti',
      nonce: `0x${'11'.repeat(32)}`,
      issuedAt: 1700000000,
      expiresAt: 1700000300,
    });

    const grantRoleTx = {
      hash: '0xgrantrolehash',
      wait: jest.fn().mockResolvedValue({ hash: '0xgrantrolehash' }),
    };

    const readContract = {
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue(null),
    };

    const writeContract = {
      grantInstitutionRole: jest.fn().mockResolvedValue(grantRoleTx),
      adminSetSchacHomeOrganizationBackend: jest.fn().mockResolvedValue({
        hash: '0xbackendhash',
        wait: jest.fn().mockResolvedValue({ hash: '0xbackendhash' }),
      }),
    };

    getContractInstance.mockImplementation((_contractType = 'diamond', readOnly = true) =>
      Promise.resolve(readOnly ? readContract : writeContract)
    );

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        backendUrl: 'https://attacker.example',
        walletSignature: `0x${'22'.repeat(65)}`,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      walletAddress,
      organization: 'example.edu',
      grantRoleTxHash: '0xgrantrolehash',
      backendUrl: 'https://auth.example.com',
    });

    expect(writeContract.grantInstitutionRole).toHaveBeenCalledWith(walletAddress, 'example.edu');
    expect(writeContract.adminSetSchacHomeOrganizationBackend).toHaveBeenCalledWith(
      walletAddress,
      'example.edu',
      'https://auth.example.com',
    );
    expect(consumeProvisioningJti).toHaveBeenCalledWith(
      expect.objectContaining({ jti: 'consumer-jti', walletAddress })
    );
    expect(updateProvisioningAudit).toHaveBeenCalledWith('consumer-jti', {
      status: 'in-progress',
      txHashes: ['0xgrantrolehash'],
    });
    expect(updateProvisioningAudit).toHaveBeenLastCalledWith('consumer-jti', {
      status: 'registered',
      txHashes: ['0xgrantrolehash', '0xbackendhash'],
    });
    expect(consumeProvisioningJti.mock.invocationCallOrder[0]).toBeLessThan(
      writeContract.grantInstitutionRole.mock.invocationCallOrder[0]
    );
  });
});
