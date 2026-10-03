/** @jest-environment node */

import { GET } from '@/app/api/backend/access-policy/labs/[labId]/eligibility/route'
import { requireAuth } from '@/utils/auth/guards'
import { resolveBackendUrlForSession, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn(),
}))
jest.mock('@/utils/api/backendProxyHelpers', () => ({
  resolveBackendUrlForSession: jest.fn(),
  resolveForwardHeaders: jest.fn(),
}))

describe('access policy eligibility proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({ institutionalBackendSessionToken: 'institutional-session' })
    resolveBackendUrlForSession.mockResolvedValue({ backendUrl: 'https://ib.example', institutionDomain: 'uni.example' })
    resolveForwardHeaders.mockResolvedValue({ Authorization: 'Bearer service-token', 'Content-Type': 'application/json' })
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ allowed: false, reasonCode: 'DENY_POLICY_MATCH' }) })
  })

  test('forwards server-held credentials and preserves policy response', async () => {
    const response = await GET(new Request('https://marketplace.example/api/backend/access-policy/labs/7/eligibility?categories=Cybersecurity'), { params: Promise.resolve({ labId: '7' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ allowed: false })
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/access-policy/labs/7/eligibility'), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer service-token', 'X-Institutional-Session': 'institutional-session' }),
    }))
  })

  test('rejects malformed lab identifiers before backend access', async () => {
    const response = await GET(new Request('https://marketplace.example/api/backend/access-policy/labs/nope/eligibility'), { params: Promise.resolve({ labId: 'nope' }) })
    expect(response.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
