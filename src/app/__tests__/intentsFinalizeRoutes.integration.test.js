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

jest.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: jest.fn(),
}))

jest.mock('@simplewebauthn/server/helpers', () => ({
  isoBase64URL: {
    toBuffer: jest.fn(() => Buffer.from('public-key')),
  },
}))

jest.mock('@/utils/webauthn/config', () => ({
  getOriginFromRequest: jest.fn(),
  getRpId: jest.fn(),
}))

jest.mock('@/utils/webauthn/challenge', () => ({
  buildIntentChallenge: jest.fn(),
}))

jest.mock('@/utils/webauthn/store', () => ({
  getAssertionChallenge: jest.fn(),
  clearAssertionChallenge: jest.fn(),
  getCredentialById: jest.fn(),
  saveCredential: jest.fn(),
}))

jest.mock('@/utils/intents/adminIntentSigner', () => ({
  registerIntentOnChain: jest.fn(),
}))

jest.mock('@/utils/intents/serialize', () => ({
  serializeIntent: jest.fn(),
}))

jest.mock('@/utils/webauthn/service', () => ({
  getPucFromSession: jest.fn(),
}))

jest.mock('@/utils/intents/backendClient', () => ({
  getIntentBackendAuthToken: jest.fn(),
  submitIntentExecutionToBackend: jest.fn(),
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
import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { getOriginFromRequest, getRpId } from '@/utils/webauthn/config'
import { buildIntentChallenge } from '@/utils/webauthn/challenge'
import {
  getAssertionChallenge,
  clearAssertionChallenge,
  getCredentialById,
  saveCredential,
} from '@/utils/webauthn/store'
import { registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import { serializeIntent } from '@/utils/intents/serialize'
import { getPucFromSession } from '@/utils/webauthn/service'
import { getIntentBackendAuthToken, submitIntentExecutionToBackend } from '@/utils/intents/backendClient'
import { POST as actionFinalizePOST } from '../api/backend/intents/actions/finalize/route.js'
import { POST as reservationFinalizePOST } from '../api/backend/intents/reservations/finalize/route.js'

const baseRequestBody = {
  meta: {
    requestId: 'req-finalize-1',
    payloadHash: '0xpayloadhash',
  },
  payload: {
    reservationKey: `0x${'21'.repeat(32)}`,
  },
  adminSignature: '0xadminsignature',
  webauthnCredentialId: 'cred-1',
  webauthnClientDataJSON: 'clientData',
  webauthnAuthenticatorData: 'authenticatorData',
  webauthnSignature: 'signature',
  backendUrl: 'https://ib.example',
}

const buildRequest = (url, body = baseRequestBody) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('Intent finalize routes integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    requireAuth.mockResolvedValue({
      samlAssertion: '<Assertion>finalize</Assertion>',
    })
    getPucFromSession.mockReturnValue('puc-xyz')

    getAssertionChallenge.mockReturnValue({
      puc: 'puc-xyz',
      credentialId: 'cred-1',
      meta: { requestId: 'req-finalize-1', payloadHash: '0xpayloadhash' },
      payload: { reservationKey: `0x${'21'.repeat(32)}` },
      adminSignature: '0xstoredsignature',
      payloadHash: '0xpayloadhash',
      expectedChallenge: 'challenge-finalize',
      backendUrl: 'https://ib.example',
    })

    getCredentialById.mockReturnValue({
      credentialId: 'cred-1',
      cosePublicKey: 'cHVibGljS2V5',
      signCount: 1,
      rpId: 'ib.example',
    })

    buildIntentChallenge.mockReturnValue({ challenge: 'challenge-finalize' })
    getOriginFromRequest.mockReturnValue('https://market.example')
    getRpId.mockReturnValue('ib.example')

    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 2 },
    })

    registerIntentOnChain.mockResolvedValue({ txHash: '0xonchain' })
    serializeIntent.mockImplementation((value) => value)

    getIntentBackendAuthToken.mockResolvedValue({
      token: 'backend-token',
      expiresAt: '2026-02-20T00:00:00Z',
    })
    submitIntentExecutionToBackend.mockResolvedValue({
      ok: true,
      status: 201,
      body: { backendIntentId: 'intent-1' },
    })
  })

  test('actions/finalize: verifies assertion, registers on-chain, and forwards to backend', async () => {
    const res = await actionFinalizePOST(buildRequest('http://localhost/api/backend/intents/actions/finalize'))
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload).toMatchObject({
      verified: true,
      onChain: { txHash: '0xonchain' },
      backendError: null,
      backendResponse: {
        status: 201,
        body: { backendIntentId: 'intent-1' },
      },
      backendAuthToken: 'backend-token',
    })
    expect(saveCredential).toHaveBeenCalledWith(expect.objectContaining({ signCount: 2 }))
    expect(clearAssertionChallenge).toHaveBeenCalledWith('req-finalize-1')
    expect(submitIntentExecutionToBackend).toHaveBeenCalledWith(expect.objectContaining({
      payloadKey: 'actionPayload',
      backendUrl: 'https://ib.example',
      samlAssertion: '<Assertion>finalize</Assertion>',
    }))
  })

  test('actions/finalize: returns 400 when prepared challenge does not exist', async () => {
    getAssertionChallenge.mockReturnValueOnce(null)

    const res = await actionFinalizePOST(buildRequest('http://localhost/api/backend/intents/actions/finalize'))
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(payload).toEqual({ error: 'No prepared challenge found for this intent' })
  })

  test('actions/finalize: returns backendError when backend rejects execution', async () => {
    submitIntentExecutionToBackend.mockResolvedValueOnce({
      ok: false,
      status: 500,
      body: { error: 'backend failed' },
    })

    const res = await actionFinalizePOST(buildRequest('http://localhost/api/backend/intents/actions/finalize'))
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.backendError).toBe('Backend responded with status 500')
    expect(payload.backendResponse).toEqual({
      status: 500,
      body: { error: 'backend failed' },
    })
  })

  test('actions/finalize: stops with 502 and clears challenge when on-chain registration fails', async () => {
    registerIntentOnChain.mockRejectedValueOnce(new Error('onchain boom'))

    const res = await actionFinalizePOST(buildRequest('http://localhost/api/backend/intents/actions/finalize'))
    const payload = await res.json()

    expect(res.status).toBe(502)
    expect(payload).toMatchObject({
      error: 'Failed to register action intent on-chain',
      details: 'onchain boom',
    })
    expect(clearAssertionChallenge).toHaveBeenCalledWith('req-finalize-1')
  })

  test('reservations/finalize: verifies assertion, registers on-chain, and forwards reservation payload', async () => {
    const res = await reservationFinalizePOST(buildRequest('http://localhost/api/backend/intents/reservations/finalize'))
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload).toMatchObject({
      verified: true,
      onChain: { txHash: '0xonchain' },
      backendError: null,
      backendResponse: {
        status: 201,
        body: { backendIntentId: 'intent-1' },
      },
      backendAuthToken: 'backend-token',
    })
    expect(submitIntentExecutionToBackend).toHaveBeenCalledWith(expect.objectContaining({
      payloadKey: 'reservationPayload',
      backendUrl: 'https://ib.example',
    }))
  })

  test('reservations/finalize: rejects request when challenge puc does not match current session', async () => {
    getAssertionChallenge.mockReturnValueOnce({
      ...getAssertionChallenge(),
      puc: 'different-puc',
    })

    const res = await reservationFinalizePOST(buildRequest('http://localhost/api/backend/intents/reservations/finalize'))
    const payload = await res.json()

    expect(res.status).toBe(403)
    expect(payload).toEqual({ error: 'Challenge PUC mismatch' })
  })

  test('reservations/finalize: reports backend URL missing without failing finalized response', async () => {
    const stored = getAssertionChallenge()
    getAssertionChallenge.mockReturnValueOnce({
      ...stored,
      backendUrl: null,
    })

    const req = buildRequest('http://localhost/api/backend/intents/reservations/finalize', {
      ...baseRequestBody,
      backendUrl: null,
    })

    const res = await reservationFinalizePOST(req)
    const payload = await res.json()

    expect(res.status).toBe(200)
    expect(payload.backendError).toBe('Backend URL not configured')
    expect(submitIntentExecutionToBackend).not.toHaveBeenCalled()
  })
})
