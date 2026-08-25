/**
 * @jest-environment node
 */

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

jest.mock('@/utils/auth/sessionCookie', () => ({
  getSessionFromCookies: jest.fn(),
}))

jest.mock('@/utils/api/gatewayProxy', () => ({
  institutionalBackendFetch: jest.fn(),
}))

jest.mock('@/utils/onboarding/serverOnboarding', () => ({
  createOnboardingBackendHeaders: jest.fn(),
  getOnboardingContext: jest.fn(),
  OnboardingContextError: class OnboardingContextError extends Error {
    constructor(message, status = 400, code = 'ONBOARDING_CONTEXT_INVALID') {
      super(message)
      this.status = status
      this.code = code
    }
  },
}))

jest.mock('@/utils/api/rateLimit', () => ({
  createRateLimiter: jest.fn(() => jest.fn()),
  createRateLimitResponse: jest.fn((result) => {
    if (!result?.limited && !result?.unavailable) return null

    const status = result.unavailable ? 503 : 429
    const error = result.unavailable
      ? 'Rate limiting is temporarily unavailable. Please try again later.'
      : 'Too many requests - please try again later'
    return new Response(JSON.stringify({ error }), {
      status,
      headers: { 'Retry-After': String(result.retryAfterSec || 5) },
    })
  }),
}))

jest.mock('@/utils/security/publicError', () => ({
  publicErrorResponse: jest.fn(({ status, code, message }) => Response.json(
    { error: message, code },
    { status },
  )),
  sanitizeErrorForLog: jest.fn((error) => ({ message: error?.message })),
}))

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}))

import { GET as getOnboardingStatus } from '../api/onboarding/status/[sessionId]/route.js'

const { cookies: mockCookies } = jest.requireMock('next/headers')
const { getSessionFromCookies: mockGetSessionFromCookies } =
  jest.requireMock('@/utils/auth/sessionCookie')
const { institutionalBackendFetch: mockInstitutionalBackendFetch } =
  jest.requireMock('@/utils/api/gatewayProxy')
const {
  createOnboardingBackendHeaders: mockCreateOnboardingBackendHeaders,
  getOnboardingContext: mockGetOnboardingContext,
  OnboardingContextError,
} = jest.requireMock('@/utils/onboarding/serverOnboarding')
const {
  createRateLimiter: mockCreateRateLimiter,
  createRateLimitResponse: mockCreateRateLimitResponse,
} = jest.requireMock('@/utils/api/rateLimit')
const { publicErrorResponse: mockPublicErrorResponse } =
  jest.requireMock('@/utils/security/publicError')
const { error: mockDevLogError } = jest.requireMock('@/utils/dev/logger').default
const mockCheckRate = mockCreateRateLimiter.mock.results[0].value

const cookieStore = { getAll: jest.fn(() => []) }
const session = {
  id: 'marketplace-session-1',
  isSSO: true,
  email: 'alice@example.edu',
}
const context = {
  backendUrl: 'https://backend.example.edu',
  stableUserId: 'alice@example.edu',
  institutionId: 'example.edu',
  session,
}
const backendHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer institutional-service-token',
}

function buildRequest() {
  return new Request('https://marketplace.example/api/onboarding/status/session-1')
}

function callRoute(sessionId) {
  return getOnboardingStatus(buildRequest(), {
    params: Promise.resolve({ sessionId }),
  })
}

describe('GET /api/onboarding/status/[sessionId]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCookies.mockResolvedValue(cookieStore)
    mockGetSessionFromCookies.mockResolvedValue(session)
    mockCheckRate.mockResolvedValue({ limited: false, remaining: 29 })
    mockGetOnboardingContext.mockResolvedValue(context)
    mockCreateOnboardingBackendHeaders.mockResolvedValue(backendHeaders)
    mockInstitutionalBackendFetch.mockResolvedValue(new Response(JSON.stringify({
      status: 'IN_PROGRESS',
      success: false,
      sessionId: 'session-1',
      institutionId: 'example.edu',
    }), { status: 200 }))
  })

  test('rejects a non-SSO session before rate limiting or backend access', async () => {
    mockGetSessionFromCookies.mockResolvedValue({
      ...session,
      isSSO: false,
    })

    const response = await callRoute('session-1')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'SSO session required' })
    expect(mockCheckRate).not.toHaveBeenCalled()
    expect(mockGetOnboardingContext).not.toHaveBeenCalled()
    expect(mockInstitutionalBackendFetch).not.toHaveBeenCalled()
  })

  test('rejects a missing sessionId before reading the session', async () => {
    const response = await callRoute(undefined)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Missing sessionId parameter' })
    expect(mockCookies).not.toHaveBeenCalled()
    expect(mockGetSessionFromCookies).not.toHaveBeenCalled()
  })

  test('encodes sessionId as one backend path segment and forwards scoped headers', async () => {
    const sessionId = 'session/with space?attempt=1'

    const response = await callRoute(sessionId)

    expect(response.status).toBe(200)
    expect(mockCookies).toHaveBeenCalledTimes(1)
    expect(mockGetSessionFromCookies).toHaveBeenCalledWith(cookieStore)
    expect(mockCheckRate).toHaveBeenCalledWith(buildRequest(), session)
    expect(mockGetOnboardingContext).toHaveBeenCalledTimes(1)
    expect(mockCreateOnboardingBackendHeaders).toHaveBeenCalledWith(context)
    expect(mockInstitutionalBackendFetch).toHaveBeenCalledWith(
      'https://backend.example.edu/onboarding/webauthn/status/session%2Fwith%20space%3Fattempt%3D1',
      { headers: backendHeaders, cache: 'no-store' },
    )
  })

  test('falls back to a pending marketplace result when the backend returns a non-OK response', async () => {
    mockInstitutionalBackendFetch.mockResolvedValue(new Response('backend unavailable', { status: 503 }))

    const response = await callRoute('session-1')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      sessionId: 'session-1',
      status: 'PENDING',
      source: 'marketplace',
    })
    expect(mockPublicErrorResponse).not.toHaveBeenCalled()
  })

  test.each([
    ['SUCCESS', false],
    ['COMPLETED', false],
    ['FAILED', true],
    ['EXPIRED', true],
  ])('returns terminal status %s without exposing backend material', async (status, includesPublicError) => {
    mockInstitutionalBackendFetch.mockResolvedValue(new Response(JSON.stringify({
      status,
      success: status === 'SUCCESS' || status === 'COMPLETED',
      sessionId: 'session-1',
      institutionId: 'example.edu',
      timestamp: '2026-08-25T10:00:00.000Z',
      stableUserId: 'alice@example.edu',
      credentialId: 'credential-secret',
      publicKey: 'cose-key-secret',
      error: 'backend stack trace and token',
    }), { status: 200 }))

    const response = await callRoute('session-1')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      source: 'institutional-backend',
      status,
      sessionId: 'session-1',
      institutionId: 'example.edu',
      timestamp: '2026-08-25T10:00:00.000Z',
    })
    expect(body).not.toHaveProperty('stableUserId')
    expect(body).not.toHaveProperty('credentialId')
    expect(body).not.toHaveProperty('publicKey')
    expect(body).not.toHaveProperty('error', 'backend stack trace and token')
    if (includesPublicError) {
      expect(body.error).toBe('Onboarding could not be completed.')
    } else {
      expect(body).not.toHaveProperty('error')
    }
  })

  test('returns a generic public error when the backend request fails', async () => {
    const backendError = new Error('backend token leaked by dependency')
    mockInstitutionalBackendFetch.mockRejectedValue(backendError)

    const response = await callRoute('session-1')
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'The onboarding status could not be checked.',
      code: 'ONBOARDING_STATUS_FAILED',
    })
    expect(JSON.stringify(body)).not.toContain('backend token')
    expect(mockDevLogError).toHaveBeenCalled()
    expect(mockPublicErrorResponse).toHaveBeenCalledWith(expect.objectContaining({
      status: 500,
      code: 'ONBOARDING_STATUS_FAILED',
      error: backendError,
    }))
  })

  test('returns the public context error when the backend is not configured', async () => {
    mockGetOnboardingContext.mockRejectedValue(new OnboardingContextError(
      'Institution backend URL not available',
      424,
      'BACKEND_NOT_CONFIGURED',
    ))

    const response = await callRoute('session-1')

    expect(response.status).toBe(424)
    await expect(response.json()).resolves.toEqual({
      error: 'Institution backend URL not available',
      code: 'BACKEND_NOT_CONFIGURED',
    })
    expect(mockInstitutionalBackendFetch).not.toHaveBeenCalled()
  })

  test('returns 429 and does not access onboarding state when rate limited', async () => {
    mockCheckRate.mockResolvedValue({ limited: true, remaining: 0, retryAfterSec: 11 })

    const request = buildRequest()
    const response = await getOnboardingStatus(request, {
      params: Promise.resolve({ sessionId: 'session-1' }),
    })

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('11')
    await expect(response.json()).resolves.toEqual({
      error: 'Too many requests - please try again later',
    })
    expect(mockCheckRate).toHaveBeenCalledWith(request, session)
    expect(mockGetOnboardingContext).not.toHaveBeenCalled()
    expect(mockInstitutionalBackendFetch).not.toHaveBeenCalled()
    expect(mockCreateRateLimitResponse).toHaveBeenCalledWith({
      limited: true,
      remaining: 0,
      retryAfterSec: 11,
    })
  })
})
