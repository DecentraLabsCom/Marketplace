/**
 * Tests for GET /api/contract/reservation/reservationsOf
 * Auth-gated, native Response. Requires userAddress. returns reservationsCount.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((err) => ({ status: 401, body: { error: err.message } })),
}))
jest.mock('viem', () => ({
  isAddress: jest.fn((addr) => typeof addr === 'string' && addr.startsWith('0x') && addr.length === 42)
}))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

const VALID_ADDR = '0x1234567890abcdef1234567890abcdef12345678'
function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/reservation/reservationsOf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      reservationsOf: jest.fn().mockResolvedValue(BigInt(10)),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('handles auth errors', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized'))
    await GET(makeRequest({}))
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('returns 400 when missing or invalid userAddress', async () => {
    let res = await GET(makeRequest({}))
    expect(res.status).toBe(400)
    res = await GET(makeRequest({ userAddress: '0x1' })) // invalid length
    expect(res.status).toBe(400)
  })

  it('returns count on success', async () => {
    const res = await GET(makeRequest({ userAddress: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.count).toBe(10)
    expect(data.userAddress).toBe(VALID_ADDR)
  })

  it('returns 500 on generic internal error', async () => {
    getContractInstance.mockResolvedValue({
      reservationsOf: jest.fn().mockRejectedValue(new Error('RPC disconnected')),
    })
    const res = await GET(makeRequest({ userAddress: VALID_ADDR }))
    expect(res.status).toBe(500)
  })
})
