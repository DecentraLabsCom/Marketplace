/**
 * Tests for GET /api/contract/institution/getActiveReservationKey
 * Session-derived institution + puc, requires ?labId= param.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { resolveInstitutionAddressFromSession, getSessionPuc } from '../../../utils/institutionSession'
import { BadRequestError, handleGuardError, requireAuth } from '@/utils/auth/guards'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('../../../utils/institutionSession', () => ({
  resolveInstitutionAddressFromSession: jest.fn(),
  getSessionPuc: jest.fn(),
}))
jest.mock('@/utils/auth/guards', () => {
  class BadRequestError extends Error { constructor(msg) { super(msg); this.name = 'BadRequestError'; this.statusCode = 400 } }
  return {
    BadRequestError,
    requireAuth: jest.fn(),
    handleGuardError: jest.fn((err) => ({ status: err.statusCode || 400, body: { error: err.message } })),
  }
})

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'
const VALID_KEY = '0x' + 'ab'.repeat(32)

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/institution/getActiveReservationKey', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({ samlAssertion: 'mock' })
    resolveInstitutionAddressFromSession.mockResolvedValue({ institutionAddress: '0xInstitution', normalizedDomain: 'test.edu' })
    getSessionPuc.mockReturnValue('mock-puc')
    getContractInstance.mockResolvedValue({
      getInstitutionalUserActiveReservationKey: jest.fn().mockResolvedValue(VALID_KEY),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('throws BadRequestError (handled) when labId is missing', async () => {
    await GET(makeRequest())
    expect(handleGuardError).toHaveBeenCalledWith(expect.objectContaining({ name: 'BadRequestError' }))
  })

  it('throws BadRequestError when labId is invalid', async () => {
    await GET(makeRequest({ labId: 'abc' }))
    expect(handleGuardError).toHaveBeenCalledWith(expect.objectContaining({ name: 'BadRequestError' }))
  })

  it('returns reservation key and hasActiveReservation=true on success', async () => {
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.reservationKey).toBe(VALID_KEY)
    expect(data.hasActiveReservation).toBe(true)
    expect(data.labId).toBe(1)
  })

  it('returns hasActiveReservation=false when key is zero', async () => {
    getContractInstance.mockResolvedValue({
      getInstitutionalUserActiveReservationKey: jest.fn().mockResolvedValue(ZERO_BYTES32),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(data.hasActiveReservation).toBe(false)
  })

  it('returns 500 on unexpected error', async () => {
    getContractInstance.mockResolvedValue({
      getInstitutionalUserActiveReservationKey: jest.fn().mockRejectedValue(new Error('RPC')),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toMatch(/Failed to get active reservation key/)
  })
})
