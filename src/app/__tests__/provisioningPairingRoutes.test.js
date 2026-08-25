/**
 * @jest-environment node
 */

import { Wallet } from 'ethers'

jest.mock('@/utils/auth/provisioningPairingRoutes', () => ({
  createPairingForSession: jest.fn(),
  pairingErrorResponse: jest.fn((error) => Response.json(
    { error: error?.message || 'Provisioning pairing failed', code: error?.code || 'PAIRING_ERROR' },
    { status: error?.status || 400 },
  )),
  requireProvisioningPairingSession: jest.fn(),
}))

jest.mock('@/utils/auth/provisioningPairingStore', () => ({
  getProvisioningPairingByChallenge: jest.fn(),
  isProvisioningPairingExpired: jest.fn(),
  publicProvisioningPairing: jest.fn((pairing) => {
    const {
      activePairingKey,
      challengeHash,
      token,
      tokenPayload,
      walletSignature,
      ...publicPairing
    } = pairing || {}
    return publicPairing
  }),
  redeemProvisioningPairingToken: jest.fn(),
  transitionProvisioningPairing: jest.fn(),
}))

jest.mock('@/utils/auth/provisioningPairingRateLimit', () => ({
  provisioningPairingRateLimitResponse: jest.fn(),
}))

jest.mock('@/contracts/diamond', () => ({
  contractAddresses: {
    sepolia: '0x1111111111111111111111111111111111111111',
  },
}))

import { POST as createPairing } from '../api/institutions/provisioning/pairings/route.js'
import { POST as inspectPairing } from '../api/institutions/provisioning/pairings/inspect/route.js'
import { POST as offerPairing } from '../api/institutions/provisioning/pairings/offer/route.js'
import { POST as redeemPairing } from '../api/institutions/provisioning/pairings/token/route.js'
import {
  buildProvisioningPairingTypedData,
  getPairingRegistryConfig,
} from '@/utils/auth/provisioningPairingTypedData'

const {
  createPairingForSession: mockCreatePairingForSession,
  pairingErrorResponse: mockPairingErrorResponse,
  requireProvisioningPairingSession: mockRequireProvisioningPairingSession,
} = jest.requireMock('@/utils/auth/provisioningPairingRoutes')
const {
  getProvisioningPairingByChallenge: mockGetProvisioningPairingByChallenge,
  isProvisioningPairingExpired: mockIsProvisioningPairingExpired,
  publicProvisioningPairing: mockPublicProvisioningPairing,
  redeemProvisioningPairingToken: mockRedeemProvisioningPairingToken,
  transitionProvisioningPairing: mockTransitionProvisioningPairing,
} = jest.requireMock('@/utils/auth/provisioningPairingStore')
const { provisioningPairingRateLimitResponse: mockRateLimitResponse } =
  jest.requireMock('@/utils/auth/provisioningPairingRateLimit')

const REGISTRY_CONTRACT = '0x1111111111111111111111111111111111111111'
const INSTITUTION_ID = 'institution.example'
const CHALLENGE = `0x${'ab'.repeat(32)}`
const WALLET_PRIVATE_KEY = `0x${'12'.repeat(32)}`
const wallet = new Wallet(WALLET_PRIVATE_KEY)

const request = (path, body) => new Request(`https://marketplace.example${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const json = (response) => response.json()
const now = () => Math.floor(Date.now() / 1000)

function createPairingRecord(overrides = {}) {
  return {
    pairingId: 'pairing-1',
    challenge: CHALLENGE,
    institutionId: INSTITUTION_ID,
    registrationType: 'provider',
    issuedAt: now() - 10,
    expiresAt: now() + 590,
    status: 'AWAITING_BACKEND',
    walletAddress: null,
    canonicalBackendOrigin: null,
    ...overrides,
  }
}

async function signOffer({ pairing = createPairingRecord(), signer = wallet } = {}) {
  const { chainId, registryContract } = getPairingRegistryConfig()
  const claims = {
    institutionId: pairing.institutionId,
    walletAddress: pairing.walletAddress || wallet.address,
    canonicalBackendOrigin: pairing.canonicalBackendOrigin || 'https://backend.example',
    registrationType: pairing.registrationType,
    chainId,
    registryContract,
    challenge: pairing.challenge,
    issuedAt: pairing.issuedAt,
    expiresAt: pairing.expiresAt,
  }
  const typedData = buildProvisioningPairingTypedData(claims)
  return {
    claims,
    walletSignature: await signer.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message,
    ),
  }
}

describe('provisioning pairing HTTP lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireProvisioningPairingSession.mockResolvedValue({
      session: {
        id: 'session-1',
        authType: 'sso',
        email: 'admin@institution.example',
      },
      institutionId: INSTITUTION_ID,
    })
    mockCreatePairingForSession.mockResolvedValue({
      pairingId: 'pairing-1',
      challenge: CHALLENGE,
      institutionId: INSTITUTION_ID,
      registrationType: 'provider',
      status: 'AWAITING_BACKEND',
      expiresAt: now() + 600,
    })
    mockRateLimitResponse.mockResolvedValue(null)
    mockGetProvisioningPairingByChallenge.mockResolvedValue(createPairingRecord())
    mockIsProvisioningPairingExpired.mockReturnValue(false)
    mockTransitionProvisioningPairing.mockResolvedValue(createPairingRecord({
      status: 'AWAITING_APPROVAL',
      walletAddress: wallet.address,
      canonicalBackendOrigin: 'https://backend.example',
    }))
    mockRedeemProvisioningPairingToken.mockResolvedValue({
      token: 'signed-provisioning-token',
      payload: { jti: 'token-jti', expiresAt: now() + 300 },
      expiresAt: now() + 300,
    })
  })

  test('creates a provider pairing only after the rate-limit and SSO session checks', async () => {
    const body = { registrationType: 'provider' }
    const requestObject = request('/api/institutions/provisioning/pairings', body)
    const response = await createPairing(requestObject)

    expect(response.status).toBe(201)
    await expect(json(response)).resolves.toMatchObject({
      pairingId: 'pairing-1',
      status: 'AWAITING_BACKEND',
    })
    expect(mockRateLimitResponse).toHaveBeenCalledWith(
      'create',
      requestObject,
      expect.objectContaining({ institutionId: INSTITUTION_ID }),
    )
    expect(mockCreatePairingForSession).toHaveBeenCalledWith(
      'provider',
      expect.objectContaining({ institutionId: INSTITUTION_ID }),
    )
  })

  test('rejects an invalid registration type without creating a pairing', async () => {
    const response = await createPairing(request(
      '/api/institutions/provisioning/pairings',
      { registrationType: 'admin' },
    ))

    expect(response.status).toBe(400)
    await expect(json(response)).resolves.toEqual({
      error: 'registrationType must be provider or consumer',
    })
    expect(mockCreatePairingForSession).not.toHaveBeenCalled()
  })

  test('returns the inspection contract only for an active awaiting-backend challenge', async () => {
    const response = await inspectPairing(request(
      '/api/institutions/provisioning/pairings/inspect',
      { challenge: CHALLENGE.toUpperCase() },
    ))

    const body = await json(response)
    const { chainId } = getPairingRegistryConfig()

    expect(response.status).toBe(200)
    expect(body).toEqual(expect.objectContaining({
      pairingId: 'pairing-1',
      challenge: CHALLENGE,
      institutionId: INSTITUTION_ID,
      registrationType: 'provider',
      chainId,
      registryContract: REGISTRY_CONTRACT,
    }))
    expect(mockGetProvisioningPairingByChallenge).toHaveBeenCalledWith(CHALLENGE.toUpperCase())
  })

  test('rejects invalid, expired and already-offered inspections with distinct states', async () => {
    mockGetProvisioningPairingByChallenge.mockResolvedValueOnce(null)
    const missing = await inspectPairing(request(
      '/api/institutions/provisioning/pairings/inspect',
      { challenge: CHALLENGE },
    ))
    expect(missing.status).toBe(410)

    mockGetProvisioningPairingByChallenge.mockResolvedValueOnce(createPairingRecord())
    mockIsProvisioningPairingExpired.mockReturnValueOnce(true)
    const expired = await inspectPairing(request(
      '/api/institutions/provisioning/pairings/inspect',
      { challenge: CHALLENGE },
    ))
    expect(expired.status).toBe(410)

    mockGetProvisioningPairingByChallenge.mockResolvedValueOnce(createPairingRecord({ status: 'AWAITING_APPROVAL' }))
    const offered = await inspectPairing(request(
      '/api/institutions/provisioning/pairings/inspect',
      { challenge: CHALLENGE },
    ))
    expect(offered.status).toBe(409)
  })

  test('accepts an EIP-712 offer and atomically transitions to awaiting approval', async () => {
    const pairing = createPairingRecord()
    const { claims, walletSignature } = await signOffer({ pairing })
    mockTransitionProvisioningPairing.mockResolvedValueOnce(createPairingRecord({
      ...pairing,
      status: 'AWAITING_APPROVAL',
      walletAddress: wallet.address,
      canonicalBackendOrigin: claims.canonicalBackendOrigin,
      walletSignature,
    }))

    const response = await offerPairing(request(
      '/api/institutions/provisioning/pairings/offer',
      {
        challenge: pairing.challenge,
        walletAddress: wallet.address,
        canonicalBackendOrigin: claims.canonicalBackendOrigin,
        walletSignature,
      },
    ))

    expect(response.status).toBe(200)
    const body = await json(response)
    expect(body).toEqual(expect.objectContaining({
      status: 'AWAITING_APPROVAL',
      walletAddress: wallet.address,
      canonicalBackendOrigin: claims.canonicalBackendOrigin,
    }))
    expect(body.walletSignature).toBeUndefined()
    expect(mockTransitionProvisioningPairing).toHaveBeenCalledWith(
      'pairing-1',
      'AWAITING_BACKEND',
      expect.objectContaining({
        status: 'AWAITING_APPROVAL',
        walletAddress: wallet.address,
        canonicalBackendOrigin: claims.canonicalBackendOrigin,
        walletSignature,
      }),
    )
  })

  test('rejects an offer signed by a different wallet', async () => {
    const pairing = createPairingRecord()
    const otherWallet = new Wallet(`0x${'34'.repeat(32)}`)
    const { claims, walletSignature } = await signOffer({ pairing, signer: otherWallet })

    const response = await offerPairing(request(
      '/api/institutions/provisioning/pairings/offer',
      {
        challenge: pairing.challenge,
        walletAddress: wallet.address,
        canonicalBackendOrigin: claims.canonicalBackendOrigin,
        walletSignature,
      },
    ))

    expect(response.status).toBe(401)
    await expect(json(response)).resolves.toEqual({ error: 'Pairing wallet signature mismatch' })
    expect(mockTransitionProvisioningPairing).not.toHaveBeenCalled()
  })

  test('rejects malformed signatures and offers outside the awaiting-backend state', async () => {
    const malformed = await offerPairing(request(
      '/api/institutions/provisioning/pairings/offer',
      {
        challenge: CHALLENGE,
        walletAddress: wallet.address,
        canonicalBackendOrigin: 'https://backend.example',
        walletSignature: '0xdeadbeef',
      },
    ))
    expect(malformed.status).toBe(400)

    mockGetProvisioningPairingByChallenge.mockResolvedValueOnce(createPairingRecord({ status: 'AWAITING_APPROVAL' }))
    const alreadyOffered = await offerPairing(request(
      '/api/institutions/provisioning/pairings/offer',
      {
        challenge: CHALLENGE,
        walletAddress: wallet.address,
        canonicalBackendOrigin: 'https://backend.example',
        walletSignature: '0xdeadbeef',
      },
    ))
    expect(alreadyOffered.status).toBe(409)

    mockGetProvisioningPairingByChallenge.mockResolvedValueOnce(createPairingRecord())
    mockIsProvisioningPairingExpired.mockReturnValueOnce(true)
    const expired = await offerPairing(request(
      '/api/institutions/provisioning/pairings/offer',
      {
        challenge: CHALLENGE,
        walletAddress: wallet.address,
        canonicalBackendOrigin: 'https://backend.example',
        walletSignature: '0xdeadbeef',
      },
    ))
    expect(expired.status).toBe(410)
  })

  test('returns an approved token once and rejects replay after the atomic redemption', async () => {
    const approved = createPairingRecord({
      status: 'APPROVED',
      token: 'signed-provisioning-token',
      tokenExpiresAt: now() + 300,
    })
    mockGetProvisioningPairingByChallenge.mockResolvedValue(approved)
    mockRedeemProvisioningPairingToken
      .mockResolvedValueOnce({
        token: approved.token,
        payload: { jti: 'token-jti', expiresAt: approved.tokenExpiresAt },
        expiresAt: approved.tokenExpiresAt,
      })
      .mockRejectedValueOnce(Object.assign(new Error('Provisioning pairing token is no longer available'), {
        status: 409,
        code: 'PAIRING_TOKEN_UNAVAILABLE',
      }))

    const first = await redeemPairing(request(
      '/api/institutions/provisioning/pairings/token',
      { challenge: CHALLENGE },
    ))
    const second = await redeemPairing(request(
      '/api/institutions/provisioning/pairings/token',
      { challenge: CHALLENGE },
    ))

    expect(first.status).toBe(200)
    await expect(json(first)).resolves.toMatchObject({ token: approved.token })
    expect(second.status).toBe(409)
    await expect(json(second)).resolves.toEqual({
      error: 'Provisioning pairing token is no longer available',
      code: 'PAIRING_TOKEN_UNAVAILABLE',
    })
    expect(mockRedeemProvisioningPairingToken).toHaveBeenCalledTimes(2)
  })

  test('requires approval and rejects expired tokens before redemption', async () => {
    mockGetProvisioningPairingByChallenge.mockResolvedValueOnce(createPairingRecord({
      status: 'AWAITING_APPROVAL',
      token: null,
      tokenExpiresAt: now() + 300,
    }))
    const pending = await redeemPairing(request(
      '/api/institutions/provisioning/pairings/token',
      { challenge: CHALLENGE },
    ))
    expect(pending.status).toBe(409)
    await expect(json(pending)).resolves.toEqual(expect.objectContaining({
      error: 'Pairing has not been approved yet',
      status: 'AWAITING_APPROVAL',
    }))

    mockGetProvisioningPairingByChallenge.mockResolvedValueOnce(createPairingRecord({
      status: 'APPROVED',
      token: 'expired-token',
      tokenExpiresAt: now() - 1,
    }))
    const expired = await redeemPairing(request(
      '/api/institutions/provisioning/pairings/token',
      { challenge: CHALLENGE },
    ))
    expect(expired.status).toBe(410)
    expect(mockRedeemProvisioningPairingToken).not.toHaveBeenCalled()
  })

  test('propagates the rate limiter before touching pairing state on every public operation', async () => {
    const cases = [
      [createPairing, 'create', request('/api/institutions/provisioning/pairings', { registrationType: 'provider' })],
      [inspectPairing, 'inspect', request('/api/institutions/provisioning/pairings/inspect', { challenge: CHALLENGE })],
      [offerPairing, 'offer', request('/api/institutions/provisioning/pairings/offer', { challenge: CHALLENGE })],
      [redeemPairing, 'token', request('/api/institutions/provisioning/pairings/token', { challenge: CHALLENGE })],
    ]

    for (const [handler, operation, requestObject] of cases) {
      jest.clearAllMocks()
      mockRateLimitResponse.mockImplementation(() => Promise.resolve(new Response(
        JSON.stringify({ error: 'Too many provisioning pairing requests' }),
        { status: 429, headers: { 'Retry-After': '10' } },
      )))

      const response = await handler(requestObject)

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('10')
      expect(mockRateLimitResponse.mock.calls[0][0]).toBe(operation)
      expect(mockGetProvisioningPairingByChallenge).not.toHaveBeenCalled()
      expect(mockCreatePairingForSession).not.toHaveBeenCalled()
      mockRateLimitResponse.mockResolvedValue(null)
    }
  })
})
