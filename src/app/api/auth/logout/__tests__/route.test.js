/** @jest-environment node */

import { cookies } from 'next/headers'
import {
  clearSessionCookies,
  getSessionFromCookies,
} from '@/utils/auth/sessionCookie'
import { FMU_CONTEXT_COOKIE } from '@/utils/auth/fmuSessionStore'
import {
  revokeFmuContexts,
  revokeFmuContextsForSession,
} from '@/utils/auth/revokeFmuContexts'
import { isValidLogoutNonce } from '@/utils/auth/logoutProtection'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/auth/sessionCookie', () => ({
  clearSessionCookies: jest.fn(),
  getSessionFromCookies: jest.fn(),
}))
jest.mock('@/utils/auth/revokeFmuContexts', () => ({
  revokeFmuContexts: jest.fn(),
  revokeFmuContextsForSession: jest.fn(),
}))
jest.mock('@/utils/auth/logoutProtection', () => ({
  isValidLogoutNonce: jest.fn(),
}))

describe('/api/auth/logout', () => {
  const sessionId = 'a'.repeat(43)
  const cookieStore = { set: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    cookies.mockResolvedValue(cookieStore)
    getSessionFromCookies.mockResolvedValue({ sessionId })
    isValidLogoutNonce.mockReturnValue(true)
  })

  test('does not mutate state on GET', async () => {
    const { GET } = await import('../route')
    const response = await GET()

    expect(response.status).toBe(405)
    expect(cookies).not.toHaveBeenCalled()
    expect(revokeFmuContexts).not.toHaveBeenCalled()
  })

  test('requires same-origin POST and a session-bound token before clearing state', async () => {
    const { POST } = await import('../route')
    const response = await POST(new Request('https://market.example/api/auth/logout', {
      method: 'POST',
      headers: {
        Origin: 'https://market.example',
        'X-CSRF-Token': 'nonce',
      },
    }))

    expect(response.status).toBe(200)
    expect(isValidLogoutNonce).toHaveBeenCalledWith(sessionId, 'nonce')
    expect(revokeFmuContexts).toHaveBeenCalledWith(cookieStore)
    expect(revokeFmuContextsForSession).toHaveBeenCalledWith(sessionId)
    expect(clearSessionCookies).toHaveBeenCalledWith(cookieStore)
    expect(cookieStore.set).toHaveBeenCalledWith(
      FMU_CONTEXT_COOKIE,
      '',
      expect.objectContaining({ maxAge: 0, path: '/api', sameSite: 'lax' }),
    )
  })

  test('rejects cross-site POSTs without touching the session', async () => {
    const { POST } = await import('../route')
    const response = await POST(new Request('https://market.example/api/auth/logout', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', 'X-CSRF-Token': 'nonce' },
    }))

    expect(response.status).toBe(403)
    expect(cookies).not.toHaveBeenCalled()
    expect(revokeFmuContexts).not.toHaveBeenCalled()
  })
})
