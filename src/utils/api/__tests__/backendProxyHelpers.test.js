import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { resolveBackendUrl, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'

jest.mock('@/utils/onboarding/institutionalBackend', () => ({
  resolveInstitutionalBackendUrl: jest.fn(),
}))

jest.mock('@/utils/auth/marketplaceJwt', () => ({
  __esModule: true,
  default: {
    generateIntentBackendToken: jest.fn(),
  },
}))

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn() },
}))

describe('backendProxyHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resolveInstitutionalBackendUrl.mockResolvedValue('https://trusted.example')
    marketplaceJwtService.generateIntentBackendToken.mockResolvedValue({ token: 'server-token' })
  })

  test('resolves the backend only from the authenticated institution', async () => {
    const session = { schacHomeOrganization: 'trusted.edu' }

    await expect(resolveBackendUrl(session)).resolves.toBe('https://trusted.example')
    expect(resolveInstitutionalBackendUrl).toHaveBeenCalledWith('trusted.edu')
  })

  test('generates a server-only status token', async () => {
    const headers = await resolveForwardHeaders('https://trusted.example')

    expect(marketplaceJwtService.generateIntentBackendToken).toHaveBeenCalledWith({
      scope: 'intents:status',
    })
    expect(headers.Authorization).toBe('Bearer server-token')
  })
})
