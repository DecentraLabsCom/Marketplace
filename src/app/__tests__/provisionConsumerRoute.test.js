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
  normalizeHttpsUrl: jest.fn((url, label = 'URL') => {
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

describe('/api/institutions/provisionConsumer route', () => {
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
      userid: 'user123',
      // No samlAssertion
    });

    const { POST } = await import('../api/institutions/provisionConsumer/route.js');

    const req = new Request('http://localhost/api/institutions/provisionConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Consumer provisioning token requires SSO session',
    });
  });

  test('returns 403 when user does not have admin role', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'user', // Not admin
      scopedRole: 'student',
    });

    const { POST } = await import('../api/institutions/provisionConsumer/route.js');

    const req = new Request('http://localhost/api/institutions/provisionConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Consumer provisioning token allowed only for institutional staff',
    });
  });

  test('returns 400 when publicBaseUrl is missing', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      affiliation: 'consumer.edu',
      organizationName: 'Consumer Institution',
      schacHomeOrganization: 'consumer.edu',
    });

    const { POST } = await import('../api/institutions/provisionConsumer/route.js');

    const req = new Request('http://localhost/api/institutions/provisionConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test('successfully generates consumer provisioning token with publicBaseUrl', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      affiliation: 'consumer.edu',
      organizationName: 'Consumer Institution',
      schacHomeOrganization: 'consumer.edu',
    });

    const mockToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...consumer';
    const mockExpiresAt = new Date(Date.now() + 900000).toISOString();

    signProvisioningToken.mockResolvedValue({
      token: mockToken,
      expiresAt: mockExpiresAt,
    });

    const { POST } = await import('../api/institutions/provisionConsumer/route.js');

    const req = new Request('http://localhost/api/institutions/provisionConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumerName: 'Test Consumer',
        publicBaseUrl: 'https://wallet.consumer.edu',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json).toMatchObject({
      success: true,
      token: mockToken,
      expiresAt: mockExpiresAt,
      lockedFields: expect.arrayContaining(['consumerOrganization']),
    });

    expect(json.payload).toMatchObject({
      type: 'consumer',
      marketplaceBaseUrl: 'https://marketplace.example.com',
      consumerOrganization: 'consumer.edu',
    });

    expect(signProvisioningToken).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        audience: 'https://wallet.consumer.edu',
        issuer: 'https://marketplace.example.com',
      })
    );
  });

  test('uses session attributes when consumerName not provided', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      affiliation: 'auto.edu',
      organizationName: 'Auto Institution',
      schacHomeOrganization: 'auto.edu',
    });

    signProvisioningToken.mockResolvedValue({
      token: 'mock-token',
      expiresAt: new Date().toISOString(),
    });

    const { POST } = await import('../api/institutions/provisionConsumer/route.js');

    const req = new Request('http://localhost/api/institutions/provisionConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: 'https://wallet.auto.edu',
      }), // No consumerName provided
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json.payload.consumerName).toBe('Auto Institution');
    expect(json.payload.consumerOrganization).toBe('auto.edu');
  });

  test('includes correct token type discriminator', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      affiliation: 'consumer.edu',
      organizationName: 'Consumer Test',
    });

    signProvisioningToken.mockResolvedValue({
      token: 'mock-token',
      expiresAt: new Date().toISOString(),
    });

    const { POST } = await import('../api/institutions/provisionConsumer/route.js');

    const req = new Request('http://localhost/api/institutions/provisionConsumer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicBaseUrl: 'https://wallet.consumer.edu',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    
    // Verify type discriminator is 'consumer'
    expect(json.payload.type).toBe('consumer');
  });
});
