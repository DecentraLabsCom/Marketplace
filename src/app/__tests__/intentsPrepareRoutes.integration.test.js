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
    REQUEST_FUNDS: 8,
  },
  buildActionIntent: jest.fn(),
  computeAssertionHash: jest.fn(),
}))

jest.mock('@/utils/intents/signInstitutionalReservationIntent', () => ({
  buildReservationIntent: jest.fn(),
  computeReservationAssertionHash: jest.fn(),
}))

jest.mock('@/utils/intents/resolveIntentExecutor', () => ({
  resolveIntentExecutorForInstitution: jest.fn(),
}))

jest.mock('@/utils/webauthn/service', () => ({
  getPucFromSession: jest.fn(),
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

    requireAuth.mockResolvedValue({
      samlAssertion: '<Assertion>test</Assertion>',
      schacHomeOrganization: 'uni.example',
    })
    getPucFromSession.mockReturnValue('puc-123')
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

  test('actions/prepare: request funds requires valid labId and maxBatch payload', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/actions/prepare', {
      action: ACTION_CODES.REQUEST_FUNDS,
      backendUrl: 'https://ib.example',
      payload: {
        labId: '12',
        maxBatch: 25,
      },
    })

    const res = await actionPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.kind).toBe('action')
    expect(buildActionIntent).toHaveBeenCalledWith(expect.objectContaining({
      action: ACTION_CODES.REQUEST_FUNDS,
      labId: 12,
      maxBatch: 25,
    }))
  })

  test('actions/prepare: request funds rejects missing maxBatch', async () => {
    const req = buildRequest('http://localhost/api/backend/intents/actions/prepare', {
      action: ACTION_CODES.REQUEST_FUNDS,
      backendUrl: 'https://ib.example',
      payload: {
        labId: 12,
      },
    })

    const res = await actionPreparePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(payload.error).toContain('maxBatch')
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
      start: nowSec + 1_000,
      assertionHash: '0xreservationassertionhash',
      nowSec: 1_700_000_000,
    }))
    expect(requestIntentAuthorizationSession).toHaveBeenCalledWith(expect.objectContaining({
      payloadKey: 'reservationPayload',
      returnUrl: 'https://market.example/callback',
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
})
