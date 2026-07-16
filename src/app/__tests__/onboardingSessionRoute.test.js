/**
 * @jest-environment node
 */

import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { extractStableUserId } from '@/utils/onboarding'

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

jest.mock('@/utils/auth/sessionCookie', () => ({
  getSessionFromCookies: jest.fn(),
}))

jest.mock('@/utils/onboarding', () => ({
  extractStableUserId: jest.fn(),
}))

jest.mock('@/utils/intents/signInstitutionalActionIntent', () => ({
  computeAssertionHash: jest.fn(() => 'assertion-hash'),
}))

jest.mock('@/utils/onboarding/callbackAuth', () => ({
  buildSignedOnboardingCallbackUrl: jest.fn(() => 'https://market.example/api/onboarding/callback?token=signed'),
}))

jest.mock('@/utils/auth/institutionDomain', () => ({
  resolveInstitutionDomainFromSession: jest.fn(() => 'uned.es'),
}))


jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    error: jest.fn(),
  },
}))

describe('/api/onboarding/session route', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SAML_STABLE_USER_ID_MODE: 'principal_targeted_id',
      NEXT_PUBLIC_BASE_URL: 'https://market.example',
    }
    cookies.mockResolvedValue({})
    extractStableUserId.mockReturnValue('alice@uned.es')
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('returns only non-sensitive onboarding metadata', async () => {
    getSessionFromCookies.mockReturnValue({
      isSSO: true,
      eduPersonPrincipalName: 'alice@uned.es',
      email: 'alice@uned.es',
      name: 'Alice',
      role: 'student',
      scopedRole: 'student@uned.es',
      samlAssertion: 'assertion',
    })

    const { GET } = await import('../api/onboarding/session/route.js')

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.meta).toMatchObject({
      stableUserId: 'alice@uned.es',
      institutionId: 'uned.es',
    })
    expect(json).not.toHaveProperty('payload')
    expect(json).not.toHaveProperty('auth')
  })
})
