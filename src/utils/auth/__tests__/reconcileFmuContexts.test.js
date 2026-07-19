/**
 * @jest-environment node
 */

import { gatewayFetch } from '@/utils/api/gatewayProxy'
import {
  FMU_CONTEXT_COOKIE,
  createFmuUserBinding,
  encodeFmuContexts,
  readFmuContextsFromCookieValue,
} from '../fmuSessionStore'
import { reconcileFmuContextsForSession } from '../reconcileFmuContexts'

jest.mock('@/utils/api/gatewayProxy', () => ({
  gatewayFetch: jest.fn(),
  buildGatewayTargetUrl: jest.fn((origin, path) => `${origin}${path}`),
}))

describe('reconcileFmuContextsForSession', () => {
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

  test('clears a capability belonging to another active identity', async () => {
    const stored = encodeFmuContexts([], {
      labId: '42',
      reservationKey: '0xaaa',
      gatewayOrigin: 'https://gateway-a.example.com',
      resourceSessionId: 'session_identifier_aaaaaaaa',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding: createFmuUserBinding({ id: 'user-a' }),
    })
    const response = { cookies: { set: jest.fn() } }

    await reconcileFmuContextsForSession(
      response,
      { get: (name) => name === FMU_CONTEXT_COOKIE ? { value: stored.encoded } : undefined },
      { id: 'user-b' },
    )

    expect(response.cookies.set).toHaveBeenCalledWith(
      FMU_CONTEXT_COOKIE,
      '',
      expect.objectContaining({ maxAge: 0 }),
    )
    expect(gatewayFetch).toHaveBeenCalledTimes(1)
  })

  test('rewrites and retains capabilities belonging to the same identity', async () => {
    const userBinding = createFmuUserBinding({ id: 'user-a' })
    const stored = encodeFmuContexts([], {
      labId: '42',
      reservationKey: '0xaaa',
      gatewayOrigin: 'https://gateway-a.example.com',
      resourceSessionId: 'session_identifier_aaaaaaaa',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      userBinding,
    })
    const response = { cookies: { set: jest.fn() } }

    await reconcileFmuContextsForSession(
      response,
      { get: (name) => name === FMU_CONTEXT_COOKIE ? { value: stored.encoded } : undefined },
      { id: 'user-a' },
    )

    const encoded = response.cookies.set.mock.calls[0][1]
    expect(readFmuContextsFromCookieValue(encoded)).toEqual([
      expect.objectContaining({
        reservationKey: '0xaaa',
        userBinding,
      }),
    ])
    expect(gatewayFetch).not.toHaveBeenCalled()
  })
})
