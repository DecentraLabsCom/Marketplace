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
    if (!url.startsWith('https://')) {
      throw new Error(`${label} must use HTTPS`);
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

jest.mock('@/utils/auth/roleValidation', () => ({
  hasAdminRole: jest.fn((role, scopedRole) => {
    return role === 'admin' && scopedRole === 'admin';
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

  test('returns 403 when user does not have admin role', async () => {
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
      error: 'Provisioning token allowed only for institutional staff',
    });
  });

  test('returns 400 when publicBaseUrl is missing', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
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
      affiliation: 'institution.edu',
      name: 'Test Institution',
      email: 'admin@institution.edu',
      schacHomeOrganization: 'institution.edu',
    });

    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';
    const mockExpiresAt = new Date(Date.now() + 900000).toISOString();

    signProvisioningToken.mockResolvedValue({
      token: mockToken,
      expiresAt: mockExpiresAt,
    });

    const { POST } = await import('../api/institutions/provisionToken/route.js');

    const req = new Request('http://localhost/api/institutions/provisionToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: 'https://auth.institution.edu',
        walletAddress: '0x1234567890123456789012345678901234567890',
        providerCountry: 'ES',
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
        'providerOrganization',
      ]),
    });

    expect(json.payload).toMatchObject({
      marketplaceBaseUrl: 'https://marketplace.example.com',
      publicBaseUrl: 'https://auth.institution.edu',
      providerOrganization: 'institution.edu',
      providerCountry: 'ES',
      walletAddress: '0x1234567890123456789012345678901234567890',
      chainId: 11155111,
      verifyingContract: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/),
      registrationNonce: expect.any(String),
    });

    expect(signProvisioningToken).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        audience: 'https://auth.institution.edu',
        issuer: 'https://marketplace.example.com',
      })
    );
  });

  test('ignores provider organization supplied by the browser', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      schacHomeOrganization: 'trusted.edu',
      name: 'Trusted Institution',
      email: 'admin@trusted.edu',
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
        publicBaseUrl: 'https://auth.trusted.edu',
        walletAddress: '0x1234567890123456789012345678901234567890',
        providerOrganization: 'attacker.example',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      payload: { providerOrganization: 'trusted.edu' },
    });
    expect(signProvisioningToken).toHaveBeenCalledWith(
      expect.objectContaining({ providerOrganization: 'trusted.edu' }),
      expect.any(Object)
    );
  });

  test('rejects non-loopback http publicBaseUrl', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
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

  test('requires the institutional wallet before issuing a provider token', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      schacHomeOrganization: 'institution.edu',
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
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/wallet/i) });
    expect(signProvisioningToken).not.toHaveBeenCalled();
  });
});
