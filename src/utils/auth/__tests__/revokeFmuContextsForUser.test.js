/**
 * @jest-environment node
 */

import { gatewayFetch, buildGatewayTargetUrl } from '@/utils/api/gatewayProxy'
import {
  createFmuUserBinding,
  encodeFmuContexts,
  FMU_CONTEXT_COOKIE,
} from '../fmuSessionStore'
import { revokeFmuContextsExceptUser } from '../revokeFmuContexts'

jest.mock('@/utils/api/gatewayProxy', () => ({
  gatewayFetch: jest.fn(),
  buildGatewayTargetUrl: jest.fn((origin, path) => `${origin}${path}`),
}))

describe('revokeFmuContextsExceptUser', () => {
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

  test('revokes other identities and retains contexts for the newly authenticated user', async () => {
    const userABinding = createFmuUserBinding({ id: 'user-a' })
    const userBBinding = createFmuUserBinding({ id: 'user-b' })
    const stored = encodeFmuContexts([], {
      labId: '42',
      reservationKey: '0xaaa',
      gatewayOrigin: 'https://gateway-a.example.com',
      resourceSessionId: 'session_identifier_aaaaaaaa',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: userABinding,
    })

    const retained = await revokeFmuContextsExceptUser({
      get: (name) => name === FMU_CONTEXT_COOKIE ? { value: stored.encoded } : undefined,
    }, userBBinding)

    expect(retained).toEqual([])
    expect(gatewayFetch).toHaveBeenCalledTimes(1)
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

  test('retains active contexts that belong to the newly authenticated user', async () => {
    const userBBinding = createFmuUserBinding({ id: 'user-b' })
    let stored = encodeFmuContexts([], {
      labId: '43',
      reservationKey: '0xbbb',
      gatewayOrigin: 'https://gateway-b.example.com',
      resourceSessionId: 'session_identifier_bbbbbbbb',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: userBBinding,
    })
    stored = encodeFmuContexts(stored.contexts, {
      labId: '44',
      reservationKey: '0xccc',
      gatewayOrigin: 'https://gateway-c.example.com',
      resourceSessionId: 'session_identifier_cccccccc',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: userBBinding,
    })

    const retained = await revokeFmuContextsExceptUser({
      get: (name) => name === FMU_CONTEXT_COOKIE ? { value: stored.encoded } : undefined,
    }, userBBinding)

    expect(retained).toHaveLength(2)
    expect(retained.every((context) => context.userBinding === userBBinding)).toBe(true)
    expect(gatewayFetch).not.toHaveBeenCalled()
  })
})
