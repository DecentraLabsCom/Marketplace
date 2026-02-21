import {
  buildSignedOnboardingCallbackUrl,
  computeOnboardingCallbackHmac,
  extractCallbackTokenFromRequest,
  isOnboardingCallbackSignatureRequired,
  verifyOnboardingCallbackHmac,
  verifyOnboardingCallbackToken,
} from '@/utils/onboarding/callbackAuth'

function createMockRequest(url, headers = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  )

  return {
    url,
    headers: {
      get: (name) => normalizedHeaders.get(String(name).toLowerCase()) || null,
    },
  }
}

describe('callbackAuth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.ONBOARDING_CALLBACK_SECRET
    delete process.env.SESSION_SECRET
    delete process.env.ONBOARDING_CALLBACK_REQUIRE_SIGNATURE
    delete process.env.ONBOARDING_CALLBACK_HMAC_MAX_AGE_SECONDS
    delete process.env.ONBOARDING_CALLBACK_TOKEN_TTL_SECONDS
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('returns unsigned callback URL when signature is optional and no secret exists', () => {
    const baseUrl = 'https://marketplace.example/api/onboarding/callback'
    const result = buildSignedOnboardingCallbackUrl(baseUrl, {
      stableUserId: 'uid=one',
      institutionId: 'uned.es',
    })
    expect(result).toBe(baseUrl)
  })

  test('throws when signature is required but no secret configured', () => {
    process.env.ONBOARDING_CALLBACK_REQUIRE_SIGNATURE = 'true'
    expect(() =>
      buildSignedOnboardingCallbackUrl('https://marketplace.example/api/onboarding/callback')
    ).toThrow('Onboarding callback signature is required')
  })

  test('issues signed callback URL and verifies token claims', () => {
    process.env.SESSION_SECRET = 'c'.repeat(64)
    const signedUrl = buildSignedOnboardingCallbackUrl(
      'https://marketplace.example/api/onboarding/callback',
      {
        stableUserId: 'uid=abc',
        institutionId: 'uned.es',
      }
    )

    const request = createMockRequest(signedUrl)
    const token = extractCallbackTokenFromRequest(request)
    expect(typeof token).toBe('string')

    const verification = verifyOnboardingCallbackToken(token, {
      stableUserId: 'uid=abc',
      institutionId: 'uned.es',
    })
    expect(verification.ok).toBe(true)
  })

  test('detects token claim mismatches', () => {
    process.env.SESSION_SECRET = 'd'.repeat(64)
    const signedUrl = buildSignedOnboardingCallbackUrl(
      'https://marketplace.example/api/onboarding/callback',
      {
        stableUserId: 'uid=abc',
        institutionId: 'uned.es',
      }
    )

    const token = extractCallbackTokenFromRequest(createMockRequest(signedUrl))
    const verification = verifyOnboardingCallbackToken(token, {
      stableUserId: 'uid=other',
    })

    expect(verification.ok).toBe(false)
    expect(verification.code).toBe('STABLE_USER_MISMATCH')
  })

  test('verifies HMAC signature with timestamp and body', () => {
    process.env.SESSION_SECRET = 'e'.repeat(64)
    const rawBody = JSON.stringify({ status: 'SUCCESS', stableUserId: 'uid=abc' })
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = computeOnboardingCallbackHmac({
      rawBody,
      timestamp,
      secret: process.env.SESSION_SECRET,
    })

    const request = createMockRequest('https://marketplace.example/api/onboarding/callback', {
      'x-onboarding-signature': `sha256=${signature}`,
      'x-onboarding-timestamp': String(timestamp),
    })

    const verification = verifyOnboardingCallbackHmac(request, rawBody)
    expect(verification.ok).toBe(true)
  })

  test('reads required-signature flag', () => {
    expect(isOnboardingCallbackSignatureRequired()).toBe(false)
    process.env.ONBOARDING_CALLBACK_REQUIRE_SIGNATURE = 'true'
    expect(isOnboardingCallbackSignatureRequired()).toBe(true)
  })
})
