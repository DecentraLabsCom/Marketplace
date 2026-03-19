/**
 * Tests for GET /api/contract/lab/tokenOfOwnerByIndex
 * Auth-gated, requires wallet (isAddress) and index params.
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
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/lab/tokenOfOwnerByIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      tokenOfOwnerByIndex: jest.fn().mockResolvedValue(BigInt(42)),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('returns 400 when wallet is missing', async () => {
    const res = await GET(makeRequest({ index: '0' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing wallet/)
  })

  it('returns 400 when wallet is invalid', async () => {
    const res = await GET(makeRequest({ wallet: 'bad', index: '0' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when index is missing', async () => {
    const res = await GET(makeRequest({ wallet: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing index/)
  })

  it('returns 400 when index is negative', async () => {
    const res = await GET(makeRequest({ wallet: VALID_ADDR, index: '-1' }))
    expect(res.status).toBe(400)
  })

  it('returns labId on success', async () => {
    const res = await GET(makeRequest({ wallet: VALID_ADDR, index: '0' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.labId).toBe('42')
    expect(data.index).toBe(0)
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      tokenOfOwnerByIndex: jest.fn().mockRejectedValue(new Error('Index out of bounds')),
    })
    const res = await GET(makeRequest({ wallet: VALID_ADDR, index: '0' }))
    expect(res.status).toBe(500)
  })
})
