import {
  OnboardingErrorCode,
  OnboardingStatus,
  checkOnboardingStatus,
  checkUserOnboardingStatus,
  extractStableUserId,
  initiateInstitutionalOnboarding,
} from '../institutionalOnboarding'

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}))

jest.mock('@/utils/intents/signInstitutionalActionIntent', () => ({
  __esModule: true,
  computeAssertionHash: jest.fn(() => 'hash'),
}))

jest.mock('../institutionalBackend', () => ({
  __esModule: true,
  resolveInstitutionalBackendUrl: jest.fn().mockResolvedValue('https://backend.example'),
}))

describe('institutionalOnboarding', () => {
  const originalEnv = process.env

  beforeEach(() => {
    global.fetch = jest.fn()
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.INSTITUTION_BACKEND_SP_API_KEY
    delete process.env.INSTITUTIONAL_REQUIRE_SP_API_KEY
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('extractStableUserId respects priority order', () => {
    expect(extractStableUserId({ personalUniqueCode: 'puc' })).toBe('puc')
    expect(extractStableUserId({ schacPersonalUniqueCode: 'spuc' })).toBe('spuc')
    expect(extractStableUserId({ scopedRole: 'user@uned.es' })).toBe('user@uned.es')
    expect(extractStableUserId({ id: 'uid', affiliation: 'uned.es' })).toBe('uid@uned.es')
    expect(extractStableUserId({ email: 'a@uned.es' })).toBe('a@uned.es')
    expect(extractStableUserId(null)).toBeNull()
  })

  test('initiateInstitutionalOnboarding validates required inputs', async () => {
    await expect(initiateInstitutionalOnboarding({ userData: null, callbackUrl: 'cb' })).rejects.toThrow(
      OnboardingErrorCode.MISSING_USER_DATA,
    )

    await expect(
      initiateInstitutionalOnboarding({ userData: { email: 'a@uned.es' }, callbackUrl: 'cb' }),
    ).rejects.toThrow(/Missing institution affiliation/i)
  })

  test('initiateInstitutionalOnboarding errors when no backend configured', async () => {
    const backend = await import('../institutionalBackend')
    backend.resolveInstitutionalBackendUrl.mockResolvedValueOnce(null)

    await expect(
      initiateInstitutionalOnboarding({
        userData: { email: 'a@uned.es', affiliation: 'uned.es' },
        callbackUrl: 'cb',
      }),
    ).rejects.toThrow(OnboardingErrorCode.NO_BACKEND)
  })

  test('initiateInstitutionalOnboarding calls backend and builds ceremonyUrl when missing', async () => {
    process.env.INSTITUTION_BACKEND_SP_API_KEY = 'test-key'
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessionId: 's1' }),
    })

    const result = await initiateInstitutionalOnboarding({
      userData: {
        email: 'a@uned.es',
        name: 'Alice',
        affiliation: 'uned.es',
        samlAssertion: 'base64-assertion',
        personalUniqueCode: 'puc',
      },
      callbackUrl: 'https://marketplace.example/callback',
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe('https://backend.example/onboarding/webauthn/options')
    expect(opts.method).toBe('POST')
    expect(opts.headers['X-SP-Api-Key']).toBe('test-key')
    const body = JSON.parse(opts.body)
    expect(body.stableUserId).toBe('puc')
    expect(body.samlAssertion).toBe('base64-assertion')
    expect(body.assertionReference).toBe('sha256:hash')

    expect(result.sessionId).toBe('s1')
    expect(result.ceremonyUrl).toBe('https://backend.example/onboarding/webauthn/ceremony/s1')
    expect(result.backendUrl).toBe('https://backend.example')
    expect(result.institutionId).toBe('uned.es')
  })

  test('checkOnboardingStatus handles missing params and 404 expired', async () => {
    await expect(checkOnboardingStatus({ sessionId: '', backendUrl: '' })).rejects.toThrow(/Missing sessionId/i)

    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 })
    const expired = await checkOnboardingStatus({ sessionId: 's1', backendUrl: 'https://backend.example' })
    expect(expired.status).toBe(OnboardingStatus.EXPIRED)
  })

  test('checkOnboardingStatus returns payload when ok', async () => {
    process.env.INSTITUTION_BACKEND_SP_API_KEY = 'test-key'
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: OnboardingStatus.SUCCESS, credentialId: 'cred' }),
    })

    const res = await checkOnboardingStatus({ sessionId: 's1', backendUrl: 'https://backend.example' })
    expect(res.status).toBe(OnboardingStatus.SUCCESS)
    expect(res.credentialId).toBe('cred')

    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.headers['X-SP-Api-Key']).toBe('test-key')
  })

  test('checkUserOnboardingStatus includes SP auth header when configured', async () => {
    process.env.INSTITUTION_BACKEND_SP_API_KEY = 'test-key'
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ registered: true, credentialId: 'cred-1' }),
    })

    const res = await checkUserOnboardingStatus({
      userData: { affiliation: 'uned.es', personalUniqueCode: 'puc' },
    })

    expect(res.isOnboarded).toBe(true)
    const [, opts] = global.fetch.mock.calls[0]
    expect(opts.headers['X-SP-Api-Key']).toBe('test-key')
  })

  test('initiateInstitutionalOnboarding throws when SP key required but missing', async () => {
    process.env.INSTITUTIONAL_REQUIRE_SP_API_KEY = 'true'

    await expect(
      initiateInstitutionalOnboarding({
        userData: { email: 'a@uned.es', affiliation: 'uned.es', personalUniqueCode: 'puc' },
        callbackUrl: 'https://marketplace.example/callback',
      }),
    ).rejects.toThrow(/Missing SP API key/i)
  })
})
