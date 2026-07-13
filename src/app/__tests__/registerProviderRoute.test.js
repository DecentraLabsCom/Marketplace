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
  verifyProviderRegistrationProof: jest.fn(),
}));

jest.mock('@/utils/blockchain/networkConfig', () => ({
  defaultChain: { id: 11155111, name: 'Sepolia' },
}));

jest.mock('@/utils/intents/intentDomain', () => ({
  getDiamondAddress: jest.fn(() => '0xe49a2f59631717691642f929E0FeF1f705866600'),
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
import { verifyProviderRegistrationProof, verifyProvisioningToken } from '@/utils/auth/provisioningToken';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { headers } from 'next/headers';
import { POST } from '../api/institutions/registerProvider/route.js';

describe('/api/institutions/registerProvider route', () => {
  const walletAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    jest.clearAllMocks();
    verifyProvisioningToken.mockResolvedValue({
      marketplaceBaseUrl: 'https://marketplace.example.com',
      providerName: 'Test Provider',
      providerEmail: 'test@example.com',
      providerCountry: 'ES',
      providerOrganization: 'example.edu',
      publicBaseUrl: 'https://auth.example.com/auth',
      walletAddress,
      chainId: 11155111,
      verifyingContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      registrationNonce: 'registration-nonce-1',
      jti: 'provider-token-1',
    });
    verifyProviderRegistrationProof.mockImplementation(({ payload, walletAddress: requestedWallet }) => {
      if (payload.walletAddress.toLowerCase() !== requestedWallet.toLowerCase()) {
        throw new Error('Institutional wallet does not match the provisioning token');
      }
      return true;
    });

    getContractInstance.mockImplementation((_contractType = 'diamond', _readOnly = true) =>
      Promise.resolve({
        isLabProvider: jest.fn().mockResolvedValue(false),
        resolveSchacHomeOrganization: jest.fn().mockResolvedValue(null),
        isProviderProvisioningTokenConsumed: jest.fn().mockResolvedValue(false),
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

  test('executes atomic provider institution registration with server signer', async () => {
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const organization = 'Example.EDU';
    verifyProvisioningToken.mockResolvedValue({
      marketplaceBaseUrl: 'https://marketplace.example.com',
      providerName: 'Test Provider',
      providerEmail: 'test@example.com',
      providerCountry: 'ES',
      providerOrganization: organization,
      publicBaseUrl: 'https://auth.example.com/auth',
      walletAddress,
      chainId: 11155111,
      verifyingContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      registrationNonce: 'registration-nonce-2',
      jti: 'provider-token-2',
    });

    const registrationTx = {
      hash: '0xregistrationhash',
      wait: jest.fn().mockResolvedValue({ hash: '0xregistrationhash' }),
    };

    const readContract = {
      isLabProvider: jest.fn().mockResolvedValue(false),
      resolveSchacHomeOrganization: jest.fn().mockRejectedValue(new Error('Organization not found')),
      getSchacHomeOrganizationBackend: jest.fn().mockResolvedValue(null),
      isProviderProvisioningTokenConsumed: jest.fn().mockResolvedValue(false),
    };

    const writeContract = {
      registerProviderInstitution: jest.fn().mockResolvedValue(registrationTx),
    };

    getContractInstance.mockImplementation((_contractType = 'diamond', readOnly = true) =>
      Promise.resolve(readOnly ? readContract : writeContract)
    );

    const req = new Request('http://localhost/api/institutions/registerProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, walletSignature: '0xwalletsignature' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      walletAddress,
      organization: 'example.edu',
      backendUrl: 'https://auth.example.com',
      txHashes: ['0xregistrationhash'],
    });

    expect(verifyProviderRegistrationProof).toHaveBeenCalledWith(expect.objectContaining({
      walletAddress,
      walletSignature: '0xwalletsignature',
    }));
    expect(writeContract.registerProviderInstitution).toHaveBeenCalledWith(
      walletAddress,
      'Test Provider',
      'test@example.com',
      'ES',
      'example.edu',
      'https://auth.example.com/auth',
      'https://auth.example.com',
      expect.stringMatching(/^0x[a-fA-F0-9]{64}$/),
    );
  });

  test('rejects a body wallet that differs from the signed token wallet', async () => {
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: '0x9999999999999999999999999999999999999999',
        walletSignature: '0xwalletsignature',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/wallet/i) });
    expect(getContractInstance).not.toHaveBeenCalled();
  });
});
