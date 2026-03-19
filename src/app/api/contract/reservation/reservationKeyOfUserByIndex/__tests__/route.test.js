/**
 * Tests for GET /api/contract/reservation/reservationKeyOfUserByIndex
 * Auth-gated, native Response. Requires userAddress, index. Handles bounds error nicely.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((err) => ({ status: 401, body: { error: err.message } })),
}))
jest.mock('@/utils/dev/logger', () => {
  const m = { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { __esModule: true, default: m, devLog: m, log: m.log, warn: m.warn, error: m.error }
})
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

describe('GET /api/contract/reservation/reservationKeyOfUserByIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      reservationKeyOfUserByIndex: jest.fn().mockResolvedValue(BigInt(55555)),
      getReservation: jest.fn().mockResolvedValue({ status: 1 }), // Optional debug call
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('handles auth errors', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized'))
    await GET(makeRequest({}))
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('returns 400 when parameters are missing or invalid', async () => {
    let res = await GET(makeRequest({ index: '0' }))
    expect(res.status).toBe(400)
    res = await GET(makeRequest({ userAddress: VALID_ADDR }))
    expect(res.status).toBe(400)
    res = await GET(makeRequest({ userAddress: '0x1', index: '0' }))
    expect(res.status).toBe(400)
    res = await GET(makeRequest({ userAddress: VALID_ADDR, index: '-1' }))
    expect(res.status).toBe(400)
  })

  it('returns stringified reservation key on success and gracefully handles debug failure', async () => {
    getContractInstance.mockResolvedValue({
      reservationKeyOfUserByIndex: jest.fn().mockResolvedValue(BigInt(55555)),
      getReservation: jest.fn().mockRejectedValue(new Error('Debug RPC Error')),
    })
    const res = await GET(makeRequest({ userAddress: VALID_ADDR, index: '0' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.reservationKey).toBe('55555')
  })

  it('returns 400 when contract reverts with out of bounds', async () => {
    getContractInstance.mockResolvedValue({
      reservationKeyOfUserByIndex: jest.fn().mockRejectedValue(new Error('index out of range')),
    })
    const res = await GET(makeRequest({ userAddress: VALID_ADDR, index: '10' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Index out of range/)
  })

  it('returns 500 on generic internal error', async () => {
    getContractInstance.mockResolvedValue({
      reservationKeyOfUserByIndex: jest.fn().mockRejectedValue(new Error('RPC disconnected')),
    })
    const res = await GET(makeRequest({ userAddress: VALID_ADDR, index: '0' }))
    expect(res.status).toBe(500)
  })
})
