/**
 * @jest-environment node
 */

import { gatewayFetch, buildGatewayTargetUrl } from '@/utils/api/gatewayProxy'
import {
  FMU_CONTEXT_COOKIE,
  createFmuUserBinding,
  encodeFmuContexts,
} from '../fmuSessionStore'
import { revokeFmuContexts } from '../revokeFmuContexts'

jest.mock('@/utils/api/gatewayProxy', () => ({
  gatewayFetch: jest.fn(),
  buildGatewayTargetUrl: jest.fn((origin, path) => `${origin}${path}`),
}))

describe('revokeFmuContexts', () => {
  const originalSecret = process.env.SESSION_SECRET

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters'
  })

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = originalSecret
  })

  beforeEach(() => {
    jest.clearAllMocks()
    gatewayFetch.mockResolvedValue({ ok: true, status: 204 })
  })

  test('revokes every active reservation ticket through its gateway', async () => {
    const binding = createFmuUserBinding({ id: 'user-1' })
    let stored = encodeFmuContexts([], {
      labId: '42',
      reservationKey: '0xaaa',
      gatewayOrigin: 'https://gateway-a.example.com',
      resourceSessionId: 'session_identifier_aaaaaaaa',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: binding,
    })
    stored = encodeFmuContexts(stored.contexts, {
      labId: '43',
      reservationKey: '0xbbb',
      gatewayOrigin: 'https://gateway-b.example.com',
      resourceSessionId: 'session_identifier_bbbbbbbb',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: binding,
    })

    await revokeFmuContexts({ get: (name) => (
      name === FMU_CONTEXT_COOKIE ? { value: stored.encoded } : undefined
    ) })

    expect(gatewayFetch).toHaveBeenCalledTimes(2)
    expect(buildGatewayTargetUrl).toHaveBeenCalledWith(
      'https://gateway-a.example.com', '/auth/fmu/revoke',
    )
    expect(gatewayFetch).toHaveBeenCalledWith(
      'https://gateway-a.example.com/auth/fmu/revoke',
      expect.objectContaining({
        method: 'POST',
        headers: { Cookie: 'FMU_SESSION=session_identifier_aaaaaaaa' },
      }),
    )
  })

  test('does not make logout fail when a gateway cannot be reached', async () => {
    gatewayFetch.mockRejectedValue(new Error('gateway unavailable'))

    const stored = encodeFmuContexts([], {
      labId: '42',
      reservationKey: '0xaaa',
      gatewayOrigin: 'https://gateway.example.com',
      resourceSessionId: 'session_identifier_aaaaaaaa',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: createFmuUserBinding({ id: 'user-1' }),
    })

    await expect(revokeFmuContexts({
      get: () => ({ value: stored.encoded }),
    })).resolves.toBeUndefined()
  })
})
