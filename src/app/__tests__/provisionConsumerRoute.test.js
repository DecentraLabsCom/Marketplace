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
  normalizeHttpsUrl: jest.fn((url) => {
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
    process.env.INSTITUTIONAL_SERVICES_API_KEY = 'test-api-key-123';
    process.env.NEXT_PUBLIC_BASE_URL = 'https://marketplace.example.com';
    process.env.PROVISIONING_TOKEN_TTL_SECONDS = '900';
  });

  afterEach(() => {
    delete process.env.INSTITUTIONAL_SERVICES_API_KEY;
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

  test('successfully generates consumer provisioning token without publicBaseUrl', async () => {
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

    // Consumer tokens should NOT have publicBaseUrl
    expect(json.payload.publicBaseUrl).toBeUndefined();
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
      body: JSON.stringify({}), // No consumerName provided
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    
    const json = await res.json();
    expect(json.payload.consumerName).toBe('Auto Institution');
    expect(json.payload.consumerOrganization).toBe('auto.edu');
  });

  test('rejects when INSTITUTIONAL_SERVICES_API_KEY is not configured', async () => {
    delete process.env.INSTITUTIONAL_SERVICES_API_KEY;

    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      role: 'admin',
      scopedRole: 'admin',
      affiliation: 'test.edu',
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
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    const json = await res.json();
    
    // Verify type discriminator is 'consumer'
    expect(json.payload.type).toBe('consumer');
  });
});
