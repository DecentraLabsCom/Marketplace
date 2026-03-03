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
 *  - resolveGatewayBaseUrl: on-chain resolution and client-URL matching
 */

// ─── Mocks ──────────────────────────────────────────────────────────

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

const { getContractInstance } = require('@/app/api/contract/utils/contractInstance')

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
    delete process.env.ALLOWED_GATEWAY_ORIGINS
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
        expect(() => mod.normalizeGatewayBaseUrl('https://203.0.113.1')).not.toThrow()
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

    // ── ALLOWED_GATEWAY_ORIGINS ──

    describe('ALLOWED_GATEWAY_ORIGINS allowlist', () => {
      beforeEach(async () => {
        process.env.ALLOWED_GATEWAY_ORIGINS = 'https://gw1.example.com,https://gw2.example.com'
        jest.resetModules()
        mod = await import('../gatewayProxy')
      })

      test('allows URL whose origin is in the allowlist', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://gw1.example.com/auth')).not.toThrow()
      })

      test('rejects URL whose origin is NOT in the allowlist', () => {
        expect(() => mod.normalizeGatewayBaseUrl('https://evil.example.com')).toThrow(
          /ALLOWED_GATEWAY_ORIGINS/
        )
      })
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

  // ─── resolveGatewayBaseUrl ──────────────────────────────────────

  describe('resolveGatewayBaseUrl', () => {
    const mockContract = {
      getLabAuthURI: jest.fn(),
    }

    beforeEach(async () => {
      // Re-import to get fresh module, and re-establish mock
      jest.resetModules()
      const contractModule = await import('@/app/api/contract/utils/contractInstance')
      contractModule.getContractInstance.mockResolvedValue(mockContract)
      mockContract.getLabAuthURI.mockReset()
      mod = await import('../gatewayProxy')
    })

    test('returns normalised client URL when only gatewayUrl is provided (no labId)', async () => {
      const result = await mod.resolveGatewayBaseUrl({ gatewayUrl: 'https://gw.example.com/auth' })
      expect(result).toBe('https://gw.example.com')
    })

    test('throws when neither labId nor gatewayUrl', async () => {
      await expect(mod.resolveGatewayBaseUrl({})).rejects.toThrow(/Missing labId or gatewayUrl/)
    })

    test('resolves on-chain URI when labId is provided', async () => {
      mockContract.getLabAuthURI.mockResolvedValue('https://onchain-gw.example.com/auth')
      const result = await mod.resolveGatewayBaseUrl({ labId: '42' })
      expect(result).toBe('https://onchain-gw.example.com')
      expect(mockContract.getLabAuthURI).toHaveBeenCalledWith(42)
    })

    test('throws when on-chain URI is empty', async () => {
      mockContract.getLabAuthURI.mockResolvedValue('')
      await expect(mod.resolveGatewayBaseUrl({ labId: '1' })).rejects.toThrow(/no configured gateway/)
    })

    test('throws when client URL mismatches on-chain (requireLabMatch=true)', async () => {
      mockContract.getLabAuthURI.mockResolvedValue('https://real-gw.example.com/auth')
      await expect(
        mod.resolveGatewayBaseUrl({
          labId: '1',
          gatewayUrl: 'https://evil-gw.example.com',
          requireLabMatch: true,
        })
      ).rejects.toThrow(/does not match on-chain/)
    })

    test('accepts matching client URL + on-chain URL', async () => {
      mockContract.getLabAuthURI.mockResolvedValue('https://gw.example.com/auth')
      const result = await mod.resolveGatewayBaseUrl({
        labId: '1',
        gatewayUrl: 'https://gw.example.com/auth',
        requireLabMatch: true,
      })
      expect(result).toBe('https://gw.example.com')
    })

    test('rejects invalid (negative) labId', async () => {
      await expect(mod.resolveGatewayBaseUrl({ labId: '-1' })).rejects.toThrow(/Invalid labId/)
    })

    test('rejects non-numeric labId', async () => {
      await expect(mod.resolveGatewayBaseUrl({ labId: 'abc' })).rejects.toThrow(/Invalid labId/)
    })
  })
})
