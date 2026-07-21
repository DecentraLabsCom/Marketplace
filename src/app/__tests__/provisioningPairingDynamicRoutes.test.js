/**
 * @jest-environment node
 */

const mockRequireProvisioningPairingSession = jest.fn();
const mockPairingErrorResponse = jest.fn((error) => (
  new Response(JSON.stringify({ error: error.message }), { status: 400 })
));
const mockRateLimitResponse = jest.fn();
const mockAssertPairingBelongsToSession = jest.fn();
const mockCancelProvisioningPairing = jest.fn();
const mockPublicProvisioningPairing = jest.fn((pairing) => pairing);

jest.mock('@/utils/auth/provisioningPairingRoutes', () => ({
  assertPairingBelongsToSession: mockAssertPairingBelongsToSession,
  pairingErrorResponse: mockPairingErrorResponse,
  requireProvisioningPairingSession: mockRequireProvisioningPairingSession,
}));

jest.mock('@/utils/auth/provisioningPairingStore', () => ({
  cancelProvisioningPairing: mockCancelProvisioningPairing,
  publicProvisioningPairing: mockPublicProvisioningPairing,
}));

jest.mock('@/utils/auth/provisioningPairingRateLimit', () => ({
  provisioningPairingRateLimitResponse: mockRateLimitResponse,
}));

describe('dynamic provisioning pairing routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireProvisioningPairingSession.mockResolvedValue({ institutionId: 'institution.edu' });
    mockRateLimitResponse.mockResolvedValue(null);
    mockAssertPairingBelongsToSession.mockResolvedValue({
      pairingId: 'pairing-1',
      status: 'AWAITING_BACKEND',
    });
    mockCancelProvisioningPairing.mockResolvedValue(undefined);
  });

  test('passes the awaited pairing id to GET', async () => {
    const { GET } = await import('../api/institutions/provisioning/pairings/[pairingId]/route.js');

    const response = await GET(
      new Request('https://marketplace.example/api/institutions/provisioning/pairings/pairing-1'),
      { params: Promise.resolve({ pairingId: 'pairing-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mockAssertPairingBelongsToSession).toHaveBeenCalledWith(
      'pairing-1',
      expect.objectContaining({ institutionId: 'institution.edu' }),
    );
    expect(mockPublicProvisioningPairing).toHaveBeenCalledWith(expect.objectContaining({ pairingId: 'pairing-1' }));
  });

  test('passes the awaited pairing id to DELETE', async () => {
    const { DELETE } = await import('../api/institutions/provisioning/pairings/[pairingId]/route.js');

    const response = await DELETE(
      new Request('https://marketplace.example/api/institutions/provisioning/pairings/pairing-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ pairingId: 'pairing-1' }) },
    );

    expect(response.status).toBe(204);
    expect(mockAssertPairingBelongsToSession).toHaveBeenCalledWith(
      'pairing-1',
      expect.objectContaining({ institutionId: 'institution.edu' }),
    );
    expect(mockCancelProvisioningPairing).toHaveBeenCalledWith('pairing-1');
  });

  test('passes the awaited pairing id to approve', async () => {
    const mockSignProvisioningToken = jest.fn().mockResolvedValue({
      token: 'signed-token',
      payload: { jti: 'jti-1', expiresAt: Math.floor(Date.now() / 1000) + 300 },
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    const mockGetProvisioningRegistryConfig = jest.fn().mockReturnValue({
      chainId: 11155111,
      registryContract: '0x1111111111111111111111111111111111111111',
    });
    const mockRecordProvisioningTokenIssued = jest.fn().mockResolvedValue(undefined);
    const mockTransitionProvisioningPairing = jest.fn().mockResolvedValue({
      pairingId: 'pairing-1',
      status: 'APPROVED',
    });

    jest.resetModules();
    jest.doMock('@/utils/auth/provisioningToken', () => ({
      normalizeHttpsUrl: jest.fn(() => 'https://marketplace.example'),
      signProvisioningToken: mockSignProvisioningToken,
    }));
    jest.doMock('@/utils/auth/provisioningTypedData', () => ({
      getProvisioningRegistryConfig: mockGetProvisioningRegistryConfig,
    }));
    jest.doMock('@/utils/auth/provisioningReplayStore', () => ({
      recordProvisioningTokenIssued: mockRecordProvisioningTokenIssued,
    }));
    jest.doMock('@/utils/country/inferCountryFromDomain', () => ({
      inferCountryFromDomain: jest.fn(() => 'ES'),
    }));
    jest.doMock('@/utils/auth/provisioningPairingStore', () => ({
      publicProvisioningPairing: mockPublicProvisioningPairing,
      transitionProvisioningPairing: mockTransitionProvisioningPairing,
    }));

    mockAssertPairingBelongsToSession.mockResolvedValue({
      pairingId: 'pairing-1',
      institutionId: 'institution.edu',
      registrationType: 'consumer',
      status: 'AWAITING_APPROVAL',
      walletAddress: '0x2222222222222222222222222222222222222222',
      canonicalBackendOrigin: 'https://backend.example',
      issuedAt: Math.floor(Date.now() / 1000) - 10,
      expiresAt: Math.floor(Date.now() / 1000) + 590,
      consumerName: 'Institution',
    });
    mockRequireProvisioningPairingSession.mockResolvedValue({
      institutionId: 'institution.edu',
      session: { email: 'admin@institution.edu', name: 'Admin' },
    });

    const { POST } = await import('../api/institutions/provisioning/pairings/[pairingId]/approve/route.js');
    const response = await POST(
      new Request('https://marketplace.example/api/institutions/provisioning/pairings/pairing-1/approve', {
        method: 'POST',
      }),
      { params: Promise.resolve({ pairingId: 'pairing-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mockAssertPairingBelongsToSession).toHaveBeenCalledWith(
      'pairing-1',
      expect.objectContaining({ institutionId: 'institution.edu' }),
    );
    expect(mockTransitionProvisioningPairing).toHaveBeenCalledWith(
      'pairing-1',
      'AWAITING_APPROVAL',
      expect.objectContaining({ status: 'APPROVED' }),
      expect.objectContaining({ retentionExpiresAt: expect.any(Number) }),
    );
  });
});
