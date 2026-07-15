/**
 * @jest-environment node
 */

jest.mock('@/utils/api/backendProxyHelpers', () => ({
  resolveBackendUrlForSession: jest.fn(),
  resolveForwardHeaders: jest.fn(),
}))

jest.mock('@/utils/api/gatewayProxy', () => ({
  institutionalBackendFetch: jest.fn(),
}))

jest.mock('@/utils/auth/guards', () => ({
  handleGuardError: jest.fn((error) => new Response(
    JSON.stringify({ error: error.message }),
    { status: error.status || 401 },
  )),
}))

import { resolveBackendUrlForSession, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { GET as getIntentStatus } from '../[requestId]/route'
import { GET as getAuthorizationStatus } from '../authorize/status/[sessionId]/route'

describe('institutional intent status proxies', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resolveBackendUrlForSession.mockResolvedValue({
      backendUrl: 'https://canonical.example',
      institutionDomain: 'uni.example',
      session: { id: 'user-1' },
    })
    resolveForwardHeaders.mockResolvedValue({
      'Content-Type': 'application/json',
      Authorization: 'Bearer server-token',
    })
    institutionalBackendFetch.mockResolvedValue(new Response(
      JSON.stringify({ status: 'executed' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
  })

  test('ignores backendUrl query overrides for intent status', async () => {
    const request = new Request(
      'https://marketplace.example/api/backend/intents/req-1?backendUrl=https%3A%2F%2Fevil.example',
    )
    const response = await getIntentStatus(request, { params: { requestId: 'req-1' } })

    expect(response.status).toBe(200)
    expect(institutionalBackendFetch).toHaveBeenCalledWith(
      'https://canonical.example/intents/req-1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer server-token' }) }),
    )
  })

  test('ignores backendUrl query overrides for authorization status', async () => {
    const request = new Request(
      'https://marketplace.example/api/backend/intents/authorize/status/session-1?backendUrl=https%3A%2F%2Fevil.example',
    )
    const response = await getAuthorizationStatus(request, { params: { sessionId: 'session-1' } })

    expect(response.status).toBe(200)
    expect(institutionalBackendFetch).toHaveBeenCalledWith(
      'https://canonical.example/intents/authorize/status/session-1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer server-token' }) }),
    )
  })

  test('does not proxy status without a canonical backend', async () => {
    resolveBackendUrlForSession.mockResolvedValueOnce({
      backendUrl: null,
      institutionDomain: 'uni.example',
      session: { id: 'user-1' },
    })
    const request = new Request('https://marketplace.example/api/backend/intents/req-1')

    const response = await getIntentStatus(request, { params: { requestId: 'req-1' } })

    expect(response.status).toBe(400)
    expect(institutionalBackendFetch).not.toHaveBeenCalled()
  })
})
