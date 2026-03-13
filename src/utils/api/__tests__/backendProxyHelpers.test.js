import { resolveBackendUrl, shouldUseServerToken, resolveForwardHeaders } from '../backendProxyHelpers'

describe('backendProxyHelpers', () => {
  const makeRequest = (params = {}, headers = {}) => {
    const searchParams = {
      get: (key) => params[key] || null
    }
    return {
      nextUrl: { searchParams },
      headers: { get: (key) => headers[key] || null }
    }
  }

  describe('resolveBackendUrl', () => {
    it('returns override from searchParams if present', () => {
      const req = makeRequest({ backendUrl: 'https://override.com' })
      expect(resolveBackendUrl(req)).toBe('https://override.com')
    })
    it('returns env var if no override', () => {
      process.env.INSTITUTION_BACKEND_URL = 'https://env.com'
      const req = makeRequest({})
      expect(resolveBackendUrl(req)).toBe('https://env.com')
    })
    it('returns null if neither present', () => {
      delete process.env.INSTITUTION_BACKEND_URL
      const req = makeRequest({})
      expect(resolveBackendUrl(req)).toBeNull()
    })
  })

  describe('shouldUseServerToken', () => {
    it('returns true if useServerToken=1', () => {
      const req = makeRequest({ useServerToken: '1' })
      expect(shouldUseServerToken(req)).toBe(true)
    })
    it('returns false otherwise', () => {
      const req = makeRequest({})
      expect(shouldUseServerToken(req)).toBe(false)
    })
  })

  describe('resolveForwardHeaders', () => {
    beforeEach(() => {
      jest.resetModules()
    })
    it('forwards valid client Authorization header', async () => {
      const req = makeRequest({}, { authorization: 'Bearer validtoken' })
      const headers = await resolveForwardHeaders(req)
      expect(headers.Authorization).toBe('Bearer validtoken')
    })
    it('generates server token if header is invalid or useServerToken=1', async () => {
      // Mock marketplaceJwtService
      jest.doMock('@/utils/auth/marketplaceJwt', () => ({
        generateIntentBackendToken: jest.fn().mockResolvedValue({ token: 'servertoken' })
      }))
      const { resolveForwardHeaders } = require('../backendProxyHelpers')
      const req = makeRequest({ useServerToken: '1' }, { authorization: 'Bearer validtoken' })
      const headers = await resolveForwardHeaders(req)
      expect(headers.Authorization).toBe('Bearer servertoken')
    })
    it('includes x-api-key from header or env', async () => {
      process.env.INSTITUTION_BACKEND_SP_API_KEY = 'envkey'
      const req1 = makeRequest({}, { 'x-api-key': 'headerkey' })
      const headers1 = await resolveForwardHeaders(req1)
      expect(headers1['x-api-key']).toBe('headerkey')
      const req2 = makeRequest({}, {})
      const headers2 = await resolveForwardHeaders(req2)
      expect(headers2['x-api-key']).toBe('envkey')
    })
  })
})
