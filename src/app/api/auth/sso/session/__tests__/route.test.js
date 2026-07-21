/** @jest-environment node */

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/auth/sessionCookie', () => ({
  getSessionFromCookies: jest.fn(),
}))
jest.mock('@/utils/auth/logoutProtection', () => ({
  createLogoutNonce: jest.fn(() => 'logout-nonce'),
}))

import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { GET } from '../route'

describe('GET /api/auth/sso/session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    cookies.mockResolvedValue({})
  })

  test('returns a temporary failure instead of logging the user out when storage is unavailable', async () => {
    getSessionFromCookies.mockRejectedValue({ code: 'SESSION_STORE_UNAVAILABLE' })

    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'Session temporarily unavailable' })
  })

  test('returns an unauthenticated response only when the session is absent', async () => {
    getSessionFromCookies.mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ user: null })
  })
})
