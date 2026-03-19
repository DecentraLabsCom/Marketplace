/**
 * Tests for GET /api/contract/institution/getUserRemainingAllowance
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
  return { url: `http://localhost:3000/api/contract/institution/getUserRemainingAllowance?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/institution/getUserRemainingAllowance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      getInstitutionalUserRemainingAllowance: jest.fn().mockResolvedValue(BigInt(3000)),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('returns 400 when institutionAddress is missing', async () => {
    const res = await GET(makeRequest({ puc: 'test-puc' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing institutionAddress/)
  })

  it('returns 400 when puc is missing', async () => {
    const res = await GET(makeRequest({ institutionAddress: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing puc/)
  })

  it('returns 400 when address is invalid', async () => {
    const res = await GET(makeRequest({ institutionAddress: 'bad', puc: 'test-puc' }))
    expect((await res.json()).error).not.toBeUndefined()
    expect(res.status).toBe(400)
  })

  it('returns remaining allowance on success', async () => {
    const res = await GET(makeRequest({ institutionAddress: VALID_ADDR, puc: 'test-puc' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.remainingAllowance).toBe('3000')
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getInstitutionalUserRemainingAllowance: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest({ institutionAddress: VALID_ADDR, puc: 'test-puc' }))
    expect(res.status).toBe(500)
  })
})
