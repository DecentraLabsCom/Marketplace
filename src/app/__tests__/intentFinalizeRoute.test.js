/**
 * @jest-environment node
 */

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn(),
}))
jest.mock('@/utils/auth/institutionDomain', () => ({
  resolveInstitutionDomainFromSession: jest.fn(),
}))
jest.mock('@/utils/onboarding/institutionalBackend', () => ({
  resolveInstitutionalBackendUrl: jest.fn(),
}))
jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))
jest.mock('@/utils/intents/adminIntentSigner', () => ({
  registerIntentOnChain: jest.fn(),
}))
jest.mock('@/utils/intents/backendClient', () => ({
  getIntentAuthorizationStatus: jest.fn(),
  getIntentBackendAuthToken: jest.fn(),
  notifyIntentRegistrationMined: jest.fn(),
  notifyIntentRegistrationFailed: jest.fn(),
}))
jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn() },
}))

import { requireAuth } from '@/utils/auth/guards'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { registerIntentOnChain } from '@/utils/intents/adminIntentSigner'
import {
  getIntentAuthorizationStatus,
  getIntentBackendAuthToken,
  notifyIntentRegistrationMined,
  notifyIntentRegistrationFailed,
} from '@/utils/intents/backendClient'
import { POST } from '../api/backend/intents/finalize/route'

const meta = {
  requestId: `0x${'11'.repeat(32)}`,
  signer: '0x00000000000000000000000000000000000000a1',
  executor: '0x00000000000000000000000000000000000000b1',
  action: 8,
  payloadHash: `0x${'22'.repeat(32)}`,
  nonce: '123',
  requestedAt: '1700000000',
  expiresAt: '1700000900',
}
const payload = {
  executor: meta.executor,
  schacHomeOrganization: 'uni.example',
  pucHash: `0x${'33'.repeat(32)}`,
  assertionHash: `0x${'44'.repeat(32)}`,
  labId: '1',
  start: '1800000000',
  end: '1800003600',
  price: '100',
  reservationKey: `0x${'55'.repeat(32)}`,
}

const request = () => new Request('http://localhost/api/backend/intents/finalize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    kind: 'reservation',
    intent: { meta, payload },
    adminSignature: '0xsigned',
    authorizationSessionId: 'session-1',
  }),
})

describe('POST /api/backend/intents/finalize', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ schacHomeOrganization: 'uni.example' })
    resolveInstitutionDomainFromSession.mockReturnValue('uni.example')
    resolveInstitutionalBackendUrl.mockResolvedValue('https://gateway.uni.example')
    getIntentBackendAuthToken.mockResolvedValue({ token: 'server-token' })
    getIntentAuthorizationStatus.mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: 'SUCCESS', requestId: meta.requestId },
    })
    getContractInstance.mockResolvedValue({
      getIntent: jest.fn().mockResolvedValue({ state: 0 }),
    })
    registerIntentOnChain.mockResolvedValue({ txHash: '0xtx', blockNumber: 99 })
    notifyIntentRegistrationMined.mockResolvedValue({ ok: true, status: 202 })
    notifyIntentRegistrationFailed.mockResolvedValue({ ok: true, status: 202 })
  })

  test('registers only after backend confirms WebAuthn authorization', async () => {
    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(registerIntentOnChain).toHaveBeenCalledWith('reservation', meta, payload, '0xsigned')
    expect(notifyIntentRegistrationMined).toHaveBeenCalledWith(expect.objectContaining({
      requestId: meta.requestId,
      txHash: '0xtx',
      blockNumber: 99,
    }))
    expect(body.onChain).toMatchObject({ status: 'mined', alreadyRegistered: false })
  })

  test('does not register while authorization is pending', async () => {
    getIntentAuthorizationStatus.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { status: 'PENDING', requestId: meta.requestId },
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(registerIntentOnChain).not.toHaveBeenCalled()
  })

  test('retries idempotently when the same intent is already on-chain', async () => {
    getContractInstance.mockResolvedValueOnce({
      getIntent: jest.fn().mockResolvedValue({ ...meta, state: 1 }),
    })

    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(registerIntentOnChain).not.toHaveBeenCalled()
    expect(body.onChain.alreadyRegistered).toBe(true)
    expect(notifyIntentRegistrationMined).toHaveBeenCalled()
  })

  test('notifies backend when the registration receipt reverted', async () => {
    const error = new Error('execution reverted')
    error.receipt = { status: 0, hash: '0xreverted' }
    registerIntentOnChain.mockRejectedValueOnce(error)

    const response = await POST(request())

    expect(response.status).toBe(502)
    expect(notifyIntentRegistrationFailed).toHaveBeenCalledWith(expect.objectContaining({
      requestId: meta.requestId,
      event: 'registration_reverted',
      txHash: '0xreverted',
    }))
  })
})
