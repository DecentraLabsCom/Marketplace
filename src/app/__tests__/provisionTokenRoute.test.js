/**
 * @jest-environment node
 */

import { requireAuth } from '@/utils/auth/guards';
import { signProvisioningToken } from '@/utils/auth/provisioningToken';

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
  normalizeHttpsUrl: jest.fn((url, label) => {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error(`${label} is required`);
    }
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      throw new Error(`${label} must use http:// or https://`);
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
}));

jest.mock('@/utils/auth/marketplaceJwt', () => ({
  __esModule: true,
  default: {
    normalizeOrganizationDomain: jest.fn((domain) => domain.toLowerCase()),
  },
}));

jest.mock('@/utils/auth/roleValidation', () => ({
  hasInstitutionRegistrationPrivilege: jest.fn((session = {}) =>
    session.entitlements?.includes('urn:decentralabs:entitlement:institution-admin') ||
    ['faculty', 'staff', 'employee'].some(
      (role) => session.role?.includes(role) || session.scopedRole?.includes(role)
    )
  ),
}));

jest.mock('@/utils/auth/provisioningTypedData', () => ({
  PROVISIONING_REGISTRATION_TYPES: { PROVIDER: 'provider', CONSUMER: 'consumer' },
  getProvisioningRegistryConfig: jest.fn(() => ({
    chainId: 11155111,
    registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
  })),
  normalizeBackendOrigin: jest.fn((value) => {
    if (!value) throw new Error('Canonical backend origin is required');
    if (value.startsWith('http://') && !value.startsWith('http://localhost')) {
      throw new Error('Canonical backend origin must use HTTPS');
    }
    return value.replace(/\/$/, '');
  }),
  normalizeWalletAddress: jest.fn((value) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value || '')) {
      throw new Error('Wallet address must be a valid Ethereum address');
    }
    return value;
  }),
}));

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('/api/institutions/provisionToken route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_BASE_URL = 'https://marketplace.example.com';
    process.env.PROVISIONING_TOKEN_TTL_SECONDS = '300';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.PROVISIONING_TOKEN_TTL_SECONDS;
  });

  test('returns 403 when session is not SSO', async () => {
    requireAuth.mockResolvedValue({
      puc: 'user123',
      // No samlAssertion
    });

    const { POST } = await import('../api/institutions/provisionToken/route.js');

    const req = new Request('http://localhost/api/institutions/provisionToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: 'https://auth.institution.edu',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Provisioning token requires SSO session',
    });
  });

  test('returns 403 when user lacks an institutional registration role', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'user', // Not admin
      scopedRole: 'student',
    });

    const { POST } = await import('../api/institutions/provisionToken/route.js');

    const req = new Request('http://localhost/api/institutions/provisionToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: 'https://auth.institution.edu',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Provisioning token requires an institutional administrator entitlement or a faculty, staff, or employee SSO affiliation',
    });
  });

  test('allows a faculty SSO affiliation without the administrator entitlement', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'faculty',
      affiliation: 'institution.edu',
      name: 'Faculty Member',
      email: 'faculty@institution.edu',
    });
    signProvisioningToken.mockResolvedValue({
      token: 'mock-token',
      expiresAt: new Date().toISOString(),
      payload: {},
    });

    const { POST } = await import('../api/institutions/provisionToken/route.js');
    const res = await POST(new Request('http://localhost/api/institutions/provisionToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: 'https://auth.institution.edu',
        walletAddress: '0x1234567890123456789012345678901234567890',
      }),
    }));

    expect(res.status).toBe(200);
    expect(signProvisioningToken).toHaveBeenCalled();
  });

  test('returns 400 when publicBaseUrl is missing', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      entitlements: ['urn:decentralabs:entitlement:institution-admin'],
      affiliation: 'institution.edu',
      name: 'Test Institution',
      email: 'admin@institution.edu',
    });

    const { POST } = await import('../api/institutions/provisionToken/route.js');

    const req = new Request('http://localhost/api/institutions/provisionToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('successfully generates provisioning token for valid provider request', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      entitlements: ['urn:decentralabs:entitlement:institution-admin'],
      affiliation: 'institution.edu',
      name: 'Test Institution',
      email: 'admin@institution.edu',
      schacHomeOrganization: 'institution.edu',
    });

    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';
    const mockExpiresAt = new Date(Date.now() + 900000).toISOString();

    const signedPayload = {
      institutionId: 'institution.edu',
      walletAddress: '0x1234567890123456789012345678901234567890',
      canonicalBackendOrigin: 'https://auth.institution.edu',
      registrationType: 'provider',
      chainId: 11155111,
      registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
      jti: 'jti-1',
      nonce: `0x${'11'.repeat(32)}`,
      issuedAt: 1700000000,
      expiresAt: 1700000300,
    };
    signProvisioningToken.mockResolvedValue({
      token: mockToken,
      expiresAt: mockExpiresAt,
      payload: signedPayload,
    });

    const { POST } = await import('../api/institutions/provisionToken/route.js');

    const req = new Request('http://localhost/api/institutions/provisionToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: 'https://auth.institution.edu',
        providerCountry: 'ES',
        providerOrganization: 'attacker.example',
        walletAddress: '0x1234567890123456789012345678901234567890',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json).toMatchObject({
      success: true,
      token: mockToken,
      expiresAt: mockExpiresAt,
      lockedFields: expect.arrayContaining([
        'providerName',
        'providerEmail',
        'institutionId',
        'walletAddress',
      ]),
    });

    expect(json.payload).toEqual(signedPayload);

    expect(signProvisioningToken).toHaveBeenCalledWith(
      expect.objectContaining({ institutionId: 'institution.edu' }),
      expect.objectContaining({
        audience: 'https://auth.institution.edu',
        issuer: 'https://marketplace.example.com',
      })
    );
  });

  test('accepts http publicBaseUrl in development', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      entitlements: ['urn:decentralabs:entitlement:institution-admin'],
      affiliation: 'institution.edu',
      schacHomeOrganization: 'institution.edu',
      name: 'Test Institution',
      email: 'admin@institution.edu',
    });

    signProvisioningToken.mockResolvedValue({
      token: 'mock-token',
      expiresAt: new Date().toISOString(),
    });

    const { POST } = await import('../api/institutions/provisionToken/route.js');

    const req = new Request('http://localhost/api/institutions/provisionToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: 'http://auth.institution.edu', // http instead of https
        walletAddress: '0x1234567890123456789012345678901234567890',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('requires the institutional wallet address before issuing a token', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      entitlements: ['urn:decentralabs:entitlement:institution-admin'],
      schacHomeOrganization: 'institution.edu',
      name: 'Test Institution',
      email: 'admin@institution.edu',
    });

    const { POST } = await import('../api/institutions/provisionToken/route.js');
    const req = new Request('http://localhost/api/institutions/provisionToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicBaseUrl: 'https://auth.institution.edu' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(signProvisioningToken).not.toHaveBeenCalled();
  });
});
