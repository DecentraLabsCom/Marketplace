/**
 * @jest-environment node
 */

const mockCreatePairingForSession = jest.fn();
const mockRequireProvisioningPairingSession = jest.fn();
const mockPairingErrorResponse = jest.fn((error) => new Response(JSON.stringify({ error: error.message }), { status: 400 }));

jest.mock('@/utils/auth/provisioningPairingRoutes', () => ({
  createPairingForSession: mockCreatePairingForSession,
  requireProvisioningPairingSession: mockRequireProvisioningPairingSession,
  pairingErrorResponse: mockPairingErrorResponse,
}));

describe('/api/institutions/provisionToken compatibility route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireProvisioningPairingSession.mockResolvedValue({ institutionId: 'institution.edu' });
    mockCreatePairingForSession.mockResolvedValue({
      pairingId: 'pairing-1',
      challenge: `0x${'11'.repeat(32)}`,
      registrationType: 'provider',
      status: 'AWAITING_BACKEND',
    });
  });

  test('creates a provider pairing and ignores wallet/backend values from the browser', async () => {
    const { POST } = await import('../api/institutions/provisionToken/route.js');
    const response = await POST(new Request('https://marketplace.example/api/institutions/provisionToken', {
      method: 'POST',
      body: JSON.stringify({
        walletAddress: '0x9999999999999999999999999999999999999999',
        publicBaseUrl: 'https://attacker.example',
      }),
    }));

    expect(response.status).toBe(201);
    expect(mockCreatePairingForSession).toHaveBeenCalledWith('provider', expect.anything());
    expect((await response.json()).challenge).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
