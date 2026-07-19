/** @jest-environment node */

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

jest.mock('@/utils/auth/guards', () => {
  const actual = jest.requireActual('@/utils/auth/guards')
  return { ...actual, requireAuth: jest.fn() }
})

jest.mock('@/utils/auth/reconcileFmuContexts', () => ({
  reconcileFmuContextsForSession: jest.fn(),
}))

import { cookies } from 'next/headers'
import { requireAuth } from '@/utils/auth/guards'
import { reconcileFmuContextsForSession } from '@/utils/auth/reconcileFmuContexts'
import { GET } from '../route'

describe('GET /api/auth/sso/saml2/complete', () => {
  const cookieStore = { get: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_BASE_URL = 'https://market.example'
    requireAuth.mockResolvedValue({ id: 'user-2', email: 'user-2@example.com' })
    cookies.mockResolvedValue(cookieStore)
    reconcileFmuContextsForSession.mockResolvedValue(undefined)
  })

  test('reconciles FMU contexts after SAML creates the active session', async () => {
    const response = await GET(new Request('https://market.example/api/auth/sso/saml2/complete'))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://market.example/userdashboard?sso_login=1')
    expect(reconcileFmuContextsForSession).toHaveBeenCalledWith(
      response,
      cookieStore,
      { id: 'user-2', email: 'user-2@example.com' },
    )
  })
})
