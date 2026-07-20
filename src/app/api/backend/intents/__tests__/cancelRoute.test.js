/**
 * @jest-environment node
 */

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((error) => new Response(
    JSON.stringify({ error: error.message }),
    { status: error.status || 401 },
  )),
}))

jest.mock('@/utils/api/backendProxyHelpers', () => ({
  resolveBackendUrlForSession: jest.fn(),
  resolveForwardHeaders: jest.fn(),
}))

jest.mock('@/utils/api/gatewayProxy', () => ({
  institutionalBackendFetch: jest.fn(),
}))

jest.mock('@/utils/intents/adminIntentSigner', () => ({
  cancelIntentOnChain: jest.fn(),
}))

jest.mock('@/utils/intents/intentNonceStore', () => ({
  getServerSignerAddress: jest.fn(() => '0xsigner'),
  withIntentSignerLock: jest.fn((_signer, callback) => callback()),
}))

jest.mock('@/utils/intents/intentLifecycleStore', () => ({
  getRegisteredIntent: jest.fn(),
  removeRegisteredIntent: jest.fn(),
}))

import { requireAuth } from '@/utils/auth/guards'
import { resolveBackendUrlForSession, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { cancelIntentOnChain } from '@/utils/intents/adminIntentSigner'
import { getRegisteredIntent, removeRegisteredIntent } from '@/utils/intents/intentLifecycleStore'
import { POST } from '../[requestId]/cancel/route'

describe('POST /api/backend/intents/:requestId/cancel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ schacHomeOrganization: 'uni.example' })
    resolveBackendUrlForSession.mockResolvedValue({
      backendUrl: 'https://canonical.example',
      institutionDomain: 'uni.example',
    })
    resolveForwardHeaders.mockResolvedValue({ Authorization: 'Bearer server-token' })
    getRegisteredIntent.mockResolvedValue({
      requestId: 'req-1',
      authorizationSessionId: 'session-1',
      institutionDomain: 'uni.example',
    })
    institutionalBackendFetch.mockResolvedValue(new Response(
      JSON.stringify({ requestId: 'req-1', status: 'PENDING' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    cancelIntentOnChain.mockResolvedValue({ status: 'cancelled', txHash: '0xcancel' })
  })

  test('cancels only the intent bound to the authenticated authorization session', async () => {
    const response = await POST(
      new Request('https://marketplace.example/api/backend/intents/req-1/cancel', {
        method: 'POST',
        body: JSON.stringify({ authorizationSessionId: 'session-1' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: { requestId: 'req-1' } },
    )

    expect(response.status).toBe(200)
    expect(cancelIntentOnChain).toHaveBeenCalledWith('req-1')
    expect(removeRegisteredIntent).toHaveBeenCalledWith('req-1')
  })

  test('rejects a session/request mismatch before touching the chain', async () => {
    const response = await POST(
      new Request('https://marketplace.example/api/backend/intents/req-1/cancel', {
        method: 'POST',
        body: JSON.stringify({ authorizationSessionId: 'other-session' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      { params: { requestId: 'req-1' } },
    )

    expect(response.status).toBe(403)
    expect(cancelIntentOnChain).not.toHaveBeenCalled()
  })
})
