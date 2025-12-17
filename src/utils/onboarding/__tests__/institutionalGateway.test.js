import {
  resolveInstitutionalGatewayUrl,
  hasInstitutionalGateway,
  clearGatewayCache,
} from '../institutionalGateway'

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

describe('institutionalGateway', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    clearGatewayCache()
    process.env = { ...originalEnv }
    delete process.env.INSTITUTION_GATEWAYS
  })

  afterAll(() => {
    process.env = originalEnv
  })

  test('returns null when institutionId is missing', () => {
    process.env.INSTITUTION_GATEWAYS = JSON.stringify({ 'uned.es': 'https://gateway.uned.es' })
    expect(resolveInstitutionalGatewayUrl(null)).toBeNull()
    expect(resolveInstitutionalGatewayUrl('')).toBeNull()
  })

  test('resolves exact match and normalizes trailing slash', () => {
    process.env.INSTITUTION_GATEWAYS = JSON.stringify({ 'uned.es': 'https://gateway.uned.es/' })
    expect(resolveInstitutionalGatewayUrl('uned.es')).toBe('https://gateway.uned.es')
    expect(hasInstitutionalGateway('uned.es')).toBe(true)
  })

  test('resolves by base domain when subdomain provided', () => {
    process.env.INSTITUTION_GATEWAYS = JSON.stringify({ 'uned.es': 'https://gateway.uned.es' })
    expect(resolveInstitutionalGatewayUrl('mail.uned.es')).toBe('https://gateway.uned.es')
  })

  test('returns null if env var is missing or invalid JSON', () => {
    expect(resolveInstitutionalGatewayUrl('uned.es')).toBeNull()
    process.env.INSTITUTION_GATEWAYS = '{not-json'
    expect(resolveInstitutionalGatewayUrl('uned.es')).toBeNull()
  })

  test('uses cache after first resolution', () => {
    process.env.INSTITUTION_GATEWAYS = JSON.stringify({ 'uned.es': 'https://gateway.uned.es' })
    expect(resolveInstitutionalGatewayUrl('uned.es')).toBe('https://gateway.uned.es')
    process.env.INSTITUTION_GATEWAYS = JSON.stringify({ 'uned.es': 'https://changed.example' })
    expect(resolveInstitutionalGatewayUrl('uned.es')).toBe('https://gateway.uned.es')
  })
})

