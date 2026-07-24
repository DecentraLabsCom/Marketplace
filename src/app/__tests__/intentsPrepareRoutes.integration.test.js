/**
 * @jest-environment node
 */

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((error) => new Response(
    JSON.stringify({ error: error?.message || 'guard error' }),
    { status: error?.status || 401, headers: { 'Content-Type': 'application/json' } },
  )),
}))

jest.mock('@/utils/intents/signInstitutionalActionIntent', () => ({
  ACTION_CODES: {
    LAB_ADD: 1,
    LAB_ADD_AND_LIST: 2,
    LAB_SET_URI: 3,
    LAB_UPDATE: 4,
    LAB_DELETE: 5,
    LAB_LIST: 6,
    LAB_UNLIST: 7,
    REQUEST_BOOKING: 8,
    CANCEL_REQUEST_BOOKING: 9,
    CANCEL_BOOKING: 10,
  },
  buildActionIntent: jest.fn(),
  computeAssertionHash: jest.fn(),
}))

jest.mock('@/utils/intents/signInstitutionalReservationIntent', () => ({
  ACTION_CODES: {
    REQUEST_BOOKING: 8,
    CANCEL_REQUEST_BOOKING: 9,
    DIRECT_BOOKING: 11,
  },
  buildReservationIntent: jest.fn(),
  computeReservationAssertionHash: jest.fn(),
}))

jest.mock('@/utils/intents/resolveIntentExecutor', () => ({
  resolveIntentExecutorForInstitution: jest.fn(),
}))

jest.mock('@/utils/intents/intentNonceStore', () => ({
  getServerSignerAddress: jest.fn(() => '0x00000000000000000000000000000000000000a2'),
  withIntentSignerLock: jest.fn((_signer, callback) => callback({
    fencingToken: 1,
    assertActive: jest.fn(),
  })),
}))

jest.mock('@/utils/webauthn/service', () => ({
  ...jest.requireActual('@/utils/webauthn/service'),
  getPucFromSession: jest.fn(jest.requireActual('@/utils/webauthn/service').getPucFromSession),
}))

jest.mock('@/utils/intents/adminIntentSigner', () => ({
  signIntentMeta: jest.fn(),
  getAdminAddress: jest.fn(),
  registerIntentOnChain: jest.fn(),
  cancelIntentOnChain: jest.fn(),
}))

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/intents/serialize', () => ({
  serializeIntent: jest.fn(),
}))

jest.mock('@/utils/intents/backendClient', () => ({
  getIntentBackendAuthToken: jest.fn(),
  requestIntentAuthorizationSession: jest.fn(),
  notifyIntentRegistrationMined: jest.fn(),
  mapAuthorizationErrorCode: jest.fn(),
  normalizeAuthorizationResponse: jest.fn(),
  hasUsableAuthorizationSession: jest.fn(),
  resolveAuthorizationUrl: jest.fn(),
}))

jest.mock('@/utils/intents/onchainHelpers', () => ({
  resolveChainNowSec: jest.fn(),
}))

jest.mock('@/app/api/contract/utils/institutionSession', () => ({
  resolveInstitutionAddressFromSession: jest.fn(),
}))

jest.mock('@/utils/onboarding/institutionalBackend', () => ({
  resolveInstitutionalBackendUrl: jest.fn(),
}))

jest.mock('@/utils/api/rateLimit', () => ({
  createRateLimiter: jest.fn(() => jest.fn(async () => ({ limited: false }))),
  createRateLimitResponse: jest.fn(() => null),
}))

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

import { requireAuth } from '@/utils/auth/guards'
import { ACTION_CODES, buildActionIntent, computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import { buildReservationIntent, computeReservationAssertionHash } from '@/utils/intents/signInstitutionalReservationIntent'
import { resolveIntentExecutorForInstitution } from '@/utils/intents/resolveIntentExecutor'
import { getPucFromSession } from '@/utils/webauthn/service'
import { resolveInstitutionAddressFromSession } from '@/app/api/contract/utils/institutionSession'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import {
  signIntentMeta,
  getAdminAddress,
  registerIntentOnChain,
  cancelIntentOnChain,
} from '@/utils/intents/adminIntentSigner'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { serializeIntent } from '@/utils/intents/serialize'
import {
  getIntentBackendAuthToken,
  requestIntentAuthorizationSession,
  notifyIntentRegistrationMined,
  mapAuthorizationErrorCode,
  normalizeAuthorizationResponse,
  hasUsableAuthorizationSession,
  resolveAuthorizationUrl,
} from '@/utils/intents/backendClient'
import { resolveChainNowSec } from '@/utils/intents/onchainHelpers'
import { clearIntentPrepareCache } from '@/utils/intents/prepareCache'
import { POST as prepareIntentPOST } from '../api/backend/intents/actions/prepare/route.js'

const buildRequest = (body) => new Request(
  'http://localhost/api/backend/intents/actions/prepare',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
)

describe('Unified intent prepare route', () => {
  const nowSec = Math.floor(Date.now() / 1000)
  const validReservationKey = `0x${'12'.repeat(32)}`
  const validLabPayload = {
    labId: 0,
    uri: 'ipfs://lab-metadata',
    price: 7,
    accessURI: 'https://gateway.example/lab',
    accessKey: 'lab-key',
    resourceType: 0,
  }
  const authorization = {
    sessionId: 'auth-session-1',
    ceremonyUrl: 'https://ib.example/intents/authorize/ceremony/auth-session-1',
    expiresAt: '2026-02-20T00:05:00Z',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    clearIntentPrepareCache()
    process.env.NEXT_PUBLIC_SAML_STABLE_USER_ID_MODE = 'principal'

    requireAuth.mockResolvedValue({
      id: 'alice@uned.es|targeted-alice',
      eduPersonPrincipalName: 'alice@uned.es',
      eduPersonTargetedID: 'targeted-alice',
      samlAssertion: '<Assertion>test</Assertion>',
      schacHomeOrganization: 'uni.example',
    })
    getPucFromSession.mockImplementation(
      jest.requireActual('@/utils/webauthn/service').getPucFromSession,
    )
    resolveIntentExecutorForInstitution.mockResolvedValue('0x00000000000000000000000000000000000000a1')
    getAdminAddress.mockResolvedValue('0x00000000000000000000000000000000000000a2')
    resolveChainNowSec.mockResolvedValue(1_700_000_000)
    computeAssertionHash.mockReturnValue('0xassertionhash')
    computeReservationAssertionHash.mockReturnValue('0xreservationassertionhash')
    buildActionIntent.mockResolvedValue({
      meta: { requestId: 'req-action-1', requestedAt: 1_700_000_000, expiresAt: 1_700_000_300 },
      payload: { reservationKey: validReservationKey },
      typedData: { domain: {}, types: {}, message: {} },
    })
    buildReservationIntent.mockResolvedValue({
      meta: { requestId: 'req-reservation-1', requestedAt: 1_700_000_000, expiresAt: 1_700_000_300 },
      payload: { reservationKey: validReservationKey },
      typedData: { domain: {}, types: {}, message: {} },
    })
    signIntentMeta.mockResolvedValue('0xadminsignature')
    registerIntentOnChain.mockResolvedValue({ txHash: '0xontx' })
    notifyIntentRegistrationMined.mockResolvedValue({ ok: true, status: 202 })
    getContractInstance.mockResolvedValue({
      getLab: jest.fn().mockResolvedValue({ base: { price: 2n } }),
      getReservation: jest.fn().mockResolvedValue({
        labId: 9n,
        price: 123n,
        start: BigInt(nowSec + 300),
        end: BigInt(nowSec + 420),
        renter: '0x00000000000000000000000000000000000000a1',
        status: 1,
      }),
      ownerOf: jest.fn().mockResolvedValue('0x000000000000000000000000000000000000dead'),
    })
    resolveInstitutionAddressFromSession.mockResolvedValue({
      institutionAddress: '0x00000000000000000000000000000000000000a1',
      normalizedDomain: 'uni.example',
    })
    resolveInstitutionalBackendUrl.mockResolvedValue('https://ib.example')
    serializeIntent.mockImplementation((value) => value)
    getIntentBackendAuthToken.mockResolvedValue({ token: 'backend-token', expiresAt: '2026-02-20T00:00:00Z' })
    requestIntentAuthorizationSession.mockResolvedValue({ ok: true, status: 200, data: authorization })
    mapAuthorizationErrorCode.mockReturnValue(null)
    normalizeAuthorizationResponse.mockImplementation((value) => value)
    hasUsableAuthorizationSession.mockReturnValue(true)
    resolveAuthorizationUrl.mockReturnValue(authorization.ceremonyUrl)
  })

  test('prepares a lab action and creates WebAuthn authorization while registering on-chain', async () => {
    const res = await prepareIntentPOST(buildRequest({
      action: ACTION_CODES.LAB_ADD,
      payload: validLabPayload,
    }))
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload).toMatchObject({
      kind: 'action',
      requestId: 'req-action-1',
      backendUrl: 'https://ib.example',
      authorizationSessionId: 'auth-session-1',
    })
    expect(payload).not.toHaveProperty('backendAuthToken')
    expect(payload).not.toHaveProperty('backendAuthExpiresAt')
    expect(buildActionIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTION_CODES.LAB_ADD,
      labId: 0n,
      price: 7n,
      assertionHash: '0xassertionhash',
    }))
    expect(registerIntentOnChain).toHaveBeenCalledWith(
      'action',
      expect.any(Object),
      expect.any(Object),
      '0xadminsignature',
      { waitForReceipt: false },
    )
    expect(requestIntentAuthorizationSession).toHaveBeenCalledWith(expect.objectContaining({
      payloadKey: 'actionPayload',
      backendUrl: 'https://ib.example',
    }))
  })

  test('accepts LAB_ADD_AND_LIST as a normal action', async () => {
    const res = await prepareIntentPOST(buildRequest({
      action: ACTION_CODES.LAB_ADD_AND_LIST,
      payload: validLabPayload,
    }))

    expect(res.status).toBe(200)
    expect(buildActionIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTION_CODES.LAB_ADD_AND_LIST,
    }))
    expect(registerIntentOnChain).toHaveBeenCalledWith(
      'action',
      expect.any(Object),
      expect.any(Object),
      '0xadminsignature',
      { waitForReceipt: false },
    )
  })

  test('rejects action codes outside the contract allowlists', async () => {
    const res = await prepareIntentPOST(buildRequest({ action: 99, payload: {} }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid action code' })
    expect(registerIntentOnChain).not.toHaveBeenCalled()
  })

  test('rejects fields that do not belong to the selected action', async () => {
    const res = await prepareIntentPOST(buildRequest({
      action: ACTION_CODES.LAB_SET_URI,
      payload: { labId: 4, tokenURI: 'ipfs://new', price: 5 },
    }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Field price is not allowed for this intent action' })
    expect(registerIntentOnChain).not.toHaveBeenCalled()
  })

  test('resolves confirmed booking cancellation from chain and registers it as an action payload', async () => {
    const res = await prepareIntentPOST(buildRequest({
      action: ACTION_CODES.CANCEL_BOOKING,
      payload: { reservationKey: validReservationKey },
    }))

    expect(res.status).toBe(200)
    expect((await res.json()).kind).toBe('action')
    expect(buildActionIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTION_CODES.CANCEL_BOOKING,
      reservationKey: validReservationKey,
      labId: 9n,
      price: 123n,
    }))
  })

  test('prepares a reservation request through the unified action route', async () => {
    const res = await prepareIntentPOST(buildRequest({
      action: ACTION_CODES.REQUEST_BOOKING,
      payload: { labId: 22, start: nowSec + 1_000, timeslot: 120 },
      returnUrl: 'https://market.example/callback',
    }))
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.kind).toBe('reservation')
    expect(buildReservationIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTION_CODES.REQUEST_BOOKING,
      labId: 22n,
      start: BigInt(nowSec + 1_000),
      end: BigInt(nowSec + 1_120),
      price: 240n,
    }))
    expect(requestIntentAuthorizationSession).toHaveBeenCalledWith(expect.objectContaining({
      payloadKey: 'reservationPayload',
      returnUrl: 'https://market.example/callback',
    }))
    expect(registerIntentOnChain).toHaveBeenCalledWith(
      'reservation',
      expect.any(Object),
      expect.any(Object),
      '0xadminsignature',
      { waitForReceipt: false },
    )
  })

  test('uses DIRECT_BOOKING only when the institution owns the lab', async () => {
    const ownAddress = '0x00000000000000000000000000000000000000c1'
    getContractInstance.mockResolvedValueOnce({
      getLab: jest.fn().mockResolvedValue({ base: { price: 2n } }),
      getReservation: jest.fn(),
      ownerOf: jest.fn().mockResolvedValue(ownAddress),
    })
    resolveInstitutionAddressFromSession.mockResolvedValueOnce({ institutionAddress: ownAddress })

    const res = await prepareIntentPOST(buildRequest({
      action: ACTION_CODES.REQUEST_BOOKING,
      payload: { labId: 33, start: nowSec + 1_000, timeslot: 120 },
    }))

    expect(res.status).toBe(200)
    expect(buildReservationIntent).toHaveBeenCalledWith(expect.objectContaining({ action: 11 }))
  })

  test('prepares cancellation of a reservation request with the reservation payload', async () => {
    getContractInstance.mockResolvedValueOnce({
      getReservation: jest.fn().mockResolvedValue({
        labId: 9n,
        price: 123n,
        start: BigInt(nowSec + 300),
        end: BigInt(nowSec + 420),
        renter: '0x00000000000000000000000000000000000000a1',
        status: 0,
      }),
    })

    const res = await prepareIntentPOST(buildRequest({
      action: ACTION_CODES.CANCEL_REQUEST_BOOKING,
      payload: { reservationKey: validReservationKey },
    }))

    expect(res.status).toBe(200)
    expect((await res.json()).kind).toBe('reservation')
    expect(buildReservationIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTION_CODES.CANCEL_REQUEST_BOOKING,
      labId: 9n,
      start: BigInt(nowSec + 300),
      end: BigInt(nowSec + 420),
      price: 123n,
    }))
  })

  test('starts institutional authorization before waiting for the registration receipt', async () => {
    let releaseAuthorization
    requestIntentAuthorizationSession.mockImplementationOnce(() => new Promise((resolve) => {
      releaseAuthorization = resolve
    }))
    registerIntentOnChain.mockResolvedValueOnce({
      txHash: '0xparallel',
      wait: jest.fn().mockResolvedValue({ blockNumber: 777 }),
    })

    const responsePromise = prepareIntentPOST(buildRequest({
      action: ACTION_CODES.LAB_ADD,
      payload: validLabPayload,
    }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(requestIntentAuthorizationSession).toHaveBeenCalled()
    expect(registerIntentOnChain).toHaveBeenCalled()
    releaseAuthorization({ ok: true, status: 200, data: authorization })
    const res = await responsePromise

    expect(res.status).toBe(200)
    expect(notifyIntentRegistrationMined).toHaveBeenCalledWith(expect.objectContaining({
      txHash: '0xparallel',
      blockNumber: 777,
    }))
  })

  test('reports confirmed cleanup when authorization creation fails after registration', async () => {
    requestIntentAuthorizationSession.mockResolvedValueOnce({
      ok: false,
      status: 401,
      data: { message: 'invalid_intents_token' },
    })
    cancelIntentOnChain.mockResolvedValueOnce({ status: 'cancelled', txHash: '0xcancel' })

    const res = await prepareIntentPOST(buildRequest({
      action: ACTION_CODES.LAB_ADD,
      payload: validLabPayload,
    }))
    const payload = await res.json()

    expect(res.status).toBe(401)
    expect(payload).toMatchObject({
      code: 'INTENT_AUTHORIZATION_FAILED',
      intentCleanupStatus: 'confirmed',
    })
    expect(cancelIntentOnChain).toHaveBeenCalledWith('req-action-1')
  })

  test('does not allow a client-selected backend origin', async () => {
    const res = await prepareIntentPOST(buildRequest({
      action: ACTION_CODES.LAB_ADD,
      backendUrl: 'https://attacker.example',
      payload: { ...validLabPayload, backendUrl: 'https://attacker.example' },
    }))

    expect(res.status).toBe(200)
    expect(resolveInstitutionalBackendUrl).toHaveBeenCalledWith('uni.example')
    expect(requestIntentAuthorizationSession).toHaveBeenCalledWith(expect.objectContaining({
      backendUrl: 'https://ib.example',
    }))
  })
})
