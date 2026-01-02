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
  requireEmail: jest.fn((value, label = 'email') => {
    if (!value || typeof value !== 'string' || !value.includes('@')) {
      throw new Error(`Valid ${label} is required`);
    }
    return value.trim();
  }),
  verifyProvisioningToken: jest.fn(),
}));

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
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { headers } from 'next/headers';
import { POST } from '../api/institutions/registerProvider/route.js';

describe('/api/institutions/registerProvider route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyProvisioningToken.mockResolvedValue({
      marketplaceBaseUrl: 'https://marketplace.example.com',
      providerName: 'Test Provider',
      providerEmail: 'test@example.com',
      providerCountry: 'ES',
      providerOrganization: 'example.edu',
      publicBaseUrl: 'https://auth.example.com/auth',
    });

    getContractInstance.mockImplementation((_contractType = 'diamond', _readOnly = true) =>
      Promise.resolve({
        isLabProvider: jest.fn().mockResolvedValue(false),
        resolveSchacHomeOrganization: jest.fn().mockResolvedValue(null),
      })
    );
  });

  test('returns 401 when provisioning token is missing', async () => {
    const mockHeaders = new Map();
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerProvider', {
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

    const req = new Request('http://localhost/api/institutions/registerProvider', {
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

  test('returns 400 when wallet address is invalid', async () => {
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: 'invalid-address',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid wallet address format',
    });
  });

  test('returns 400 when provider name is missing in token', async () => {
    verifyProvisioningToken.mockResolvedValue({
      marketplaceBaseUrl: 'https://marketplace.example.com',
      providerEmail: 'test@example.com',
      providerCountry: 'ES',
      providerOrganization: 'example.edu',
      publicBaseUrl: 'https://auth.example.com/auth',
    });
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: '0x1234567890123456789012345678901234567890',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Provider name is required',
    });
  });

  test('executes addProvider and grantInstitutionRole with server signer', async () => {
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const walletAddress = '0x1234567890123456789012345678901234567890';
    const organization = 'Example.EDU';
    verifyProvisioningToken.mockResolvedValue({
      marketplaceBaseUrl: 'https://marketplace.example.com',
      providerName: 'Test Provider',
      providerEmail: 'test@example.com',
      providerCountry: 'ES',
      providerOrganization: organization,
      publicBaseUrl: 'https://auth.example.com/auth',
    });

    const addProviderTx = {
      hash: '0xaddproviderhash',
      wait: jest.fn().mockResolvedValue({ hash: '0xaddproviderhash' }),
    };

    const grantRoleTx = {
      hash: '0xgrantrolehash',
      wait: jest.fn().mockResolvedValue({ hash: '0xgrantrolehash' }),
    };

    const backendTx = {
      hash: '0xbackendhash',
      wait: jest.fn().mockResolvedValue({ hash: '0xbackendhash' }),
    };

    const readContract = {
      isLabProvider: jest.fn().mockResolvedValue(false),
      resolveSchacHomeOrganization: jest.fn().mockRejectedValue(new Error('Organization not found')),
      getSchacHomeOrganizationBackend: jest.fn().mockResolvedValue(null),
    };

    const writeContract = {
      addProvider: jest.fn().mockResolvedValue(addProviderTx),
      grantInstitutionRole: jest.fn().mockResolvedValue(grantRoleTx),
      adminSetSchacHomeOrganizationBackend: jest.fn().mockResolvedValue(backendTx),
    };

    getContractInstance.mockImplementation((_contractType = 'diamond', readOnly = true) =>
      Promise.resolve(readOnly ? readContract : writeContract)
    );

    const req = new Request('http://localhost/api/institutions/registerProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      walletAddress,
      organization: 'example.edu',
      backendUrl: 'https://auth.example.com',
      txHashes: ['0xaddproviderhash', '0xgrantrolehash', '0xbackendhash'],
    });

    expect(writeContract.addProvider).toHaveBeenCalledWith(
      'Test Provider',
      walletAddress,
      'test@example.com',
      'ES',
      'https://auth.example.com/auth'
    );
    expect(writeContract.grantInstitutionRole).toHaveBeenCalledWith(walletAddress, 'example.edu');
    expect(writeContract.adminSetSchacHomeOrganizationBackend).toHaveBeenCalledWith(
      walletAddress,
      'example.edu',
      'https://auth.example.com',
    );
  });
});
