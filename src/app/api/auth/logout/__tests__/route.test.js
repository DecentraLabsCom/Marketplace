import { GET } from '../route'

// Mock next/headers
const mockCookieStore = { set: jest.fn(), delete: jest.fn(), get: jest.fn() }
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

// Mock sessionCookie
jest.mock('@/utils/auth/sessionCookie', () => ({
  clearSessionCookies: jest.fn(),
}))

// Mock next/server
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init) => ({
      ...init,
      body: data,
      json: async () => data,
    })),
  },
}))

import { cookies } from 'next/headers'
import { clearSessionCookies } from '@/utils/auth/sessionCookie'
import { NextResponse } from 'next/server'

describe('GET /api/auth/logout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    cookies.mockResolvedValue(mockCookieStore)
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('clears session cookies and returns success', async () => {
    const promise = GET()
    // skip the 100ms delay
    jest.runAllTimersAsync()
    const res = await promise

    expect(cookies).toHaveBeenCalled()
    expect(clearSessionCookies).toHaveBeenCalledWith(mockCookieStore)
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    )
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe('Session cleared successfully')
  })

  it('returns a timestamp in the response', async () => {
    const promise = GET()
    jest.runAllTimersAsync()
    const res = await promise

    expect(res.body.timestamp).toBeDefined()
    expect(typeof res.body.timestamp).toBe('string')
  })
})
