/**
 * Tests for GET /api/contract/institution/getTreasuryBalance
 *
 * Auth-gated, requires institutionAddress param with viem isAddress validation.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((err) => ({ status: err.statusCode || 401, body: { error: err.message } })),
}))
jest.mock('viem', () => ({
  isAddress: jest.fn((addr) => typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42),
}))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

const VALID_ADDR = '0xAbcDef1234567890abcdef1234567890AbcDef12'
function makeRequest(params = {}) {
  return { url: `http://localhost:3000/api/contract/institution/getTreasuryBalance?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/institution/getTreasuryBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      getInstitutionalTreasuryBalance: jest.fn().mockResolvedValue(BigInt(1000)),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('delegates to handleGuardError when unauthenticated', async () => {
    const err = new Error('Unauthorized'); err.name = 'UnauthorizedError'; err.statusCode = 401
    requireAuth.mockRejectedValue(err)
    await GET(makeRequest({ institutionAddress: VALID_ADDR }))
    expect(handleGuardError).toHaveBeenCalledWith(err)
  })

  it('returns 400 when institutionAddress is missing', async () => {
    const res = await GET(makeRequest())
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing institutionAddress/)
  })

  it('returns 400 when institutionAddress is not a valid address', async () => {
    const res = await GET(makeRequest({ institutionAddress: 'not-an-address' }))
    const data = await res.json()
    expect(res.status).toBe(400)
  })

  it('returns balance on success', async () => {
    const res = await GET(makeRequest({ institutionAddress: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.balance).toBe('1000')
    expect(data.institutionAddress).toBe(VALID_ADDR)
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getInstitutionalTreasuryBalance: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest({ institutionAddress: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toMatch(/Failed to fetch treasury balance/)
  })
})
