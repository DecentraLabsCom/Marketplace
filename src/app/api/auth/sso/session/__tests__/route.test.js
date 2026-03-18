import { GET } from '../route'

// Mock next/headers
const mockCookieStore = { get: jest.fn() }
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

// Mock dependencies
jest.mock('@/utils/auth/sessionCookie', () => ({
  getSessionFromCookies: jest.fn(),
}))
jest.mock('@/utils/auth/publicSessionUser', () => ({
  sanitizeSessionUserForClient: jest.fn(),
}))
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data) => ({ body: data, json: async () => data })),
  },
}))

import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { sanitizeSessionUserForClient } from '@/utils/auth/publicSessionUser'
import { NextResponse } from 'next/server'

describe('GET /api/auth/sso/session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    cookies.mockResolvedValue(mockCookieStore)
  })

  it('returns { user: null } when there is no session', async () => {
    getSessionFromCookies.mockReturnValue(null)

    const res = await GET()

    expect(getSessionFromCookies).toHaveBeenCalledWith(mockCookieStore)
    expect(NextResponse.json).toHaveBeenCalledWith({ user: null })
    expect(res.body).toEqual({ user: null })
  })

  it('returns sanitized user when session exists', async () => {
    const rawSession = { id: 'user-1', wallet: '0xABC', secret: 'hidden' }
    const sanitized = { id: 'user-1', wallet: '0xABC' }
    getSessionFromCookies.mockReturnValue(rawSession)
    sanitizeSessionUserForClient.mockReturnValue(sanitized)

    const res = await GET()

    expect(sanitizeSessionUserForClient).toHaveBeenCalledWith(rawSession)
    expect(NextResponse.json).toHaveBeenCalledWith({ user: sanitized })
    expect(res.body).toEqual({ user: sanitized })
  })

  it('does not call sanitize when session is null', async () => {
    getSessionFromCookies.mockReturnValue(null)
    await GET()
    expect(sanitizeSessionUserForClient).not.toHaveBeenCalled()
  })
})
