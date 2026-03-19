/**
 * Tests for GET /api/contract/institution/resolve
 *
 * Pattern: Public GET, no auth, uses NextResponse.json, resolves wallet from domain.
 * Contains non-trivial domain normalization logic.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }))

function makeRequest(searchParams = {}) {
  return { url: `http://localhost:3000/api/contract/institution/resolve?${new URLSearchParams(searchParams)}` }
}

describe('GET /api/contract/institution/resolve', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getContractInstance.mockResolvedValue({
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0xABCDef1234567890abcdef1234567890abcdef12'),
      getSchacHomeOrganizationBackend: jest.fn().mockResolvedValue('http://test-backend.edu/auth/'),
    })
  })

  it('returns 400 when domain is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing domain parameter/)
  })

  it('returns 400 when domain is too short', async () => {
    const res = await GET(makeRequest({ domain: 'ab' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when domain contains invalid characters', async () => {
    const res = await GET(makeRequest({ domain: 'invalid_domain!' }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid character/)
  })

  it('normalizes uppercase domain before resolving', async () => {
    const contract = getContractInstance.mockResolvedValue({
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0xABCDef1234567890abcdef1234567890abcdef12'),
    })
    const res = await GET(makeRequest({ domain: 'EXAMPLE.EDU' }))
    expect(res.status).toBe(200)
    expect(res.body.domain).toBe('example.edu')
  })

  it('returns registered:true and wallet when domain resolves to valid address', async () => {
    const res = await GET(makeRequest({ domain: 'example.edu' }))
    expect(res.status).toBe(200)
    expect(res.body.registered).toBe(true)
    expect(res.body.wallet).not.toBeNull()
  })

  it('returns registered:false when wallet is zero address', async () => {
    getContractInstance.mockResolvedValue({
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x0000000000000000000000000000000000000000'),
    })
    const res = await GET(makeRequest({ domain: 'notregistered.edu' }))
    expect(res.status).toBe(200)
    expect(res.body.registered).toBe(false)
    expect(res.body.wallet).toBeNull()
  })

  it('strips trailing /auth from backendUrl', async () => {
    const res = await GET(makeRequest({ domain: 'example.edu' }))
    expect(res.status).toBe(200)
    expect(res.body.backendUrl).toBe('http://test-backend.edu')
    expect(res.body.hasBackend).toBe(true)
  })

  it('returns hasBackend:false when backend lookup throws', async () => {
    getContractInstance.mockResolvedValue({
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0xABCDef1234567890abcdef1234567890abcdef12'),
      getSchacHomeOrganizationBackend: jest.fn().mockRejectedValue(new Error('Backend not available')),
    })
    const res = await GET(makeRequest({ domain: 'example.edu' }))
    expect(res.status).toBe(200)
    expect(res.body.hasBackend).toBe(false)
  })

  it('returns 500 when contract call throws unexpectedly', async () => {
    getContractInstance.mockRejectedValue(new Error('Contract unavailable'))
    const res = await GET(makeRequest({ domain: 'example.edu' }))
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/Internal server error/)
  })
})
