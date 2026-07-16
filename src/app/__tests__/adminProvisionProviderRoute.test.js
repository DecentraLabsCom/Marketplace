/**
 * @jest-environment node
 */

import { requireAuth } from '@/utils/auth/guards';
import { signProvisioningToken } from '@/utils/auth/provisioningToken';
import { recordProvisioningTokenIssued } from '@/utils/auth/provisioningReplayStore'

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
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }),
  requireString: jest.fn((value, label) => {
    if (!value || typeof value !== 'string' || !value.trim()) {
      throw new Error(`${label} is required`);
    }
    return value.trim();
  }),
  requireEmail: jest.fn((value, label = 'email') => {
    if (!value || typeof value !== 'string' || !value.includes('@')) {
      throw new Error(`Invalid ${label}`);
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

jest.mock('@/utils/auth/provisioningTypedData', () => ({
  PROVISIONING_REGISTRATION_TYPES: { PROVIDER: 'provider' },
  getProvisioningRegistryConfig: jest.fn(() => ({
    chainId: 11155111,
    registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
  })),
  normalizeBackendOrigin: jest.fn((url) => {
    if (!url || !url.startsWith('https://')) throw new Error('Institutional backend origin must use HTTPS')
    return url.replace(/\/$/, '')
  }),
  normalizeWalletAddress: jest.fn((walletAddress) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress || '')) {
      throw new Error('Wallet address must be a valid Ethereum address')
    }
    return walletAddress
  }),
}))

jest.mock('@/utils/auth/provisioningReplayStore', () => ({
  recordProvisioningTokenIssued: jest.fn(),
}))

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
  },
}));

describe('/api/admin/institutions/provisionProvider route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_BASE_URL = 'https://marketplace.example.com';
    process.env.PROVISIONING_TOKEN_TTL_SECONDS = '300';
    process.env.MARKETPLACE_PLATFORM_ADMIN_EMAILS = 'ldelatorre@dia.uned.es';
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_BASE_URL;
    delete process.env.PROVISIONING_TOKEN_TTL_SECONDS;
    delete process.env.MARKETPLACE_PLATFORM_ADMIN_EMAILS;
  });

  test('returns 403 when session is not SSO', async () => {
    requireAuth.mockResolvedValue({
      email: 'ldelatorre@dia.uned.es',
    });

    const { POST } = await import('../api/admin/institutions/provisionProvider/route.js');

    const req = new Request('http://localhost/api/admin/institutions/provisionProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerName: 'Partner Lab',
        providerEmail: 'admin@partner.org',
        providerCountry: 'ES',
        providerOrganization: 'partner.org',
        publicBaseUrl: 'https://gateway.partner.org',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Platform provider token requires SSO session',
    });
  });

  test('returns 403 when SSO email is not platform allowlisted', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      email: 'other.admin@example.edu',
    });

    const { POST } = await import('../api/admin/institutions/provisionProvider/route.js');

    const req = new Request('http://localhost/api/admin/institutions/provisionProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerName: 'Partner Lab',
        providerEmail: 'admin@partner.org',
        providerCountry: 'ES',
        providerOrganization: 'partner.org',
        publicBaseUrl: 'https://gateway.partner.org',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Platform provider token allowed only for platform admins',
    });
  });

  test('successfully generates manual-review provider token for allowlisted platform admin', async () => {
    requireAuth.mockResolvedValue({
      samlAssertion: 'valid-assertion',
      email: 'LDelatorre@dia.uned.es',
      name: 'Luis de la Torre',
      schacHomeOrganization: 'dia.uned.es',
    });

    signProvisioningToken.mockResolvedValue({
      token: 'mock-provider-token',
      expiresAt: '2026-06-13T10:00:00.000Z',
      payload: {
        institutionId: 'partner.org',
        walletAddress: '0x1234567890123456789012345678901234567890',
        canonicalBackendOrigin: 'https://gateway.partner.org',
        registrationType: 'provider',
        chainId: 11155111,
        registryContract: '0xe49a2f59631717691642f929E0FeF1f705866600',
        jti: 'provisioning-jti',
        nonce: `0x${'11'.repeat(32)}`,
        issuedAt: 1_700_000_000,
        expiresAt: 1_700_000_300,
        marketplaceBaseUrl: 'https://marketplace.example.com',
        providerName: 'Partner Lab',
        providerEmail: 'admin@partner.org',
        providerCountry: 'ES',
        providerOrganization: 'partner.org',
        verificationMethod: 'manual_review',
        assuranceLevel: 'partner_verified',
        agreementId: 'AGR-2026-001',
        issuedBy: 'ldelatorre@dia.uned.es',
      },
    });

    const { POST } = await import('../api/admin/institutions/provisionProvider/route.js');

    const req = new Request('http://localhost/api/admin/institutions/provisionProvider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerName: 'Partner Lab',
        providerEmail: 'admin@partner.org',
        providerCountry: 'ES',
        providerOrganization: 'Partner.ORG',
        publicBaseUrl: 'https://gateway.partner.org/',
        walletAddress: '0x1234567890123456789012345678901234567890',
        agreementId: 'AGR-2026-001',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      token: 'mock-provider-token',
      expiresAt: '2026-06-13T10:00:00.000Z',
      payload: {
        marketplaceBaseUrl: 'https://marketplace.example.com',
        providerName: 'Partner Lab',
        providerEmail: 'admin@partner.org',
        providerCountry: 'ES',
        providerOrganization: 'partner.org',
        canonicalBackendOrigin: 'https://gateway.partner.org',
        walletAddress: '0x1234567890123456789012345678901234567890',
        registrationType: 'provider',
        verificationMethod: 'manual_review',
        assuranceLevel: 'partner_verified',
        agreementId: 'AGR-2026-001',
        issuedBy: 'ldelatorre@dia.uned.es',
      },
    });

    expect(signProvisioningToken).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationMethod: 'manual_review',
        assuranceLevel: 'partner_verified',
        issuedBy: 'ldelatorre@dia.uned.es',
      }),
      expect.objectContaining({
        audience: 'https://gateway.partner.org',
        issuer: 'https://marketplace.example.com',
        ttlSeconds: 300,
      })
    );
    expect(recordProvisioningTokenIssued).toHaveBeenCalledWith(
      expect.objectContaining({ jti: 'provisioning-jti' })
    )
  });
});
