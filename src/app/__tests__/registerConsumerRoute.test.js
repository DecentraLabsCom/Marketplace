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
  signProvisioningToken: jest.fn(),
  normalizeHttpsUrl: jest.fn((url) => {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('URL is required');
    }
    if (!url.startsWith('https://')) {
      throw new Error('URL must use HTTPS protocol');
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
  requireApiKey: jest.fn((value) => {
    if (!value) {
      throw new Error('INSTITUTIONAL_SERVICES_API_KEY environment variable is not configured');
    }
    return value;
  }),
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
import { requireAuth } from '@/utils/auth/guards';
import { signProvisioningToken } from '@/utils/auth/provisioningToken';
import { getContractInstance } from '@/app/api/contract/utils/contractInstance';
import { headers } from 'next/headers';
import { POST } from '../api/institutions/registerConsumer/route.js';

describe('/api/institutions/registerConsumer route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INSTITUTIONAL_SERVICES_API_KEY = 'test-api-key-123';

    getContractInstance.mockImplementation((_contractType = 'diamond', _readOnly = true) =>
      Promise.resolve({
        resolveSchacHomeOrganization: jest.fn().mockResolvedValue(null),
      })
    );
  });

  afterEach(() => {
    delete process.env.INSTITUTIONAL_SERVICES_API_KEY;
  });

  test('returns 401 when API key is missing', async () => {
    // Mock headers to return no x-api-key
    const mockHeaders = new Map();
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: '0x1234567890123459012345678901234567890',
        organization: 'example.edu'
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    });
  });

  test('returns 401 when API key is invalid', async () => {
    // Mock headers to return invalid x-api-key
    const mockHeaders = new Map([['x-api-key', 'invalid-key']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'invalid-key'
      },
      body: JSON.stringify({
        walletAddress: '0x1234567890123456789012345678901234567890',
        organization: 'example.edu'
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Unauthorized',
    });
  });

  test('returns 500 when INSTITUTIONAL_SERVICES_API_KEY is not configured', async () => {
    delete process.env.INSTITUTIONAL_SERVICES_API_KEY;

    // Mock headers to return any key
    const mockHeaders = new Map([['x-api-key', 'any-key']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'any-key'
      },
      body: JSON.stringify({
        walletAddress: '0x1234567890123456789012345678901234567890',
        organization: 'example.edu'
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Server configuration error',
    });
  });

  test('returns 400 when wallet address is invalid', async () => {
    // Mock headers to return valid API key
    const mockHeaders = new Map([['x-api-key', 'test-api-key-123']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-api-key-123'
      },
      body: JSON.stringify({
        walletAddress: 'invalid-address',
        organization: 'example.edu'
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid wallet address format',
    });
  });

  test('returns 400 when organization is missing', async () => {
    // Mock headers to return valid API key
    const mockHeaders = new Map([['x-api-key', 'test-api-key-123']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-api-key-123'
      },
      body: JSON.stringify({
        walletAddress: '0x1234567890123456789012345678901234567890',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Organization (schacHomeOrganization) is required',
    });
  });

  test('returns 400 when organization is empty', async () => {
    // Mock headers to return valid API key
    const mockHeaders = new Map([['x-api-key', 'test-api-key-123']]);
    headers.mockResolvedValue(mockHeaders);

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-api-key-123'
      },
      body: JSON.stringify({
        walletAddress: '0x1234567890123456789012345678901234567890',
        organization: ''
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Organization (schacHomeOrganization) is required',
    });
  });

  test('executes grantInstitutionRole with server signer', async () => {
    const mockHeaders = new Map([['x-api-key', 'test-api-key-123']]);
    headers.mockResolvedValue(mockHeaders);

    const walletAddress = '0x1234567890123456789012345678901234567890';
    const organization = 'Example.EDU';

    const grantRoleTx = {
      hash: '0xgrantrolehash',
      wait: jest.fn().mockResolvedValue({ hash: '0xgrantrolehash' }),
    };

    const readContract = {
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue(null),
    };

    const writeContract = {
      grantInstitutionRole: jest.fn().mockResolvedValue(grantRoleTx),
    };

    getContractInstance.mockImplementation((_contractType = 'diamond', readOnly = true) =>
      Promise.resolve(readOnly ? readContract : writeContract)
    );

    const req = new Request('http://localhost/api/institutions/registerConsumer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-api-key-123',
      },
      body: JSON.stringify({ walletAddress, organization }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      walletAddress,
      organization: 'example.edu',
      grantRoleTxHash: '0xgrantrolehash',
    });

    expect(writeContract.grantInstitutionRole).toHaveBeenCalledWith(walletAddress, 'example.edu');
  });
});
