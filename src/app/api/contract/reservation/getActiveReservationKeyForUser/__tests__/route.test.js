/**
 * Tests for GET /api/contract/reservation/getActiveReservationKeyForUser
 * Auth-gated, Returns reservationKey and hasActiveBooking boolean based on 0x0 value.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((err) => ({ status: 401, body: { error: err.message } })),
}))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

const VALID_ADDR = '0x1234567890abcdef1234567890abcdef12345678'
const ZERO_KEY = '0x0000000000000000000000000000000000000000000000000000000000000000'
const VALID_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/reservation/getActiveReservationKeyForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      getActiveReservationKeyForUser: jest.fn().mockResolvedValue(VALID_KEY),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('handles auth errors', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized'))
    await GET(makeRequest())
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('returns 400 when labId is missing', async () => {
    const res = await GET(makeRequest({ userAddress: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing labId/)
  })

  it('returns 400 when userAddress format is invalid', async () => {
    const res = await GET(makeRequest({ labId: '1', userAddress: 'invalid-address' }))
    const data = await res.json()
    expect(res.status).toBe(400)
  })

  it('returns key and hasActiveBooking=true when valid key is returned', async () => {
    const res = await GET(makeRequest({ labId: '1', userAddress: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.hasActiveBooking).toBe(true)
    expect(data.reservationKey).toBe(VALID_KEY)
  })

  it('returns hasActiveBooking=false when ZERO_KEY is returned', async () => {
    getContractInstance.mockResolvedValue({
      getActiveReservationKeyForUser: jest.fn().mockResolvedValue(ZERO_KEY),
    })
    const res = await GET(makeRequest({ labId: '1', userAddress: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.hasActiveBooking).toBe(false)
  })

  it('returns false instead of 500 when contract reverts', async () => {
    getContractInstance.mockResolvedValue({
      getActiveReservationKeyForUser: jest.fn().mockRejectedValue(Object.assign(new Error(), { code: 'CALL_EXCEPTION' })),
    })
    const res = await GET(makeRequest({ labId: '1', userAddress: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.hasActiveBooking).toBe(false)
  })
})
