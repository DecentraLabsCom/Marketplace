/**
 * @jest-environment node
 */

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((error) =>
    new Response(JSON.stringify({ error: error?.message || 'guard error' }), {
      status: error?.status || 401,
      headers: { 'Content-Type': 'application/json' },
    })
  ),
}))

jest.mock('@/utils/intents/signInstitutionalActionIntent', () => ({
  ACTION_CODES: {
    LAB_ADD: 0,
    LAB_UPDATE: 1,
    LAB_DELETE: 2,
    LAB_LIST: 3,
    LAB_UNLIST: 4,
    LAB_SET_URI: 5,
    CANCEL_REQUEST_BOOKING: 6,
    CANCEL_BOOKING: 7,
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

jest.mock('@/utils/webauthn/service', () => ({
  ...jest.requireActual('@/utils/webauthn/service'),
  getPucFromSession: jest.fn(jest.requireActual('@/utils/webauthn/service').getPucFromSession),
}))

jest.mock('@/utils/intents/adminIntentSigner', () => ({
  signIntentMeta: jest.fn(),
  getAdminAddress: jest.fn(),
  registerIntentOnChain: jest.fn(),
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
  mapAuthorizationErrorCode: jest.fn(),
  normalizeAuthorizationResponse: jest.fn(),
  hasUsableAuthorizationSession: jest.fn(),
  resolveAuthorizationUrl: jest.fn(),
}))

jest.mock('@/utils/intents/onchainHelpers', () => ({
  extractOnchainErrorDetails: jest.fn(),
  resolveChainNowSec: jest.fn(),
}))

jest.mock('@/app/api/contract/utils/institutionSession', () => ({
  resolveInstitutionAddressFromSession: jest.fn(),
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
import { signIntentMeta, getAdminAddress, registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { serializeIntent } from '@/utils/intents/serialize'
import {
  getIntentBackendAuthToken,
  requestIntentAuthorizationSession,
  mapAuthorizationErrorCode,
  normalizeAuthorizationResponse,
  hasUsableAuthorizationSession,
  resolveAuthorizationUrl,
} from '@/utils/intents/backendClient'
import { extractOnchainErrorDetails, resolveChainNowSec } from '@/utils/intents/onchainHelpers'
import { POST as actionPreparePOST } from '../api/backend/intents/actions/prepare/route.js'
import { POST as reservationPreparePOST } from '../api/backend/intents/reservations/prepare/route.js'
import { clearReservationPrepareCache } from '../api/backend/intents/reservations/prepare/cache.js'

const buildRequest = (url, body) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('Intent prepare routes integration', () => {
  const nowSec = Math.floor(Date.now() / 1000)
  const validReservationKey = `0x${'12'.repeat(32)}`

  beforeEach(() => {
    jest.clearAllMocks()
    clearReservationPrepareCache()
    process.env.NEXT_PUBLIC_SAML_STABLE_USER_ID_MODE = 'principal'

    requireAuth.mockResolvedValue({
      id: 'alice@uned.es|targeted-alice',
      eduPersonPrincipalName: 'alice@uned.es',
      eduPersonTargetedID: 'targeted-alice',
      samlAssertion: '<Assertion>test</Assertion>',
      schacHomeOrganization: 'uni.example',
    })
    getPucFromSession.mockImplementation(
      jest.requireActual('@/utils/webauthn/service').getPucFromSession
    )
    resolveIntentExecutorForInstitution.mockResolvedValue('0x00000000000000000000000000000000000000a1')
    getAdminAddress.mockResolvedValue('0x00000000000000000000000000000000000000a2')
    resolveChainNowSec.mockResolvedValue(1_700_000_000)

    buildActionIntent.mockResolvedValue({
      meta: { requestId: 'req-action-1', requestedAt: 1_700_000_000, expiresAt: 1_700_000_300 },
      payload: { reservationKey: validReservationKey },
      typedData: { domain: {}, types: {}, message: {} },
    })
    computeAssertionHash.mockReturnValue('0xassertionhash')

    buildReservationIntent.mockResolvedValue({
      meta: { requestId: 'req-reservation-1', requestedAt: 1_700_000_000, expiresAt: 1_700_000_300 },
      payload: { reservationKey: validReservationKey },
      typedData: { domain: {}, types: {}, message: {} },
    })
    computeReservationAssertionHash.mockReturnValue('0xreservationassertionhash')

    signIntentMeta.mockResolvedValue('0xadminsignature')
    registerIntentOnChain.mockResolvedValue({ txHash: '0xontx' })

    getContractInstance.mockResolvedValue({
      getLab: jest.fn().mockResolvedValue({ base: { price: 2n } }),
      getReservation: jest.fn().mockResolvedValue({
        labId: 9n,
        price: 123n,
        renter: '0x00000000000000000000000000000000000000a3',
      }),
      ownerOf: jest.fn().mockResolvedValue('0x000000000000000000000000000000000000dead'),
    })

    resolveInstitutionAddressFromSession.mockResolvedValue({
      institutionAddress: '0x00000000000000000000000000000000000000a1',
      normalizedDomain: 'uni.example',
    })

    serializeIntent.mockImplementation((value) => value)

    getIntentBackendAuthToken.mockResolvedValue({
      token: 'backend-token',
      expiresAt: '2026-02-20T00:00:00Z',
    })
    requestIntentAuthorizationSession.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        sessionId: 'auth-session-1',
        ceremonyUrl: 'https://ib.example/intents/authorize/ceremony/auth-session-1',
        expiresAt: '2026-02-20T00:05:00Z',
      },
    })
    mapAuthorizationErrorCode.mockImplementation((message) =>
      message === 'webauthn_credential_not_registered'
        ? 'WEBAUTHN_CREDENTIAL_NOT_REGISTERED'
        : null
    )
    normalizeAuthorizationResponse.mockImplementation((value) => value)
    hasUsableAuthorizationSession.mockReturnValue(true)
    resolveAuthorizationUrl.mockReturnValue('https://ib.example/intents/authorize/ceremony/auth-session-1')

    extractOnchainErrorDetails.mockReturnValue({ message: 'onchain-details' })
  })

  test('actions/prepare: returns prepared action intent and authorization session', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/actions/prepare', {
      action: ACTION_CODES.LAB_ADD,
      backendUrl: 'https://ib.example',
      payload: {
        labId: 101,
        price: 7,
      },
    })

    const res = await actionPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload).toMatchObject({
      kind: 'action',
      requestId: 'req-action-1',
      backendUrl: 'https://ib.example',
      authorizationSessionId: 'auth-session-1',
      authorizationUrl: 'https://ib.example/intents/authorize/ceremony/auth-session-1',
      backendAuthToken: 'backend-token',
    })
    expect(buildActionIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTION_CODES.LAB_ADD,
      assertionHash: '0xassertionhash',
      labId: 101,
      price: 7,
      nowSec: 1_700_000_000,
    }))
    expect(requestIntentAuthorizationSession).toHaveBeenCalledWith(expect.objectContaining({
      payloadKey: 'actionPayload',
      backendUrl: 'https://ib.example',
      samlAssertion: '<Assertion>test</Assertion>',
      stableUserIdMode: 'principal',
    }))
  })

  test('actions/prepare: forwards principal-only puc hash from session into signed payload', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/actions/prepare', {
      action: ACTION_CODES.LAB_UPDATE,
      backendUrl: 'https://ib.example',
      payload: {
        labId: 101,
        price: 7,
      },
    })

    const res = await actionPreparePOST(req)

    expect(res.status).toBe(200)
    expect(buildActionIntent).toHaveBeenCalledWith(expect.objectContaining({
      pucHash: '0xbce2c1d251a51197dd0a6c8c4e88f5b0b9293db685fa945a60b289409c836f83',
    }))
  })

  test('actions/prepare: cancellation action resolves reservation snapshot before signing', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/actions/prepare', {
      action: ACTION_CODES.CANCEL_BOOKING,
      backendUrl: 'https://ib.example',
      payload: {
        reservationKey: validReservationKey,
      },
    })

    const res = await actionPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.kind).toBe('action')
    expect(buildActionIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTION_CODES.CANCEL_BOOKING,
      reservationKey: validReservationKey,
      labId: '9',
      price: '123',
    }))
  })

  test('actions/prepare: propagates mapped backend authorization errors', async () => {
    requestIntentAuthorizationSession.mockResolvedValueOnce({
      ok: false,
      status: 409,
      data: { error: 'webauthn_credential_not_registered' },
    })

    const req = buildRequest('http://localhost/api/backend/intents/actions/prepare', {
      action: ACTION_CODES.LAB_UPDATE,
      backendUrl: 'https://ib.example',
      payload: { labId: 11, price: 1 },
    })

    const res = await actionPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(409)
    expect(payload).toEqual({
      error: 'webauthn_credential_not_registered',
      code: 'WEBAUTHN_CREDENTIAL_NOT_REGISTERED',
    })
  })

  test('reservations/prepare: returns prepared reservation intent and authorization session', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/reservations/prepare', {
      labId: 22,
      start: nowSec + 1_000,
      timeslot: 120,
      backendUrl: 'https://ib.example',
      returnUrl: 'https://market.example/callback',
    })

    const res = await reservationPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload).toMatchObject({
      kind: 'reservation',
      requestId: 'req-reservation-1',
      backendUrl: 'https://ib.example',
      authorizationSessionId: 'auth-session-1',
      authorizationUrl: 'https://ib.example/intents/authorize/ceremony/auth-session-1',
      backendAuthToken: 'backend-token',
    })
    expect(buildReservationIntent).toHaveBeenCalledWith(expect.objectContaining({
      labId: 22,
      start: BigInt(nowSec + 1_000),
      end: BigInt(nowSec + 1_120),
      price: 240n,
      assertionHash: '0xreservationassertionhash',
      nowSec: 1_700_000_000,
    }))
    expect(requestIntentAuthorizationSession).toHaveBeenCalledWith(expect.objectContaining({
      payloadKey: 'reservationPayload',
      returnUrl: 'https://market.example/callback',
      stableUserIdMode: 'principal',
    }))
  })

  test('reservations/prepare: forwards principal-only puc hash from session into signed payload', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/reservations/prepare', {
      labId: 22,
      start: nowSec + 1_000,
      timeslot: 120,
      backendUrl: 'https://ib.example',
    })

    const res = await reservationPreparePOST(req)

    expect(res.status).toBe(200)
    expect(buildReservationIntent).toHaveBeenCalledWith(expect.objectContaining({
      pucHash: '0xbce2c1d251a51197dd0a6c8c4e88f5b0b9293db685fa945a60b289409c836f83',
    }))
  })

  test('reservations/prepare: rejects invalid authorization payload from backend', async () => {
    normalizeAuthorizationResponse.mockReturnValueOnce({
      sessionId: null,
      ceremonyUrl: null,
      authorizationUrl: null,
      expiresAt: null,
    })
    hasUsableAuthorizationSession.mockReturnValueOnce(false)

    const req = buildRequest('http://localhost/api/backend/intents/reservations/prepare', {
      labId: 4,
      start: nowSec + 200,
      timeslot: 60,
      backendUrl: 'https://ib.example',
    })

    const res = await reservationPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(502)
    expect(payload).toEqual({
      error: 'Invalid authorization response from institutional backend',
      code: 'INTENT_AUTHORIZATION_RESPONSE_INVALID',
    })
  })

  test('reservations/prepare: includes onchain error details when chain registration fails', async () => {
    registerIntentOnChain.mockRejectedValueOnce(new Error('chain boom'))

    const req = buildRequest('http://localhost/api/backend/intents/reservations/prepare', {
      labId: 5,
      start: nowSec + 300,
      timeslot: 60,
      backendUrl: 'https://ib.example',
    })

    const res = await reservationPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(502)
    expect(payload).toMatchObject({
      error: 'Failed to register reservation intent on-chain',
      details: 'chain boom',
      onchain: { message: 'onchain-details' },
    })
  })

  test('reservations/prepare: uses DIRECT_BOOKING action when institution owns the lab', async () => {
    const ownInstitutionAddress = '0x00000000000000000000000000000000000000c1'
    getContractInstance.mockResolvedValueOnce({
      getLab: jest.fn().mockResolvedValue({ base: { price: 2n } }),
      getReservation: jest.fn().mockResolvedValue({ labId: 9n, price: 123n, renter: ownInstitutionAddress }),
      ownerOf: jest.fn().mockResolvedValue(ownInstitutionAddress),
    })
    resolveInstitutionAddressFromSession.mockResolvedValueOnce({
      institutionAddress: ownInstitutionAddress,
      normalizedDomain: 'uni.example',
    })

    const req = buildRequest('http://localhost/api/backend/intents/reservations/prepare', {
      labId: 33,
      start: nowSec + 1_000,
      timeslot: 120,
      backendUrl: 'https://ib.example',
    })

    const res = await reservationPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(buildReservationIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: 11, // ACTION_CODES.DIRECT_BOOKING
    }))
    expect(payload.kind).toBe('reservation')
  })

  test('reservations/prepare: uses REQUEST_BOOKING action when institution does not own the lab', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/reservations/prepare', {
      labId: 44,
      start: nowSec + 1_000,
      timeslot: 120,
      backendUrl: 'https://ib.example',
    })

    const res = await reservationPreparePOST(req)

    expect(res.status).toBe(200)
    expect(buildReservationIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: 8, // ACTION_CODES.REQUEST_BOOKING
    }))
  })

  test('reservations/prepare: accepts explicit end for long-duration bookings', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/reservations/prepare', {
      labId: 22,
      start: nowSec + 1_000,
      end: nowSec + 87_400,
      duration: { unit: 'day', value: 1 },
      backendUrl: 'https://ib.example',
    })

    const res = await reservationPreparePOST(req)

    expect(res.status).toBe(200)
    expect(buildReservationIntent).toHaveBeenCalledWith(expect.objectContaining({
      start: BigInt(nowSec + 1_000),
      end: BigInt(nowSec + 87_400),
      price: 172_800n,
    }))
  })

  test('reservations/prepare: rejects explicit end before start', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/reservations/prepare', {
      labId: 22,
      start: nowSec + 1_000,
      end: nowSec + 999,
      backendUrl: 'https://ib.example',
    })

    const res = await reservationPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(payload).toEqual({ error: 'Reservation end must be after start' })
  })

  test('reservations/prepare: reuses stable cached admin and executor while refreshing lab reads', async () => {
    const contract = {
      getLab: jest.fn().mockResolvedValue({ base: { price: 2n } }),
      getReservation: jest.fn().mockResolvedValue({
        labId: 9n,
        price: 123n,
        renter: '0x00000000000000000000000000000000000000a3',
      }),
      ownerOf: jest.fn().mockResolvedValue('0x000000000000000000000000000000000000dead'),
    }
    getContractInstance.mockResolvedValue(contract)

    const requestBody = {
      labId: 55,
      start: nowSec + 1_000,
      timeslot: 120,
      backendUrl: 'https://ib.example',
    }

    const first = await reservationPreparePOST(buildRequest(
      'http://localhost/api/backend/intents/reservations/prepare',
      requestBody
    ))
    const second = await reservationPreparePOST(buildRequest(
      'http://localhost/api/backend/intents/reservations/prepare',
      { ...requestBody, start: nowSec + 2_000 }
    ))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(resolveIntentExecutorForInstitution).toHaveBeenCalledTimes(1)
    expect(getAdminAddress).toHaveBeenCalledTimes(1)
    expect(contract.getLab).toHaveBeenCalledTimes(2)
    expect(contract.ownerOf).toHaveBeenCalledTimes(2)
  })
})
