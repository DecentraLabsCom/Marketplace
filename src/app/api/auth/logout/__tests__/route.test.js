/**
 * @jest-environment node
 */

import { cookies } from 'next/headers'
import { clearSessionCookies } from '@/utils/auth/sessionCookie'
import { FMU_CONTEXT_COOKIE } from '@/utils/auth/fmuSessionStore'
import { revokeFmuContexts } from '@/utils/auth/revokeFmuContexts'

jest.mock('next/headers', () => ({ cookies: jest.fn() }))
jest.mock('@/utils/auth/sessionCookie', () => ({ clearSessionCookies: jest.fn() }))
jest.mock('@/utils/auth/revokeFmuContexts', () => ({ revokeFmuContexts: jest.fn() }))

describe('GET /api/auth/logout', () => {
  test('clears both the Marketplace session and the path-scoped FMU contexts', async () => {
    const cookieStore = { set: jest.fn() }
    cookies.mockResolvedValue(cookieStore)

    const { GET } = await import('../route')
    const response = await GET()

    expect(response.status).toBe(200)
    expect(revokeFmuContexts).toHaveBeenCalledWith(cookieStore)
    expect(clearSessionCookies).toHaveBeenCalledWith(cookieStore)
    expect(cookieStore.set).toHaveBeenCalledWith(
      FMU_CONTEXT_COOKIE,
      '',
      expect.objectContaining({
        httpOnly: true,
        maxAge: 0,
        path: '/api',
        sameSite: 'lax',
      }),
    )
  })
})
