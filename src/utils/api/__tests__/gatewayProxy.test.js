/**
 * @jest-environment node
 */
/**
 * Unit tests for gatewayProxy — SSRF protection, URL normalization, and helper utilities.
 *
 * Tests cover:
 *  - GatewayValidationError construction
 *  - normalizeGatewayBaseUrl: protocol, format, private-IP blocking, path normalization
 *  - buildGatewayTargetUrl: path concatenation and query params
 *  - extractBearerHeader: Authorization header extraction
 *  - provider auth and lab access resolution from their distinct on-chain URIs
 */

// ─── Mocks ──────────────────────────────────────────────────────────

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}))

// ─── Helpers ────────────────────────────────────────────────────────

let originalNodeEnv

function setEnv(key, value) {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('gatewayProxy', () => {
  let mod

  beforeEach(async () => {
    jest.resetModules()
    originalNodeEnv = process.env.NODE_ENV
    mod = await import('../gatewayProxy')
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  // ─── GatewayValidationError ─────────────────────────────────────

  describe('GatewayValidationError', () => {
    test('constructs with message and default status 400', () => {
      const err = new mod.GatewayValidationError('bad request')
      expect(err.message).toBe('bad request')
      expect(err.status).toBe(400)
      expect(err.name).toBe('GatewayValidationError')
      expect(err).toBeInstanceOf(Error)
    })

    test('constructs with custom status', () => {
      const err = new mod.GatewayValidationError('not found', 404)
      expect(err.status).toBe(404)
    })
  })

  // ─── normalizeGatewayBaseUrl ────────────────────────────────────

  describe('normalizeGatewayBaseUrl', () => {
    test('accepts valid https URL', () => {
      expect(mod.normalizeGatewayBaseUrl('https://gateway.example.com')).toBe(
        'https://gateway.example.com'
      )
    })

    test('accepts valid http URL', () => {
      expect(mod.normalizeGatewayBaseUrl('http://gateway.example.com')).toBe(
        'http://gateway.example.com'
      )
    })

    test('strips trailing /auth suffix', () => {
      expect(mod.normalizeGatewayBaseUrl('https://gw.example.com/auth')).toBe(
        'https://gw.example.com'
      )
    })

    test('strips trailing /auth case-insensitively', () => {
      expect(mod.normalizeGatewayBaseUrl('https://gw.example.com/Auth')).toBe(
        'https://gw.example.com'
      )
    })

    test('preserves path before /auth', () => {
      expect(mod.normalizeGatewayBaseUrl('https://gw.example.com/lab/auth')).toBe(
        'https://gw.example.com/lab'
      )
    })

    test('strips trailing slashes', () => {
      expect(mod.normalizeGatewayBaseUrl('https://gw.example.com/')).toBe(
        'https://gw.example.com'
      )
    })

    test('rejects null / undefined / empty', () => {
      expect(() => mod.normalizeGatewayBaseUrl(null)).toThrow(mod.GatewayValidationError)
      expect(() => mod.normalizeGatewayBaseUrl(undefined)).toThrow(mod.GatewayValidationError)
      expect(() => mod.normalizeGatewayBaseUrl('')).toThrow(mod.GatewayValidationError)
    })

    test('rejects non-string input', () => {
      expect(() => mod.normalizeGatewayBaseUrl(42)).toThrow(mod.GatewayValidationError)
    })

    test('rejects invalid URL format', () => {
      expect(() => mod.normalizeGatewayBaseUrl('not-a-url')).toThrow(mod.GatewayValidationError)
    })

    test('rejects non-http(s) protocols', () => {
      expect(() => mod.normalizeGatewayBaseUrl('ftp://example.com')).toThrow(mod.GatewayValidationError)
      expect(() => mod.normalizeGatewayBaseUrl('file:///etc/passwd')).toThrow(mod.GatewayValidationError)
      expect(() => mod.normalizeGatewayBaseUrl('javascript:alert(1)')).toThrow(mod.GatewayValidationError)
    })

    // ── SSRF: Private IP blocking (production only) ──

    describe('SSRF — private IP blocking (production)', () => {
      beforeEach(async () => {
        process.env.NODE_ENV = 'production'
        jest.resetModules()
        mod = await import('../gatewayProxy')
      })

      test('blocks 10.x.x.x', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://10.0.0.1')).toThrow(/private network/)
      })

      test('blocks 172.16-31.x.x', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://172.16.0.1')).toThrow(/private network/)
        expect(() => mod.normalizeGatewayBaseUrl('https://172.31.255.255')).toThrow(/private network/)
      })

      test('allows 172.15.x.x (not in private range)', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://172.15.0.1')).not.toThrow()
      })

      test('blocks 192.168.x.x', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://192.168.1.1')).toThrow(/private network/)
      })

      test('blocks 127.x.x.x', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://127.0.0.1')).toThrow(/private network/)
      })

      test('blocks 169.254.x.x (link-local)', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://169.254.169.254')).toThrow(/private network/)
      })

      test('blocks localhost', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://localhost')).toThrow(/not allowed/)
      })

      test('blocks ::1 (IPv6 loopback)', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://[::1]')).toThrow(/private network/)
      })

      test('blocks fc00::/7 (IPv6 unique local)', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://[fc00::1]')).toThrow(/private network/)
        expect(() => mod.normalizeGatewayBaseUrl('https://[fd12:3456:789a::1]')).toThrow(/private network/)
      })

      test('blocks fe80::/10 (IPv6 link-local)', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://[fe80::1]')).toThrow(/private network/)
      })

      test('blocks ::ffff:0:0/96 (IPv4-mapped IPv6)', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://[::ffff:127.0.0.1]')).toThrow(/private network/)
        expect(() => mod.normalizeGatewayBaseUrl('https://[::ffff:7f00:1]')).toThrow(/private network/)
      })

      test('blocks .local domains', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://myhost.local')).toThrow(/not allowed/)
      })

      test('blocks .internal domains', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://myhost.internal')).toThrow(/not allowed/)
      })

      test('allows public IP addresses', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://8.8.8.8')).not.toThrow()
      })

      test('blocks reserved documentation addresses', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://203.0.113.1')).toThrow(/private network/)
      })

      test('allows public IPv6 addresses', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://[2001:4860:4860::8888]')).not.toThrow()
      })

      test('allows public hostnames', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://gateway.lab.example.com')).not.toThrow()
      })
    })

    describe('SSRF — private IPs allowed in development', () => {
      beforeEach(async () => {
        process.env.NODE_ENV = 'development'
        jest.resetModules()
        mod = await import('../gatewayProxy')
      })

      test('allows 10.x.x.x in development', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://10.0.0.1')).not.toThrow()
      })

      test('allows localhost in development', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://localhost')).not.toThrow()
      })

      test('allows 192.168.x.x in development', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://192.168.1.1')).not.toThrow()
      })
    })

  })

  describe('gatewayFetch DNS pinning and redirects', () => {
    let originalFetch
    let dnsLookup

    beforeEach(async () => {
      process.env.NODE_ENV = 'production'
      jest.resetModules()
      dnsLookup = require('node:dns/promises').lookup
      dnsLookup.mockReset()
      dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      originalFetch = global.fetch
      global.fetch = jest.fn()
      mod = await import('../gatewayProxy')
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    test('rejects a hostname if any DNS answer is private', async () => {
      dnsLookup.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.8', family: 4 },
      ])

      await expect(mod.gatewayFetch('https://gateway.example.com/fmu')).rejects.toThrow(
        /DNS resolves to a private/
      )
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('pins the validated DNS answer for the connection', async () => {
      global.fetch.mockResolvedValue({ status: 200, headers: new Headers() })

      await mod.gatewayFetch('https://gateway.example.com/fmu')

      expect(dnsLookup).toHaveBeenCalledWith('gateway.example.com', { all: true, verbatim: true })
      expect(global.fetch).toHaveBeenCalledWith(
        'https://gateway.example.com/fmu',
        expect.objectContaining({ redirect: 'manual', dispatcher: expect.any(Object) })
      )
    })

    test('returns the DNS answer in the shape required by Undici when all addresses are requested', () => {
      const callback = jest.fn()
      const lookup = mod.createPinnedLookup({ address: '93.184.216.34', family: 4 })

      lookup('gateway.example.com', { all: true }, callback)

      expect(callback).toHaveBeenCalledWith(null, [
        { address: '93.184.216.34', family: 4 },
      ])
    })

    test('rejects a cross-origin redirect', async () => {
      global.fetch.mockResolvedValue({
        status: 302,
        headers: new Headers({ location: 'https://other.example/fmu' }),
      })

      await expect(mod.gatewayFetch('https://gateway.example.com/fmu')).rejects.toThrow(
        /Cross-origin gateway redirects/
      )
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('revalidates DNS for each same-origin redirect', async () => {
      global.fetch
        .mockResolvedValueOnce({
          status: 302,
          headers: new Headers({ location: '/fmu/redirected' }),
        })
        .mockResolvedValueOnce({ status: 200, headers: new Headers() })

      await mod.gatewayFetch('https://gateway.example.com/fmu')

      expect(dnsLookup).toHaveBeenCalledTimes(2)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('institutionalBackendFetch', () => {
    let originalFetch
    let dnsLookup

    beforeEach(async () => {
      process.env.NODE_ENV = 'production'
      jest.resetModules()
      dnsLookup = require('node:dns/promises').lookup
      dnsLookup.mockReset()
      dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      originalFetch = global.fetch
      global.fetch = jest.fn().mockResolvedValue({ status: 200, headers: new Headers() })
      mod = await import('../gatewayProxy')
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    test('allows a public institutional backend without a static origin allowlist', async () => {
      jest.resetModules()
      dnsLookup = require('node:dns/promises').lookup
      dnsLookup.mockReset()
      dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
      mod = await import('../gatewayProxy')

      await expect(
        mod.institutionalBackendFetch('https://consumer.example.com/auth/checkin-institutional')
      ).resolves.toMatchObject({ status: 200 })
      expect(global.fetch).toHaveBeenCalled()
    })

    test('requires HTTPS in production', async () => {
      await expect(
        mod.institutionalBackendFetch('http://consumer.example.com/auth/checkin-institutional')
      ).rejects.toThrow(/HTTPS/)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('rejects private DNS answers before sending institutional credentials', async () => {
      dnsLookup.mockResolvedValue([{ address: '10.0.0.8', family: 4 }])

      await expect(
        mod.institutionalBackendFetch('https://consumer.example.com/auth/checkin-institutional')
      ).rejects.toThrow(/DNS resolves to a private/)
      expect(global.fetch).not.toHaveBeenCalled()
    })

    test('pins DNS and disables redirects for the credential-bearing request', async () => {
      await mod.institutionalBackendFetch(
        'https://consumer.example.com/auth/checkin-institutional',
        { method: 'POST', body: '{}' },
      )

      expect(global.fetch).toHaveBeenCalledWith(
        'https://consumer.example.com/auth/checkin-institutional',
        expect.objectContaining({
          method: 'POST',
          redirect: 'manual',
          dispatcher: expect.any(Object),
        }),
      )
    })

    test('does not follow even same-origin redirects with sensitive credentials', async () => {
      global.fetch.mockResolvedValue({
        status: 307,
        headers: new Headers({ location: '/auth/other' }),
      })

      await expect(
        mod.institutionalBackendFetch('https://consumer.example.com/auth/checkin-institutional', {
          method: 'POST',
          body: '{"marketplaceToken":"secret"}',
        })
      ).rejects.toThrow(/redirects are not allowed/)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    test('opens the backend circuit after repeated transient failures', async () => {
      global.fetch.mockResolvedValue({ status: 503, headers: new Headers() })
      const url = 'https://consumer.example.com/auth/checkin-institutional'

      await mod.institutionalBackendFetch(url)
      await mod.institutionalBackendFetch(url)
      await mod.institutionalBackendFetch(url)

      await expect(mod.institutionalBackendFetch(url)).rejects.toThrow(/circuit is open/)
      expect(global.fetch).toHaveBeenCalledTimes(3)
    })
  })

  // ─── buildGatewayTargetUrl ──────────────────────────────────────

  describe('buildGatewayTargetUrl', () => {
    test('concatenates base URL and path', () => {
      const url = mod.buildGatewayTargetUrl('https://gw.example.com', '/fmu/api/v1/simulations/run')
      expect(url).toBe('https://gw.example.com/fmu/api/v1/simulations/run')
    })

    test('handles base URL with trailing slash', () => {
      const url = mod.buildGatewayTargetUrl('https://gw.example.com/', '/api/run')
      expect(url).toBe('https://gw.example.com/api/run')
    })

    test('handles path without leading slash', () => {
      const url = mod.buildGatewayTargetUrl('https://gw.example.com', 'api/run')
      expect(url).toBe('https://gw.example.com/api/run')
    })

    test('appends query parameters', () => {
      const url = mod.buildGatewayTargetUrl('https://gw.example.com', '/api/describe', {
        fmuFileName: 'spring.fmu',
        labId: '42',
      })
      expect(url).toContain('fmuFileName=spring.fmu')
      expect(url).toContain('labId=42')
    })

    test('skips null/undefined/empty query values', () => {
      const url = mod.buildGatewayTargetUrl('https://gw.example.com', '/api/describe', {
        fmuFileName: 'test.fmu',
        labId: null,
        empty: '',
        missing: undefined,
      })
      expect(url).toContain('fmuFileName=test.fmu')
      expect(url).not.toContain('labId')
      expect(url).not.toContain('empty')
      expect(url).not.toContain('missing')
    })

    test('handles no query parameter', () => {
      const url = mod.buildGatewayTargetUrl('https://gw.example.com', '/api/run', null)
      expect(url).toBe('https://gw.example.com/api/run')
    })
  })

  // ─── extractBearerHeader ────────────────────────────────────────

  describe('extractBearerHeader', () => {
    test('extracts valid Bearer token', () => {
      const request = { headers: { get: (name) => name.toLowerCase() === 'authorization' ? 'Bearer abc123' : null } }
      expect(mod.extractBearerHeader(request)).toBe('Bearer abc123')
    })

    test('returns null when no Authorization header', () => {
      const request = { headers: { get: () => null } }
      expect(mod.extractBearerHeader(request)).toBeNull()
    })

    test('returns null for non-Bearer authorization', () => {
      const request = { headers: { get: (name) => name.toLowerCase() === 'authorization' ? 'Basic dXNlcjpwYXNz' : null } }
      expect(mod.extractBearerHeader(request)).toBeNull()
    })
  })

  // ─── Provider auth and lab access resolution ───────────────────

  describe('provider auth and lab access resolvers', () => {
    const mockContract = {
      getLabAuthURI: jest.fn(),
      getLabAccessURI: jest.fn(),
    }

    beforeEach(async () => {
      // Re-import to get fresh module, and re-establish mock
      jest.resetModules()
      const contractModule = await import('@/app/api/contract/utils/contractInstance')
      contractModule.getContractInstance.mockResolvedValue(mockContract)
      mockContract.getLabAuthURI.mockReset()
      mockContract.getLabAccessURI.mockReset()
      mod = await import('../gatewayProxy')
    })

    test('resolves provider auth and resource access through different actors', async () => {
      mockContract.getLabAuthURI.mockResolvedValue('https://full.institution.example/auth')
      mockContract.getLabAccessURI.mockResolvedValue('https://lite.lab.example/fmu')

      await expect(mod.resolveProviderAuthBackend({ labId: '42' }))
        .resolves.toBe('https://full.institution.example')
      await expect(mod.resolveLabAccessGateway({ labId: '42' }))
        .resolves.toBe('https://lite.lab.example')

      expect(mockContract.getLabAuthURI).toHaveBeenCalledWith(42)
      expect(mockContract.getLabAccessURI).toHaveBeenCalledWith(42)
    })

    test('allows a validated access URI before a new lab has an on-chain id', async () => {
      await expect(mod.resolveLabAccessGateway({
        gatewayUrl: 'https://lite.lab.example/fmu',
      })).resolves.toBe('https://lite.lab.example')
      expect(mockContract.getLabAuthURI).not.toHaveBeenCalled()
      expect(mockContract.getLabAccessURI).not.toHaveBeenCalled()
    })

    test('rejects an empty provider auth URI', async () => {
      mockContract.getLabAuthURI.mockResolvedValue('')
      await expect(mod.resolveProviderAuthBackend({ labId: '1' })).rejects.toThrow(/auth URI/)
    })

    test('rejects an empty lab access URI', async () => {
      mockContract.getLabAccessURI.mockResolvedValue('')
      await expect(mod.resolveLabAccessGateway({ labId: '1' })).rejects.toThrow(/access URI/)
    })

    test('validates the provider endpoint against authURI', async () => {
      mockContract.getLabAuthURI.mockResolvedValue('https://full.institution.example/auth')
      await expect(
        mod.resolveProviderAuthBackend({
          labId: '1',
          gatewayUrl: 'https://lite.lab.example/fmu',
          requireLabMatch: true,
        })
      ).rejects.toThrow(/does not match on-chain/)
    })

    test('validates the resource endpoint against accessURI and returns its gateway origin', async () => {
      mockContract.getLabAccessURI.mockResolvedValue('https://lite.lab.example/fmu')
      const result = await mod.resolveLabAccessGateway({
        labId: '1',
        gatewayUrl: 'https://lite.lab.example/fmu/',
        requireLabMatch: true,
      })
      expect(result).toBe('https://lite.lab.example')
    })

    test('does not accept a same-origin but different resource path', async () => {
      mockContract.getLabAccessURI.mockResolvedValue('https://lite.lab.example/fmu')
      await expect(mod.resolveLabAccessGateway({
        labId: '1',
        gatewayUrl: 'https://lite.lab.example/guacamole',
      })).rejects.toThrow(/does not match on-chain/)
    })

    test.each(['-1', 'abc', '1.5'])('rejects invalid labId %s', async (labId) => {
      await expect(mod.resolveLabAccessGateway({ labId })).rejects.toThrow(/Invalid labId/)
    })
  })
})
