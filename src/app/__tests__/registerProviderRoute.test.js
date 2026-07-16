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
    startOrResumeProvisioningSaga: jest.fn(),
    advanceProvisioningSaga: jest.fn(),
    PROVISIONING_SAGA_STAGES: {
      WALLET_VERIFIED: 'WALLET_VERIFIED',
      PROVIDER_ADDED: 'PROVIDER_ADDED',
      INSTITUTION_ROLE_GRANTED: 'INSTITUTION_ROLE_GRANTED',
      BACKEND_REGISTERED: 'BACKEND_REGISTERED',
      ACTIVE: 'ACTIVE',
    },
  };
});

jest.mock('@/utils/intents/intentNonceStore', () => {
  class IntentSignerBusyError extends Error {}
  class IntentSignerUnavailableError extends Error {}
  return {
    IntentSignerBusyError,
    IntentSignerUnavailableError,
    getServerSignerAddress: jest.fn(() => '0x00000000000000000000000000000000000000a1'),
    withIntentSignerLock: jest.fn((_signer, callback) => callback({
      fencingToken: 7,
      assertActive: jest.fn(),
    })),
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
import {
  recoverProvisioningWalletAddress,
  validateProvisioningClaims,
} from '@/utils/auth/provisioningTypedData';
import {
  startOrResumeProvisioningSaga,
  advanceProvisioningSaga,
} from '@/utils/auth/provisioningReplayStore';
import { getServerSignerAddress, withIntentSignerLock } from '@/utils/intents/intentNonceStore';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { headers } from 'next/headers';
import { POST } from '../api/institutions/registerProvider/route.js';

describe('/api/institutions/registerProvider route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyProvisioningToken.mockResolvedValue({
      marketplaceBaseUrl: 'https://marketplace.example.com',
      institutionId: 'example.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
      canonicalBackendOrigin: 'https://auth.example.com',
      registrationType: 'provider',
      chainId: 11155111,
      registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      jti: 'provider-jti',
      nonce: `0x${'11'.repeat(32)}`,
      issuedAt: 1700000000,
      expiresAt: 1700000300,
      providerName: 'Test Provider',
      providerEmail: 'test@example.com',
      providerCountry: 'ES',
    });
    recoverProvisioningWalletAddress.mockImplementation((_payload, signature) => {
      if (!signature) throw new Error('Wallet signature is required');
      return '0x1234567890123456789012345678901234567890';
    });
    startOrResumeProvisioningSaga.mockResolvedValue({
      resumed: false,
      record: { jti: 'provider-jti', stage: 'WALLET_VERIFIED' },
    });
    advanceProvisioningSaga.mockResolvedValue({});

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

  test('returns 401 when the institutional wallet signature is missing', async () => {
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
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid institutional wallet proof',
    });
  });

  test('rejects a signature recovered from a different wallet', async () => {
    recoverProvisioningWalletAddress.mockReturnValue(
      '0x9999999999999999999999999999999999999999'
    );
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletSignature: `0x${'22'.repeat(65)}` }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(getContractInstance).not.toHaveBeenCalled();
    expect(startOrResumeProvisioningSaga).not.toHaveBeenCalled();
  });

  test('returns 400 when provider name is missing in token', async () => {
    verifyProvisioningToken.mockResolvedValue({
      marketplaceBaseUrl: 'https://marketplace.example.com',
      providerEmail: 'test@example.com',
      providerCountry: 'ES',
      institutionId: 'example.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
      canonicalBackendOrigin: 'https://auth.example.com',
      registrationType: 'provider',
      chainId: 11155111,
      registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      jti: 'provider-jti',
      nonce: `0x${'11'.repeat(32)}`,
      issuedAt: 1700000000,
      expiresAt: 1700000300,
    });
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletSignature: `0x${'22'.repeat(65)}`,
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
    verifyProvisioningToken.mockResolvedValue({
      marketplaceBaseUrl: 'https://marketplace.example.com',
      institutionId: 'Example.EDU',
      walletAddress,
      canonicalBackendOrigin: 'https://auth.example.com',
      registrationType: 'provider',
      chainId: 11155111,
      registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      jti: 'provider-jti',
      nonce: `0x${'11'.repeat(32)}`,
      issuedAt: 1700000000,
      expiresAt: 1700000300,
      providerName: 'Test Provider',
      providerEmail: 'test@example.com',
      providerCountry: 'ES',
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
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x0000000000000000000000000000000000000000'),
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
      body: JSON.stringify({
        walletAddress: '0x9999999999999999999999999999999999999999',
        walletSignature: `0x${'22'.repeat(65)}`,
      }),
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
    expect(validateProvisioningClaims).toHaveBeenCalledWith(
      expect.any(Object),
      {
        registrationType: 'provider',
        chainId: 11155111,
        registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      }
    );
    expect(startOrResumeProvisioningSaga).toHaveBeenCalledWith(
      expect.objectContaining({ jti: 'provider-jti', walletAddress })
    );
    expect(getServerSignerAddress).toHaveBeenCalled();
    expect(withIntentSignerLock).toHaveBeenCalledWith(
      '0x00000000000000000000000000000000000000a1',
      expect.any(Function),
      expect.objectContaining({ waitMs: expect.any(Number) }),
    );
    expect(withIntentSignerLock.mock.invocationCallOrder[0]).toBeLessThan(
      writeContract.addProvider.mock.invocationCallOrder[0]
    );
    expect(advanceProvisioningSaga).toHaveBeenCalledWith('provider-jti', expect.objectContaining({
      stage: 'PROVIDER_ADDED',
      txHashes: ['0xaddproviderhash'],
      fencingToken: 7,
    }));
    expect(advanceProvisioningSaga).toHaveBeenLastCalledWith('provider-jti', expect.objectContaining({
      stage: 'ACTIVE',
      txHashes: ['0xaddproviderhash', '0xgrantrolehash', '0xbackendhash'],
    }));
  });

  test('reconciles a resumed saga and submits only the missing provider writes', async () => {
    const mockHeaders = new Map([['authorization', 'Bearer test-token']]);
    headers.mockResolvedValue(mockHeaders);
    startOrResumeProvisioningSaga.mockResolvedValue({
      resumed: true,
      record: { jti: 'provider-jti', stage: 'PROVIDER_ADDED' },
    });

    const grantRoleTx = {
      hash: '0xgrantrolehash',
      wait: jest.fn().mockResolvedValue({ hash: '0xgrantrolehash' }),
    };
    const backendTx = {
      hash: '0xbackendhash',
      wait: jest.fn().mockResolvedValue({ hash: '0xbackendhash' }),
    };
    const writeContract = {
      addProvider: jest.fn(),
      grantInstitutionRole: jest.fn().mockResolvedValue(grantRoleTx),
      adminSetSchacHomeOrganizationBackend: jest.fn().mockResolvedValue(backendTx),
    };
    const readContract = {
      isLabProvider: jest.fn().mockResolvedValue(true),
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x0000000000000000000000000000000000000000'),
      getSchacHomeOrganizationBackend: jest.fn().mockResolvedValue(''),
    };
    getContractInstance.mockImplementation((_contractType = 'diamond', readOnly = true) =>
      Promise.resolve(readOnly ? readContract : writeContract)
    );

    const req = new Request('http://localhost/api/institutions/registerProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletSignature: `0x${'22'.repeat(65)}` }),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(writeContract.addProvider).not.toHaveBeenCalled();
    expect(writeContract.grantInstitutionRole).toHaveBeenCalled();
    expect(writeContract.adminSetSchacHomeOrganizationBackend).toHaveBeenCalled();
    expect(advanceProvisioningSaga).toHaveBeenCalledWith('provider-jti', expect.objectContaining({
      stage: 'INSTITUTION_ROLE_GRANTED',
      txHashes: ['0xgrantrolehash'],
    }));
  });
});
